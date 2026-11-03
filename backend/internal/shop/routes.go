package shop

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/httpx"
)

func Register(r chi.Router) {
	r.Route("/api/mobile", func(r chi.Router) {
		r.Get("/shop-categories", func(w http.ResponseWriter, r *http.Request) {
			cats, err := CatalogCategories(r.Context())
			if err != nil {
				log.Println("[shop-categories]", err)
				cats = []httpx.M{}
			}
			httpx.OK(w, cats)
		})
		r.Get("/shop-catalog", func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			cats, err := CatalogCategories(ctx)
			var products []httpx.M
			if err == nil {
				products, err = ActiveProducts(ctx, strings.TrimSpace(r.URL.Query().Get("category_id")))
			}
			if err != nil {
				log.Println("[shop-catalog]", err)
				if cats, err = CatalogCategories(ctx); err != nil {
					cats = []httpx.M{}
				}
				if products, err = ActiveProducts(ctx, ""); err != nil {
					products = []httpx.M{}
				}
			}
			httpx.OK(w, httpx.M{"categories": cats, "products": products})
		})
		r.Get("/products", httpx.H("Ошибка загрузки каталога", func(w http.ResponseWriter, r *http.Request) error {
			list, err := ActiveProducts(r.Context(), strings.TrimSpace(r.URL.Query().Get("category_id")))
			if err != nil {
				return err
			}
			httpx.OK(w, list)
			return nil
		}))
		r.Get("/products/{id}", httpx.H("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
			p, err := ProductByID(r.Context(), chi.URLParam(r, "id"))
			if err != nil {
				return err
			}
			if p == nil {
				return httpx.E(404, "Товар не найден")
			}
			httpx.OK(w, p)
			return nil
		}))
		r.With(auth.User).Get("/payment-methods", func(w http.ResponseWriter, r *http.Request) {
			methods, err := ActivePaymentMethods(r.Context())
			if err != nil {
				log.Println("[payment-methods]", err)
				methods = FallbackPaymentMethods()
			}
			out := []httpx.M{}
			for _, m := range methods {
				if m["id"] != "bonus" {
					out = append(out, m)
				}
			}
			httpx.OK(w, httpx.M{"methods": out, "available_bonus": 0})
		})
		r.With(auth.User).Get("/delivery-methods", func(w http.ResponseWriter, r *http.Request) {
			methods, err := ActiveDeliveryMethods(r.Context())
			if err != nil {
				log.Println("[delivery-methods]", err)
				methods = FallbackDeliveryMethods()
			}
			httpx.OK(w, methods)
		})
		r.Get("/mobile-payment-accounts", func(w http.ResponseWriter, r *http.Request) {
			accounts, err := ActiveMobileAccounts(r.Context())
			if err != nil {
				log.Println("[mobile-payment-accounts]", err)
				accounts = defaultMobileAccounts()
			}
			httpx.OK(w, accounts)
		})
		r.With(auth.User, auth.ActiveUser).Post("/order-receipt", httpx.H("Не удалось сохранить чек", func(w http.ResponseWriter, r *http.Request) error {
			data := httpx.BodyOf(r).Str("payment_receipt_base64")
			if data == "" {
				return httpx.E(400, "Загрузите чек")
			}
			url, err := SaveReceipt(fmt.Sprintf("pending-%d-%d", auth.UserID(r), time.Now().UnixMilli()), data)
			if err != nil {
				return err
			}
			httpx.OK(w, httpx.M{"receipt_url": url})
			return nil
		}))
		r.With(auth.User, auth.ActiveUser).Post("/orders", httpx.H("Не удалось оформить заказ", createOrder))
		r.With(auth.User).Get("/my-orders", httpx.H("Ошибка загрузки заказов", func(w http.ResponseWriter, r *http.Request) error {
			list, err := UserOrders(r.Context(), auth.UserID(r))
			if err != nil {
				return err
			}
			httpx.OK(w, list)
			return nil
		}))
	})
}

func createOrder(w http.ResponseWriter, r *http.Request) error {
	b := httpx.BodyOf(r)
	if !httpx.Truthy(b.Raw("product_id")) || strings.TrimSpace(b.Str("customer_name")) == "" || strings.TrimSpace(b.Str("phone")) == "" {
		return httpx.E(400, "Укажите товар, имя и телефон")
	}
	order, err := CreateOrder(r.Context(), OrderInput{
		ProductID: httpx.ToString(b.Raw("product_id")), Size: b.Str("size"), Color: b.Str("color"), ColorID: b.Str("color_id"),
		Quantity: b.Raw("quantity"), CustomerName: b.Str("customer_name"), Phone: b.Str("phone"), City: b.Str("city"),
		Address: b.Str("address"), Comment: b.Str("comment"), DeliveryMethod: b.Str("delivery_method"),
		PaymentMethod: b.Str("payment_method"), PaymentDetails: b.Str("payment_details"),
		ReceiptBase64: b.Str("payment_receipt_base64"), ReceiptURL: b.Str("payment_receipt_url"),
		ApplyDeliveryFee: b.Bool("apply_delivery_fee"),
	}, auth.UserID(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, httpx.M{"message": "Ваш заказ принят. Мы свяжемся с вами для подтверждения.", "order": order})
	return nil
}
