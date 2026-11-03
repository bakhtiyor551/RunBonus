package admin

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/httpx"
	"runbonus/api/internal/shop"
)

// crud — список, создание, обновление и смена статуса для справочника.
type crud struct {
	path, listErr                    string
	list                             func(context.Context) ([]httpx.M, error)
	create                           func(context.Context, httpx.Body) (httpx.M, error)
	update                           func(ctx context.Context, id string, b httpx.Body, statusOnly bool) (httpx.M, error)
}

func (c crud) register(r chi.Router) {
	r.Get(c.path, handle(c.listErr, func(w http.ResponseWriter, r *http.Request) error {
		l, err := c.list(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post(c.path, handle("Ошибка создания", func(w http.ResponseWriter, r *http.Request) error {
		m, err := c.create(r.Context(), httpx.BodyOf(r))
		if err != nil {
			return err
		}
		return created(w, m)
	}))
	r.Put(c.path+"/{id}", handle("Ошибка сохранения", func(w http.ResponseWriter, r *http.Request) error {
		m, err := c.update(r.Context(), chi.URLParam(r, "id"), httpx.BodyOf(r), false)
		if err != nil {
			return err
		}
		return ok(w, m)
	}))
	r.Patch(c.path+"/{id}/status", handle("Ошибка обновления статуса", func(w http.ResponseWriter, r *http.Request) error {
		status := "active"
		if httpx.BodyOf(r).Str("status") == "inactive" {
			status = "inactive"
		}
		m, err := c.update(r.Context(), chi.URLParam(r, "id"), httpx.Body{"status": status}, true)
		if err != nil {
			return err
		}
		return ok(w, m)
	}))
}

func ignoreStatusOnly(fn func(context.Context, string, httpx.Body) (httpx.M, error)) func(context.Context, string, httpx.Body, bool) (httpx.M, error) {
	return func(ctx context.Context, id string, b httpx.Body, _ bool) (httpx.M, error) { return fn(ctx, id, b) }
}

func registerMethods(r chi.Router) {
	crud{"/payment-methods", "Ошибка загрузки способов оплаты", shop.AllPaymentMethods, shop.CreatePaymentMethod, ignoreStatusOnly(shop.UpdatePaymentMethod)}.register(r)
	crud{"/delivery-methods", "Ошибка загрузки способов доставки", shop.AllDeliveryMethods, shop.CreateDeliveryMethod, ignoreStatusOnly(shop.UpdateDeliveryMethod)}.register(r)
	crud{"/mobile-wallets", "Ошибка загрузки кошельков", shop.AllMobileAccounts, shop.CreateMobileAccount, shop.UpdateMobileAccount}.register(r)
}
