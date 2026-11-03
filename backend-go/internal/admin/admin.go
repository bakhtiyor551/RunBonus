package admin

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/ads"
	"runbonus/api/internal/auth"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
	"runbonus/api/internal/reports"
)

// Register — модуль admin: весь /api/admin/**.
func Register(r chi.Router) {
	r.Route("/api/admin", func(r chi.Router) {
		registerCore(r)
		r.Group(func(r chi.Router) {
			r.Use(auth.AdminMW)
			registerMethods(r)
			r.Route("/shop", registerShop)
			r.Route("/rewards", registerRewards)
			r.Route("/challenges", registerChallenges)
			r.Route("/reports", registerReports)
			r.Route("/ads", registerAds)
		})
	})
}

type reportFn func(context.Context, map[string]string) (httpx.M, error)

func report(fn reportFn) http.HandlerFunc {
	return handle("Ошибка отчёта", func(w http.ResponseWriter, r *http.Request) error {
		res, err := fn(r.Context(), queryMap(r))
		if err != nil {
			return err
		}
		return ok(w, res)
	})
}

func registerReports(r chi.Router) {
	r.Get("/dashboard", report(reports.Dashboard))
	r.Get("/sales", report(reports.Sales))
	r.Get("/workouts", report(reports.Workouts))
	r.Get("/bonuses", report(reports.Bonuses))
	r.Get("/clients", report(reports.Clients))
	r.Get("/shoes", report(reports.Shoes))
	r.Get("/finance", report(reports.Finance))
	r.Post("/telegram/daily", handle("Не удалось отправить отчёт", func(w http.ResponseWriter, r *http.Request) error {
		text, err := reports.DailyTelegram(r.Context())
		if err != nil {
			return err
		}
		var id any
		if msg := notify.Telegram(text); msg != "" {
			id = msg
		}
		return ok(w, httpx.M{"ok": true, "telegram_message_id": id})
	}))
}

// errOr — res.status(e.status || 500).json({ error: e.message || fallback }).
func errOr(fallback string, fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			if he, ok := err.(*httpx.Error); ok {
				httpx.WriteError(w, r, he, "")
				return
			}
			msg := err.Error()
			if msg == "" {
				msg = fallback
			}
			httpx.JSON(w, 500, httpx.M{"error": msg})
		}
	}
}

func registerAds(r chi.Router) {
	r.Get("/settings", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		s, err := ads.AdminSettings(r.Context())
		if err != nil {
			return err
		}
		return ok(w, httpx.M{"settings": s})
	}))
	r.Put("/settings", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		s, err := ads.UpdateSettings(r.Context(), httpx.BodyOf(r))
		if err != nil {
			return err
		}
		return ok(w, httpx.M{"settings": s, "message": "Настройки сохранены"})
	}))
	r.Get("/dashboard", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		d, err := ads.Dashboard(r.Context(), queryMap(r))
		if err != nil {
			return err
		}
		return ok(w, d)
	}))
	r.Get("/statistics", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		s, err := ads.Statistics(r.Context(), queryMap(r))
		if err != nil {
			return err
		}
		return ok(w, s)
	}))
	r.Get("/advertisers", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		l, err := ads.Advertisers(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/advertisers", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		a, err := ads.SaveAdvertiser(r.Context(), httpx.BodyOf(r), "")
		if err != nil {
			return err
		}
		return created(w, a)
	}))
	r.Put("/advertisers/{id}", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		a, err := ads.SaveAdvertiser(r.Context(), httpx.BodyOf(r), chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		return ok(w, a)
	}))
	r.Get("/campaigns", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		l, err := ads.Campaigns(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/campaigns", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		c, err := ads.SaveCampaign(r.Context(), httpx.BodyOf(r), "")
		if err != nil {
			return err
		}
		return created(w, c)
	}))
	r.Put("/campaigns/{id}", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		c, err := ads.SaveCampaign(r.Context(), httpx.BodyOf(r), chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		return ok(w, c)
	}))
	r.Delete("/campaigns/{id}", errOr("Ошибка удаления", func(w http.ResponseWriter, r *http.Request) error {
		res, err := ads.DeleteCampaign(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		return ok(w, res)
	}))
	r.Post("/campaigns/{id}/send-push", errOr("Ошибка отправки push", func(w http.ResponseWriter, r *http.Request) error {
		ctx := r.Context()
		if !notify.PushConfigured() {
			return httpx.E(503, "Firebase не настроен. Укажите FIREBASE_SERVICE_ACCOUNT_PATH в .env на сервере.")
		}
		c, err := ads.CampaignByID(ctx, chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		if c == nil {
			return httpx.E(404, "Кампания не найдена")
		}
		if c["ad_type"] != "push" {
			return httpx.E(400, "Эта кампания не является push-уведомлением")
		}
		res, err := ads.SendCampaignPush(ctx, c)
		if err != nil {
			return err
		}
		if res["skipped"] == true && res["reason"] == "no_tokens" {
			res["error"] = "Нет зарегистрированных устройств для выбранной аудитории"
			httpx.JSON(w, 400, res)
			return nil
		}
		res["ok"] = true
		res["message"] = "Отправлено: " + httpx.ToString(float64(res["sent"].(int))) + ", ошибок: " + httpx.ToString(float64(res["failed"].(int)))
		return ok(w, res)
	}))
	r.Get("/tariffs", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		all := r.URL.Query().Get("all")
		l, err := ads.Tariffs(r.Context(), all == "1" || all == "true")
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/tariffs", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		t, err := ads.SaveTariff(r.Context(), httpx.BodyOf(r), "")
		if err != nil {
			return err
		}
		return created(w, t)
	}))
	r.Put("/tariffs/{id}", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		t, err := ads.SaveTariff(r.Context(), httpx.BodyOf(r), chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		return ok(w, t)
	}))
	r.Get("/payments", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		l, err := ads.Payments(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/payments", errOr("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		p, err := ads.SavePayment(r.Context(), httpx.BodyOf(r))
		if err != nil {
			return err
		}
		return created(w, p)
	}))
}
