package rewards

import (
	"errors"
	"log"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/users"
	"runbonus/api/internal/util"
)

// RegisterProgress — модуль progress: /api/me, /api/rewards/progress, /api/leaderboard.
func RegisterProgress(r chi.Router) {
	r.With(auth.User).Get("/api/me", httpx.H("Ошибка загрузки профиля", me))
	r.With(auth.User, auth.ActiveUser).Get("/api/rewards/progress", httpx.H("Не удалось загрузить прогресс", func(w http.ResponseWriter, r *http.Request) error {
		p, err := Progress(r.Context(), auth.UserID(r))
		if err != nil {
			return err
		}
		httpx.OK(w, p)
		return nil
	}))
	r.With(auth.User).Get("/api/leaderboard", httpx.H("Не удалось загрузить рейтинг", leaderboard))
}

// RegisterRewards — модуль rewards: контрольные точки и выбор награды.
func RegisterRewards(r chi.Router) {
	r.Route("/api/rewards", func(r chi.Router) {
		r.Use(auth.User, auth.ActiveUser)
		r.Get("/milestones", func(w http.ResponseWriter, r *http.Request) {
			p, err := Progress(r.Context(), auth.UserID(r))
			if err == nil {
				httpx.OK(w, p["milestones"])
				return
			}
			log.Println("[rewards/milestones]", err)
			list, err := ListActiveMilestones(r.Context())
			if err != nil {
				httpx.JSON(w, 500, httpx.M{"error": "Не удалось загрузить контрольные точки"})
				return
			}
			httpx.OK(w, list)
		})
		r.Get("/milestones/{id}", func(w http.ResponseWriter, r *http.Request) {
			data, err := MilestoneOptions(r.Context(), auth.UserID(r), chi.URLParam(r, "id"))
			if err != nil {
				status := 400
				var ce *codedErr
				if errors.As(err, &ce) && ce.Code == "NOT_FOUND" {
					status = 404
				}
				httpx.JSON(w, status, httpx.M{"error": err.Error()})
				return
			}
			httpx.OK(w, data)
		})
		r.Get("/my", httpx.H("Не удалось загрузить награды", func(w http.ResponseWriter, r *http.Request) error {
			items, err := MyRewards(r.Context(), auth.UserID(r))
			if err != nil {
				return err
			}
			httpx.OK(w, items)
			return nil
		}))
		r.Post("/select", selectHandler)
	})
}

var selectStatus = map[string]int{
	"LOCKED": 403, "ALREADY_SELECTED": 409, "OUT_OF_STOCK": 409, "SIZE_REQUIRED": 400,
	"NO_SHOE": 403, "BLOCKED": 403, "NOT_FOUND": 404, "INVALID_REWARD": 400,
}

var sqlLeak = regexp.MustCompile(`(?i)Table |ER_|SQLSYNTAX|doesn't exist|Duplicate entry|Error \d{4}`)

func selectHandler(w http.ResponseWriter, r *http.Request) {
	b := httpx.BodyOf(r)
	mid, rid := b.Raw("milestoneId"), b.Raw("rewardId")
	if !httpx.Truthy(mid) || !httpx.Truthy(rid) {
		httpx.JSON(w, 400, httpx.M{"error": "Укажите milestoneId и rewardId"})
		return
	}
	data, err := Select(r.Context(), auth.UserID(r), SelectInput{
		MilestoneID: int64(db.ToFloat(httpx.ToString(mid))), RewardID: int64(db.ToFloat(httpx.ToString(rid))),
		Size: b.Str("size"), Color: b.Str("color"), Phone: b.Str("phone"), Address: b.Str("address"), City: b.Str("city"),
	})
	if err == nil {
		httpx.OK(w, data)
		return
	}
	var ce *codedErr
	code, status := "", 400
	if errors.As(err, &ce) {
		code = ce.Code
		if s, ok := selectStatus[code]; ok {
			status = s
		}
	} else {
		log.Println("[rewards/select]", err)
	}
	msg := err.Error()
	if _, known := selectStatus[code]; !known && (msg == "" || sqlLeak.MatchString(msg)) {
		msg = "Не удалось выбрать награду"
	}
	body := httpx.M{"error": msg}
	if code != "" {
		body["code"] = code
	}
	httpx.JSON(w, status, body)
}

