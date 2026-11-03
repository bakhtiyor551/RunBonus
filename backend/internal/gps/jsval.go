package gps

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
)

// JSNumber — Number(v) из JS: отсутствие → NaN, null/"" → 0, нечисловая строка → NaN.
func JSNumber(v any, present bool) float64 {
	if !present {
		return math.NaN()
	}
	switch x := v.(type) {
	case nil:
		return 0
	case float64:
		return x
	case int64:
		return float64(x)
	case int:
		return float64(x)
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			return math.NaN()
		}
		return f
	case bool:
		if x {
			return 1
		}
		return 0
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	}
	return math.NaN()
}

// coalesce — a ?? b ?? … для ключей объекта.
func coalesce(m map[string]any, keys ...string) (any, bool) {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v, true
		}
	}
	// Все null или отсутствуют: последний присутствующий null даёт null (Number(null) = 0).
	last := keys[len(keys)-1]
	v, ok := m[last]
	return v, ok
}

func finite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

var isoLayouts = []string{
	time.RFC3339Nano,
	"2006-01-02T15:04:05.000Z07:00",
	"2006-01-02T15:04:05Z07:00",
}

var localLayouts = []string{
	"2006-01-02T15:04:05.999999999",
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02 15:04:05",
	"2006-01-02T15:04",
}

// ParseJSDate — new Date(v): ISO-строка, строка без зоны (локальное время), дата (UTC) или число мс.
func ParseJSDate(v any) (time.Time, bool) {
	switch x := v.(type) {
	case time.Time:
		return x, !x.IsZero()
	case float64:
		return time.UnixMilli(int64(x)), finite(x)
	case int64:
		return time.UnixMilli(x), true
	case json.Number:
		f, err := x.Float64()
		return time.UnixMilli(int64(f)), err == nil
	case string:
		s := strings.TrimSpace(x)
		for _, l := range isoLayouts {
			if t, err := time.Parse(l, s); err == nil {
				return t, true
			}
		}
		for _, l := range localLayouts {
			if t, err := time.ParseInLocation(l, s, time.Local); err == nil {
				return t, true
			}
		}
		if t, err := time.Parse("2006-01-02", s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
