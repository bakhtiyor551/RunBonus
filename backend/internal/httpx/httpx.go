// Package httpx — JSON-ответы, ошибки и тело запроса в стиле Express-обработчиков Node.
package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"runbonus/api/internal/db"
)

// Error — ошибка с HTTP-статусом (аналог err.status / err.code в Node).
type Error struct {
	Status int
	Msg    string
	Code   string
	Extra  map[string]any
}

func (e *Error) Error() string { return e.Msg }

func E(status int, msg string) *Error { return &Error{Status: status, Msg: msg} }

func EC(status int, msg, code string) *Error { return &Error{Status: status, Msg: msg, Code: code} }

// JSON пишет ответ. nil-поля сохраняются как null (как в Node), undefined не бывает.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func OK(w http.ResponseWriter, v any) { JSON(w, http.StatusOK, v) }

// M — сокращение для JSON-объектов.
type M = map[string]any

// WriteError пишет {error, code}. Неизвестные ошибки — 500 с fallback-сообщением.
func WriteError(w http.ResponseWriter, r *http.Request, err error, fallback string) {
	var he *Error
	if errors.As(err, &he) {
		body := M{"error": he.Msg}
		if he.Code != "" {
			body["code"] = he.Code
		}
		for k, v := range he.Extra {
			body[k] = v
		}
		JSON(w, he.Status, body)
		return
	}
	log.Printf("[%s %s] %v", r.Method, r.URL.Path, err)
	if fallback == "" {
		fallback = "Внутренняя ошибка сервера"
	}
	JSON(w, http.StatusInternalServerError, M{"error": fallback})
}

// H превращает func(w, r) error в http.HandlerFunc с fallback-сообщением для 500.
func H(fallback string, fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			WriteError(w, r, err, fallback)
		}
	}
}

// --- тело запроса ---

type bodyKey struct{}

// ParseBody — middleware: читает JSON-тело один раз (лимит 12 МБ, как express.json)
// и сохраняет его в контексте. Исходное тело восстанавливается для прокси.
func ParseBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := Body{}
		if r.Body != nil && strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			raw, err := io.ReadAll(io.LimitReader(r.Body, 12<<20))
			_ = r.Body.Close()
			if err == nil && len(bytes.TrimSpace(raw)) > 0 {
				dec := json.NewDecoder(bytes.NewReader(raw))
				dec.UseNumber()
				var v any
				if dec.Decode(&v) == nil {
					if m, ok := v.(map[string]any); ok {
						body = m
					}
				}
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), bodyKey{}, body)))
	})
}

// Body — разобранное JSON-тело.
type Body map[string]any

func BodyOf(r *http.Request) Body {
	if b, ok := r.Context().Value(bodyKey{}).(Body); ok {
		return b
	}
	return Body{}
}

// Has — ключ присутствует (даже если null).
func (b Body) Has(k string) bool { _, ok := b[k]; return ok }

// Raw — первое не-nil значение среди ключей.
func (b Body) Raw(keys ...string) any {
	for _, k := range keys {
		if v, ok := b[k]; ok && v != nil {
			return v
		}
	}
	return nil
}

// Str — String(value ?? ”) среди ключей (первый не-nil).
func (b Body) Str(keys ...string) string { return ToString(b.Raw(keys...)) }

// Float — Number(value) (NaN → 0).
func (b Body) Float(keys ...string) float64 { return db.ToFloat(normalize(b.Raw(keys...))) }

func (b Body) Int(keys ...string) int64 { return int64(b.Float(keys...)) }

// Bool — JS truthiness.
func (b Body) Bool(keys ...string) bool { return Truthy(b.Raw(keys...)) }

// Map — вложенный объект.
func (b Body) Map(k string) Body {
	if m, ok := b[k].(map[string]any); ok {
		return m
	}
	return nil
}

// List — вложенный массив.
func (b Body) List(k string) []any {
	if l, ok := b[k].([]any); ok {
		return l
	}
	return nil
}

func normalize(v any) any {
	if n, ok := v.(json.Number); ok {
		f, _ := n.Float64()
		return f
	}
	return v
}

func ToString(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case json.Number:
		return x.String()
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		b, _ := json.Marshal(x)
		return string(b)
	}
}

func Truthy(v any) bool {
	switch x := normalize(v).(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0
	default:
		return true
	}
}

// Query — первый непустой параметр строки запроса.
func Query(r *http.Request, keys ...string) string {
	q := r.URL.Query()
	for _, k := range keys {
		if v := q.Get(k); v != "" {
			return v
		}
	}
	return ""
}
