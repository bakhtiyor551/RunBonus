package admin

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/shop"
)

func idParam(r *http.Request) float64 { return db.ToFloat(chi.URLParam(r, "id")) }

// registerShop — /api/admin/shop/**.
func registerShop(r chi.Router) {
	crud{"/categories", "Ошибка", "Ошибка сохранения", shop.AllShopCategories, shop.CreateShopCategory, ignoreStatusOnly(shop.UpdateShopCategory)}.register(r)
	crud{"/product-categories", "Ошибка загрузки категорий", "Ошибка создания", shop.AllProductCategories, shop.CreateProductCategory, ignoreStatusOnly(shop.UpdateProductCategory)}.register(r)

	r.Get("/products", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		l, err := shop.AdminProducts(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/products", handle("Ошибка сохранения", func(w http.ResponseWriter, r *http.Request) error {
		p, err := shop.SaveProduct(r.Context(), httpx.BodyOf(r), 0)
		if err != nil {
			return err
		}
		return created(w, p)
	}))
	r.Put("/products/{id}", handle("Ошибка сохранения", func(w http.ResponseWriter, r *http.Request) error {
		p, err := shop.SaveProduct(r.Context(), httpx.BodyOf(r), int64(idParam(r)))
		if err != nil {
			return err
		}
		return ok(w, p)
	}))
	r.Delete("/products/{id}", handle("Ошибка удаления", func(w http.ResponseWriter, r *http.Request) error {
		res, err := shop.DeleteProduct(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		return ok(w, res)
	}))

	r.Get("/orders", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		l, err := shop.AdminOrders(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Get("/orders/{id}", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		o, err := shop.OrderByID(r.Context(), int64(idParam(r)))
		if err != nil {
			return err
		}
		if o == nil {
			return httpx.E(404, "Не найден")
		}
		return ok(w, o)
	}))
	r.Put("/orders/{id}/status", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		o, err := shop.UpdateOrderStatus(r.Context(), idParam(r), httpx.BodyOf(r).Str("status"))
		if err != nil {
			return err
		}
		return ok(w, o)
	}))
	r.Put("/orders/{id}/delivery", handle("Ошибка назначения доставки", func(w http.ResponseWriter, r *http.Request) error {
		courier := httpx.BodyOf(r).Raw("courier_id")
		if !httpx.Truthy(courier) {
			return httpx.E(400, "Выберите курьера")
		}
		if err := shop.AssignCourier(r.Context(), idParam(r), db.ToFloat(httpx.ToString(courier))); err != nil {
			return err
		}
		o, err := shop.OrderByID(r.Context(), int64(idParam(r)))
		if err != nil {
			return err
		}
		return ok(w, httpx.M{"message": "Курьер назначен", "order": o})
	}))
	r.Post("/orders/{id}/assign-qr", handle("Ошибка привязки QR", func(w http.ResponseWriter, r *http.Request) error {
		code := httpx.BodyOf(r).Str("unique_id")
		if strings.TrimSpace(code) == "" {
			return httpx.E(400, "Укажите QR/ID кроссовок")
		}
		res, err := shop.AssignQR(r.Context(), idParam(r), code)
		if err != nil {
			return err
		}
		res["message"] = "QR привязан, кроссовки активированы для клиента"
		return ok(w, res)
	}))

	r.Get("/couriers", handle("Ошибка загрузки курьеров", func(w http.ResponseWriter, r *http.Request) error {
		l, err := shop.Couriers(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/couriers", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		c, err := shop.CreateCourier(r.Context(), httpx.BodyOf(r))
		if err != nil {
			return err
		}
		return created(w, c)
	}))
	r.Put("/couriers/{id}", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		c, err := shop.UpdateCourier(r.Context(), idParam(r), httpx.BodyOf(r))
		if err != nil {
			return err
		}
		return ok(w, c)
	}))

	r.Get("/warehouse/stock", handle("Ошибка загрузки склада", func(w http.ResponseWriter, r *http.Request) error {
		l, err := shop.WarehouseStock(r.Context())
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Get("/warehouse/movements", handle("Ошибка загрузки истории", func(w http.ResponseWriter, r *http.Request) error {
		l, err := shop.StockMovements(r.Context(), r.URL.Query().Get("limit"))
		if err != nil {
			return err
		}
		return ok(w, l)
	}))
	r.Post("/warehouse/stock", handle("Ошибка поступления на склад", func(w http.ResponseWriter, r *http.Request) error {
		res, err := shop.AddStock(r.Context(), httpx.BodyOf(r))
		if err != nil {
			return err
		}
		return created(w, res)
	}))
}
