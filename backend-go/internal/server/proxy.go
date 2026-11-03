package server

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"

	"runbonus/api/internal/config"
	"runbonus/api/internal/httpx"
)

// nodeFallback проксирует непереносённые маршруты (включая WebSocket) в Node.js.
// Без NODE_UPSTREAM отвечает 404, как Express на неизвестный путь.
func nodeFallback() http.Handler {
	if config.C.NodeUpstream == "" {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			httpx.JSON(w, http.StatusNotFound, httpx.M{"error": "Не найдено"})
		})
	}
	target, err := url.Parse(config.C.NodeUpstream)
	if err != nil {
		log.Fatalf("NODE_UPSTREAM: %v", err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	base := proxy.Director
	proxy.Director = func(r *http.Request) {
		base(r)
		r.Host = target.Host
	}
	// Node сам выставляет CORS — убираем дубли от Go-middleware.
	proxy.ModifyResponse = func(resp *http.Response) error {
		for _, h := range []string{"Access-Control-Allow-Origin", "Access-Control-Allow-Credentials", "Vary"} {
			resp.Header.Del(h)
		}
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[proxy] %s %s: %v", r.Method, r.URL.Path, err)
		httpx.JSON(w, http.StatusBadGateway, httpx.M{"error": "Сервис временно недоступен"})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[proxy] %s %s", r.Method, r.URL.Path)
		proxy.ServeHTTP(w, r)
	})
}
