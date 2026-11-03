package server

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/config"
	"runbonus/api/internal/httpx"
)

// Module — набор маршрутов одной предметной области. Регистрируется, только если включён в GO_MODULES.
type Module struct {
	Name     string
	Register func(r chi.Router)
}

// cors — как в Node: любой origin отражается, credentials разрешены.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		h := w.Header()
		if origin != "" {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			h.Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Device-Id")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if p := recover(); p != nil {
				log.Printf("panic %s %s: %v\n%s", r.Method, r.URL.Path, p, debug.Stack())
				httpx.JSON(w, 500, httpx.M{"error": "Внутренняя ошибка сервера"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func New(modules []Module) http.Handler {
	r := chi.NewRouter()
	r.Use(recoverer, cors, httpx.ParseBody)

	fallback := nodeFallback()
	r.NotFound(fallback.ServeHTTP)
	r.MethodNotAllowed(fallback.ServeHTTP)

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.OK(w, httpx.M{"ok": true, "service": "runbonus-api", "runtime": "go"})
	})

	uploads := http.StripPrefix("/api/uploads", http.FileServer(http.Dir(config.C.UploadsRoot)))
	r.Handle("/api/uploads/*", uploads)
	r.Handle("/uploads/*", http.StripPrefix("/uploads", http.FileServer(http.Dir(config.C.UploadsRoot))))

	for _, m := range modules {
		if config.C.Modules[m.Name] {
			m.Register(r)
			log.Printf("module %s: Go", m.Name)
		} else {
			log.Printf("module %s: Node (proxy)", m.Name)
		}
	}
	return r
}
