package admin

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/challenges"
	"runbonus/api/internal/httpx"
)

func registerChallenges(r chi.Router) {
	r.Get("/levels", handle("Не удалось загрузить уровни", func(w http.ResponseWriter, r *http.Request) error {
		l, err := challenges.AdminLevels(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	save := func(w http.ResponseWriter, r *http.Request) error {
		b := httpx.BodyOf(r)
		if id := chi.URLParam(r, "id"); id != "" {
			b = copyBody(b)
			b["id"] = id
		}
		l, err := challenges.AdminSaveLevel(r.Context(), b)
		if err != nil {
			return err
		}
		return ok(w, l)
	}
	r.Post("/levels", handle("Не удалось сохранить уровень", save))
	r.Put("/levels/{id}", handle("Не удалось сохранить уровень", save))
	r.Get("/claims", handle("Не удалось загрузить заявки", func(w http.ResponseWriter, r *http.Request) error {
		l, err := challenges.AdminClaims(r.Context(), r.URL.Query().Get("status"))
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Patch("/claims/{id}", handle("Не удалось обновить статус", func(w http.ResponseWriter, r *http.Request) error {
		b := httpx.BodyOf(r)
		l, err := challenges.AdminUpdateClaim(r.Context(), chi.URLParam(r, "id"), b.Str("status"), b.Str("admin_comment", "adminComment"))
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
}

func copyBody(b httpx.Body) httpx.Body {
	out := httpx.Body{}
	for k, v := range b {
		out[k] = v
	}
	return out
}
