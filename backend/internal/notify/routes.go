package notify

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/httpx"
)

// Register — /api/mobile/push/register (модуль push).
func Register(r chi.Router) {
	r.With(auth.User).Post("/api/mobile/push/register", httpx.H("Не удалось сохранить токен", func(w http.ResponseWriter, r *http.Request) error {
		b := httpx.BodyOf(r)
		token := b.Str("token")
		if strings.TrimSpace(token) == "" {
			return httpx.E(400, "Токен не указан")
		}
		ok, err := SaveToken(r.Context(), auth.UserID(r), token, b.Str("platform"), auth.RequestDevice(r))
		if err != nil {
			return err
		}
		httpx.OK(w, httpx.M{"ok": ok})
		return nil
	}))
	r.With(auth.User).Delete("/api/mobile/push/register", httpx.H("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		if err := RemoveToken(r.Context(), auth.UserID(r), httpx.BodyOf(r).Str("token")); err != nil {
			return err
		}
		httpx.OK(w, httpx.M{"ok": true})
		return nil
	}))
}
