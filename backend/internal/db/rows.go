package db

import (
	"context"
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
)

// Row — строка результата в том же виде, в каком её отдаёт mysql2 в JSON:
// DECIMAL — строка, даты — ISO UTC с миллисекундами, JSON — разобранное значение, NULL — nil.
type Row map[string]any

const isoLayout = "2006-01-02T15:04:05.000Z"

// ISO форматирует время как JS Date.toISOString().
func ISO(t time.Time) string { return t.UTC().Format(isoLayout) }

// Query возвращает все строки.
func Query(ctx context.Context, q Querier, query string, args ...any) ([]Row, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	types, err := rows.ColumnTypes()
	if err != nil {
		return nil, err
	}
	cols := make([]string, len(types))
	kinds := make([]string, len(types))
	for i, t := range types {
		cols[i] = t.Name()
		kinds[i] = strings.ToUpper(t.DatabaseTypeName())
	}

	out := []Row{}
	raw := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range raw {
		ptrs[i] = &raw[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		r := make(Row, len(cols))
		for i, c := range cols {
			r[c] = convert(raw[i], kinds[i])
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// One возвращает первую строку или nil.
func One(ctx context.Context, q Querier, query string, args ...any) (Row, error) {
	rows, err := Query(ctx, q, query, args...)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return rows[0], nil
}

func convert(v any, kind string) any {
	switch x := v.(type) {
	case nil:
		return nil
	case time.Time:
		if x.IsZero() {
			return nil
		}
		return ISO(x)
	case []byte:
		s := string(x)
		switch {
		case kind == "DECIMAL" || kind == "NEWDECIMAL":
			return s
		case kind == "JSON":
			var j any
			if json.Unmarshal(x, &j) == nil {
				return j
			}
			return s
		case strings.Contains(kind, "INT"):
			if n, err := strconv.ParseInt(s, 10, 64); err == nil {
				return n
			}
			if n, err := strconv.ParseUint(s, 10, 64); err == nil {
				return n
			}
		case kind == "FLOAT" || kind == "DOUBLE":
			if f, err := strconv.ParseFloat(s, 64); err == nil {
				return f
			}
		}
		return s
	case float32:
		return float64(x)
	default:
		return x
	}
}

// --- типизированное чтение (как Number(...) / String(...) в JS) ---

func (r Row) Has(k string) bool { _, ok := r[k]; return ok }

func (r Row) Str(k string) string {
	switch v := r[k].(type) {
	case nil:
		return ""
	case string:
		return v
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		b, _ := json.Marshal(v)
		return string(b)
	}
}

// StrPtr — nil для NULL.
func (r Row) StrPtr(k string) any {
	if r[k] == nil {
		return nil
	}
	return r.Str(k)
}

func (r Row) Float(k string) float64 { return ToFloat(r[k]) }

func (r Row) Int(k string) int64 {
	switch v := r[k].(type) {
	case int64:
		return v
	case uint64:
		return int64(v)
	default:
		return int64(ToFloat(v))
	}
}

func (r Row) Bool(k string) bool {
	switch v := r[k].(type) {
	case nil:
		return false
	case bool:
		return v
	case string:
		return v != "" && v != "0"
	default:
		return ToFloat(v) != 0
	}
}

// Time разбирает ISO-строку обратно во время (нулевое время для NULL).
func (r Row) Time(k string) time.Time {
	s, _ := r[k].(string)
	t, _ := time.Parse(isoLayout, s)
	return t
}

// ToFloat — Number(v) в JS, но NaN → 0.
func ToFloat(v any) float64 {
	switch x := v.(type) {
	case nil:
		return 0
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case uint64:
		return float64(x)
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0
		}
		return x
	case bool:
		if x {
			return 1
		}
		return 0
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil || math.IsNaN(f) {
			return 0
		}
		return f
	case json.Number:
		f, _ := x.Float64()
		return f
	}
	return 0
}

// Scalar — первая колонка первой строки (COUNT, SUM, …).
func Scalar(ctx context.Context, q Querier, query string, args ...any) (any, error) {
	r, err := One(ctx, q, query, args...)
	if err != nil || r == nil {
		return nil, err
	}
	for _, v := range r {
		return v, nil
	}
	return nil, nil
}
