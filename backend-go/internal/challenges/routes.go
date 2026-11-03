package challenges

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/httpx"
)

func Register(r chi.Router) {
	r.Route("/api/challenges", func(r chi.Router) {
		r.Use(auth.User)
		r.Get("/state", httpx.H("Не удалось загрузить задания", func(w http.ResponseWriter, r *http.Request) error {
			s, err := State(r.Context(), auth.UserID(r))
			if err != nil {
				return err
			}
			httpx.OK(w, s)
			return nil
		}))
		r.Get("/current", httpx.H("Не удалось загрузить задания", func(w http.ResponseWriter, r *http.Request) error {
			s, err := State(r.Context(), auth.UserID(r))
			if err != nil {
				return err
			}
			httpx.OK(w, s)
			return nil
		}))
		r.Post("/start", httpx.H("Не удалось начать задание", func(w http.ResponseWriter, r *http.Request) error {
			res, err := Start(r.Context(), auth.UserID(r), httpx.BodyOf(r).Float("levelId", "level_id"))
			if err != nil {
				return err
			}
			httpx.JSON(w, 201, res)
			return nil
		}))
		r.Get("/{id}/rewards", httpx.H("Не удалось загрузить награды", func(w http.ResponseWriter, r *http.Request) error {
			res, err := RewardOptions(r.Context(), auth.UserID(r), chi.URLParam(r, "id"))
			if err != nil {
				return err
			}
			httpx.OK(w, res)
			return nil
		}))
		r.Post("/{id}/claim", httpx.H("Не удалось получить награду", func(w http.ResponseWriter, r *http.Request) error {
			b := httpx.BodyOf(r)
			res, err := Claim(r.Context(), auth.UserID(r), ClaimInput{
				ChallengeID: chi.URLParam(r, "id"), RewardID: b.Raw("rewardId", "reward_id"),
				Size: b.Str("size"), Color: b.Str("color"), Phone: b.Str("phone"), Address: b.Str("address"), City: b.Str("city"),
			})
			if err != nil {
				return err
			}
			httpx.OK(w, res)
			return nil
		}))
	})
}