func me(w http.ResponseWriter, r *http.Request) error {
	ctx, uid := r.Context(), auth.UserID(r)
	u, err := db.One(ctx, db.Pool, `SELECT id, name, first_name, last_name, phone, city, avatar_url, total_distance_km, status FROM users WHERE id = ?`, uid)
	if err != nil {
		return err
	}
	if u == nil {
		return httpx.E(404, "Не найден")
	}
	var progress any
	confirmed := u.Float("total_distance_km")
	if p, err := Progress(ctx, uid); err == nil {
		progress = p
		confirmed = p["totalDistance"].(float64)
	} else {
		log.Println("[me] rewards progress", err)
	}
	httpx.OK(w, httpx.M{
		"id": u["id"], "name": u["name"], "first_name": u["first_name"], "last_name": u["last_name"],
		"phone": u["phone"], "email": nil, "city": u["city"], "avatar_url": u["avatar_url"],
		"total_confirmed_distance": confirmed, "rewards": progress,
	})
	return nil
}

var fakeLeaders = []struct {
	id   int64
	name string
	km   float64
}{{-200, "Рустам", 200}, {-150, "Зарина", 150}, {-100, "Дилшод", 100}}

func leaderboard(w http.ResponseWriter, r *http.Request) error {
	limit := int(math.Min(50, math.Max(1, db.ToFloat(r.URL.Query().Get("limit")))))
	if db.ToFloat(r.URL.Query().Get("limit")) == 0 {
		limit = 20
	}
	rows, err := db.Query(r.Context(), db.Pool, `SELECT u.id, u.name, u.first_name, u.last_name, u.avatar_url,
			COALESCE(SUM(w.distance_km), 0) AS total_km
		FROM users u
		INNER JOIN workouts w ON w.user_id = u.id AND w.status = 'approved'
		WHERE u.status = 'active'
		GROUP BY u.id, u.name, u.first_name, u.last_name, u.avatar_url
		ORDER BY total_km DESC, u.id ASC
		LIMIT ?`, max(limit, 50))
	if err != nil {
		return err
	}
	type entry struct {
		id     int64
		name   any
		avatar any
		km     float64
		fake   bool
	}
	var merged []entry
	for _, row := range rows {
		full := users.BuildDisplayName(row.Str("first_name"), row.Str("last_name"))
		name := util.FirstNonEmpty(full, strings.TrimSpace(row.Str("name")))
		merged = append(merged, entry{row.Int("id"), util.NilIfEmpty(name), users.NormalizeAvatarURL(row["avatar_url"]), util.Round(row.Float("total_km"), 2), false})
	}
	for _, f := range fakeLeaders {
		merged = append(merged, entry{f.id, f.name, nil, f.km, true})
	}
	sort.SliceStable(merged, func(i, j int) bool {
		if merged[i].km != merged[j].km {
			return merged[i].km > merged[j].km
		}
		return merged[i].id < merged[j].id
	})
	if len(merged) > limit {
		merged = merged[:limit]
	}
	items := make([]httpx.M, 0, len(merged))
	var meItem httpx.M
	uid := auth.UserID(r)
	for i, e := range merged {
		var name any
		label := ""
		if s, _ := e.name.(string); strings.TrimSpace(s) != "" {
			name, label = strings.TrimSpace(s), strings.TrimSpace(s)
		} else {
			label = httpx.ToString(float64(e.id))
		}
		item := httpx.M{"rank": i + 1, "id": e.id, "clientId": e.id, "name": name, "label": label,
			"avatar_url": e.avatar, "totalKm": util.Round(e.km, 2), "fake": e.fake}
		items = append(items, item)
		if meItem == nil && e.id == uid {
			meItem = httpx.M{}
			for k, v := range item {
				meItem[k] = v
			}
			meItem["inTop"] = true
		}
	}
	var meVal any
	if meItem != nil {
		meVal = meItem
	}
	httpx.OK(w, httpx.M{"items": items, "me": meVal, "limit": limit})
	return nil
}
