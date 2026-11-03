package admin

import (
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/rewards"
	"runbonus/api/internal/users"
	"runbonus/api/internal/util"
)

// raw — как catch (e) => res.status(status).json({ error: e.message }) в Node.
func raw(status int, fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			if he, ok := err.(*httpx.Error); ok {
				httpx.WriteError(w, r, he, "")
				return
			}
			httpx.JSON(w, status, httpx.M{"error": err.Error()})
		}
	}
}

func upsertVariants(r *http.Request, rewardID float64) error {
	for _, v := range httpx.BodyOf(r).List("stock_variants") {
		m, _ := v.(map[string]any)
		b := httpx.Body(m)
		if err := rewards.UpsertStock(r.Context(), rewardID, b.Str("size"), b.Str("color"), b.Float("quantity")); err != nil {
			return err
		}
	}
	return nil
}

func queryMap(r *http.Request) map[string]string {
	out := map[string]string{}
	for k, v := range r.URL.Query() {
		if len(v) > 0 {
			out[k] = v[0]
		}
	}
	return out
}

func registerRewards(r chi.Router) {
	r.Get("/stats", raw(500, func(w http.ResponseWriter, r *http.Request) error {
		s, err := rewards.Stats(r.Context())
		if err != nil {
			return err
		}
		return ok(w, s)
	}))
	r.Get("/milestones", raw(500, func(w http.ResponseWriter, r *http.Request) error {
		l, err := rewards.AdminMilestones(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	saveMilestone := func(id int64) http.HandlerFunc {
		return raw(400, func(w http.ResponseWriter, r *http.Request) error {
			b := httpx.BodyOf(r)
			newID, err := rewards.SaveMilestone(r.Context(), b, id)
			if err != nil {
				return err
			}
			if ids, isList := b["reward_ids"].([]any); isList {
				if err := rewards.SetMilestoneRewards(r.Context(), newID, ids); err != nil {
					return err
				}
			}
			if id != 0 {
				return ok(w, httpx.M{"ok": true})
			}
			return created(w, httpx.M{"id": newID})
		})
	}
	r.Post("/milestones", func(w http.ResponseWriter, r *http.Request) { saveMilestone(0)(w, r) })
	r.Put("/milestones/{id}", func(w http.ResponseWriter, r *http.Request) { saveMilestone(int64(idParam(r)))(w, r) })

	r.Get("/catalog", raw(500, func(w http.ResponseWriter, r *http.Request) error {
		l, err := rewards.AdminCatalog(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/catalog", raw(400, func(w http.ResponseWriter, r *http.Request) error {
		id, err := rewards.SaveReward(r.Context(), httpx.BodyOf(r), 0)
		if err != nil {
			return err
		}
		if err := upsertVariants(r, float64(id)); err != nil {
			return err
		}
		return created(w, httpx.M{"id": id})
	}))
	r.Put("/catalog/{id}", raw(400, func(w http.ResponseWriter, r *http.Request) error {
		id := idParam(r)
		if _, err := rewards.SaveReward(r.Context(), httpx.BodyOf(r), int64(id)); err != nil {
			return err
		}
		if err := upsertVariants(r, id); err != nil {
			return err
		}
		return ok(w, httpx.M{"ok": true})
	}))
	r.Put("/stock", raw(400, func(w http.ResponseWriter, r *http.Request) error {
		b := httpx.BodyOf(r)
		if err := rewards.UpsertStock(r.Context(), b.Float("reward_id"), b.Str("size"), b.Str("color"), b.Float("quantity")); err != nil {
			return err
		}
		return ok(w, httpx.M{"ok": true})
	}))

	r.Get("/user-rewards", raw(500, func(w http.ResponseWriter, r *http.Request) error {
		l, err := rewards.UserRewards(r.Context(), queryMap(r))
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Put("/user-rewards/{id}/status", raw(400, func(w http.ResponseWriter, r *http.Request) error {
		b := httpx.BodyOf(r)
		row, err := rewards.UpdateUserRewardStatus(r.Context(), int64(idParam(r)), b.Str("status"), b.Raw("admin_comment"), b.Raw("tracking_number"))
		if err != nil {
			return err
		}
		if row == nil {
			return ok(w, httpx.M{"ok": true})
		}
		return ok(w, row)
	}))
	r.Put("/user-rewards/{id}/change", raw(400, func(w http.ResponseWriter, r *http.Request) error {
		b := httpx.BodyOf(r)
		if err := rewards.ChangeReward(r.Context(), int64(idParam(r)), b.Float("reward_id"), b.Str("size"), b.Str("comment")); err != nil {
			return err
		}
		return ok(w, httpx.M{"ok": true})
	}))
	r.Get("/promos", raw(500, func(w http.ResponseWriter, r *http.Request) error {
		l, err := rewards.PromoCodes(r.Context(), r.URL.Query().Get("status"))
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/users/{userId}/sync", raw(400, func(w http.ResponseWriter, r *http.Request) error {
		ctx := r.Context()
		uid := int64(db.ToFloat(chi.URLParam(r, "userId")))
		total, err := users.ConfirmedDistanceKm(ctx, db.Pool, uid)
		if err != nil {
			return err
		}
		unlocked, err := rewards.UnlockMilestones(ctx, db.Pool, uid)
		if err != nil {
			return err
		}
		if unlocked == nil {
			unlocked = []db.Row{}
		}
		return ok(w, httpx.M{"totalDistance": total, "unlocked": unlocked})
	}))
	r.Post("/gift", gift)
}

func gift(w http.ResponseWriter, r *http.Request) {
	ctx, b := r.Context(), httpx.BodyOf(r)
	uid := int64(b.Float("user_id"))
	if uid == 0 {
		phone := util.NormalizePhone(b.Str("phone"))
		if phone == "" {
			phone = util.Digits(b.Str("phone"))
		}
		if phone == "" {
			httpx.JSON(w, 400, httpx.M{"error": "Укажите телефон клиента или user_id"})
			return
		}
		with992, without := phone, phone
		if strings.HasPrefix(phone, "992") {
			without = phone[3:]
		} else {
			with992 = "992" + phone
		}
		u, err := db.One(ctx, db.Pool, "SELECT id, name, phone FROM users WHERE phone IN (?, ?, ?) LIMIT 1", phone, with992, without)
		if err != nil {
			httpx.JSON(w, 400, httpx.M{"error": err.Error()})
			return
		}
		if u == nil {
			httpx.JSON(w, 404, httpx.M{"error": "Клиент с таким телефоном не найден"})
			return
		}
		uid = u.Int("id")
	}
	if !httpx.Truthy(b.Raw("milestone_id")) {
		httpx.JSON(w, 400, httpx.M{"error": "Укажите контрольную точку (milestone_id)"})
		return
	}
	res, err := rewards.Gift(ctx, rewards.GiftInput{
		UserID: uid, MilestoneID: int64(b.Float("milestone_id")), RewardID: int64(b.Float("reward_id")),
		Size: b.Str("size"), Color: b.Str("color"), Comment: b.Str("comment"),
	})
	if err != nil {
		log.Println("[rewards/gift]", err)
		status := 400
		if rewards.IsNotFound(err) {
			status = 404
		}
		httpx.JSON(w, status, httpx.M{"error": err.Error()})
		return
	}
	httpx.JSON(w, 201, res)
}
