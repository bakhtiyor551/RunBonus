// Package ads — реклама в мобильном приложении: AdMob-конфиг, баннеры партнёров, события.
package ads

import (
	"context"
	"log"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/rewards"

	"github.com/golang-jwt/jwt/v5"
)

type settings struct {
	PartnerAds, AdmobEnabled, AdmobTest bool
	ImpressionCost                      float64
	AppID                               string
	Units                               map[string]string
}

var unitKeys = []string{"admob_google_home", "admob_google_workout", "admob_google_shop", "admob_play_home", "admob_play_workout", "admob_play_shop"}

func loadSettings(ctx context.Context) (settings, error) {
	s := settings{PartnerAds: true, AdmobEnabled: true, ImpressionCost: 0.01, Units: map[string]string{}}
	row, err := db.One(ctx, db.Pool, "SELECT * FROM ad_settings WHERE id = 1")
	if db.IsNoTable(err) || (err == nil && row == nil) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	s.PartnerAds, s.AdmobEnabled, s.AdmobTest = row.Bool("partner_ads_enabled"), row.Bool("admob_enabled"), row.Bool("admob_test_mode")
	if c := row.Float("impression_cost"); c != 0 {
		s.ImpressionCost = c
	}
	s.AppID = strings.TrimSpace(row.Str("admob_app_id"))
	for _, k := range unitKeys {
		s.Units[k] = strings.TrimSpace(row.Str(k))
	}
	return s, nil
}

func mobileConfig(ctx context.Context) (httpx.M, error) {
	s, err := loadSettings(ctx)
	if err != nil {
		return nil, err
	}
	u := s.Units
	return httpx.M{
		"admob_enabled": s.AdmobEnabled, "admob_test_mode": s.AdmobTest, "admob_app_id": s.AppID,
		"units": httpx.M{
			"google": httpx.M{"home": u["admob_google_home"], "workout": u["admob_google_workout"], "shop": u["admob_google_shop"]},
			"play":   httpx.M{"home": u["admob_play_home"], "workout": u["admob_play_workout"], "shop": u["admob_play_shop"]},
		},
		"partner_ads_enabled": s.PartnerAds,
	}, nil
}

func listOf(v any) []any {
	l, ok := rewards.ParseList(v)
	if !ok {
		return []any{}
	}
	return l
}

func mapCampaign(r db.Row) httpx.M {
	m := httpx.M{}
	for k, v := range r {
		m[k] = v
	}
	num := func(k string) any {
		if r[k] == nil {
			return nil
		}
		return r.Float(k)
	}
	m["tariff_id"], m["tariff_name"], m["tariff_days"], m["tariff_price"] = num("tariff_id"), nilEmpty(r.Str("tariff_name")), num("tariff_days"), num("tariff_price")
	m["audience_cities"], m["audience_levels"], m["audience_activity"] = listOf(r["audience_cities"]), listOf(r["audience_levels"]), listOf(r["audience_activity"])
	m["budget"], m["spent"] = r.Float("budget"), r.Float("spent")
	return m
}

func nilEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func banners(ctx context.Context, placement string, city string) ([]httpx.M, error) {
	if _, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM advertisers LIMIT 1"); db.IsNoTable(err) {
		return []httpx.M{}, nil
	}
	s, err := loadSettings(ctx)
	if err != nil || !s.PartnerAds {
		return []httpx.M{}, err
	}
	types := []any{"banner_home", "promo"}
	if placement == "banner_workout" {
		types = []any{"banner_workout", "promo"}
	}
	primary := types[0]
	rows, err := db.Query(ctx, db.Pool, `SELECT c.id, c.title, c.description, c.banner_url, c.target_url, c.ad_type,
			c.audience_cities, c.audience_levels, c.audience_activity
		FROM ad_campaigns c
		WHERE c.status = 'active' AND c.ad_type IN (?, ?)
		  AND c.start_date <= CURDATE() AND c.end_date >= CURDATE()
		  AND c.banner_url IS NOT NULL AND TRIM(c.banner_url) != ''
		ORDER BY (c.ad_type = ?) DESC, c.id DESC LIMIT 5`, types[0], types[1], primary)
	if err != nil {
		return nil, err
	}
	var mapped, matched, generic []httpx.M
	for _, r := range rows {
		c := mapCampaign(r)
		mapped = append(mapped, c)
		cities := c["audience_cities"].([]any)
		ok := true
		if len(cities) > 0 && city != "" {
			ok = false
			for _, x := range cities {
				if x == city {
					ok = true
				}
			}
		}
		if ok {
			matched = append(matched, c)
		}
		if len(cities) == 0 {
			generic = append(generic, c)
		}
	}
	list := matched
	if len(list) == 0 {
		list = generic
	}
	if list == nil {
		list = []httpx.M{}
	}
	sort.SliceStable(list, func(i, j int) bool {
		ai, bj := list[i]["ad_type"] == primary, list[j]["ad_type"] == primary
		if ai != bj {
			return ai
		}
		return db.ToFloat(list[i]["id"]) > db.ToFloat(list[j]["id"])
	})
	return list, nil
}

// optionalUserID — id из токена, если он валиден; иначе 0 (событие без пользователя).
func optionalUserID(r *http.Request) int64 {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return 0
	}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(h[7:], claims, func(*jwt.Token) (any, error) { return []byte(config.C.JWTSecret), nil },
		jwt.WithValidMethods([]string{"HS256"})); err != nil {
		return 0
	}
	return int64(db.ToFloat(claims["userId"]))
}

func Register(r chi.Router) {
	r.Get("/api/mobile/ads/config", func(w http.ResponseWriter, r *http.Request) {
		cfg, err := mobileConfig(r.Context())
		if err != nil {
			log.Println("[ads/config]", err)
			cfg = httpx.M{"admob_enabled": true, "admob_test_mode": false, "admob_app_id": "",
				"units": httpx.M{"google": httpx.M{}, "play": httpx.M{}}, "partner_ads_enabled": true}
		}
		httpx.OK(w, cfg)
	})
	r.Get("/api/mobile/ads/banners", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		placement := r.URL.Query().Get("placement")
		if placement == "" {
			placement = "banner_home"
		}
		city := strings.TrimSpace(r.URL.Query().Get("city"))
		if uid := optionalUserID(r); uid != 0 && city == "" {
			if u, err := db.One(ctx, db.Pool, "SELECT city FROM users WHERE id = ?", uid); err == nil && u != nil {
				city = strings.TrimSpace(u.Str("city"))
			}
		}
		list, err := banners(ctx, placement, city)
		if err != nil {
			log.Println("[ads/banners]", err)
			list = []httpx.M{}
		}
		httpx.OK(w, list)
	})
	r.Post("/api/mobile/ads/event", httpx.H("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		ctx, b := r.Context(), httpx.BodyOf(r)
		campaign, event := b.Raw("campaign_id"), b.Str("event_type")
		if !httpx.Truthy(campaign) || (event != "impression" && event != "click" && event != "open") {
			return httpx.E(400, "Некорректные данные")
		}
		if _, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM advertisers LIMIT 1"); !db.IsNoTable(err) {
			var uid any
			if id := optionalUserID(r); id != 0 {
				uid = id
			}
			if _, _, err := db.Exec(ctx, db.Pool, "INSERT INTO ad_statistics (campaign_id, user_id, event_type) VALUES (?,?,?)", httpx.ToString(campaign), uid, event); err != nil {
				return err
			}
			if event == "impression" {
				if s, err := loadSettings(ctx); err == nil && s.ImpressionCost > 0 {
					_, _, _ = db.Exec(ctx, db.Pool, "UPDATE ad_campaigns SET spent = spent + ? WHERE id = ?", s.ImpressionCost, httpx.ToString(campaign))
				}
			}
		}
		httpx.OK(w, httpx.M{"ok": true})
		return nil
	}))
}
