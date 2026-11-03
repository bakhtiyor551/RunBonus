// Package util — мелкие функции, повторяющие поведение JS-хелперов Node.
package util

import (
	"math"
	"regexp"
	"strings"
)

var nonDigit = regexp.MustCompile(`\D`)

func Digits(s string) string { return nonDigit.ReplaceAllString(s, "") }

// ToLocalPhoneDigits — 9 цифр после +992 или "".
func ToLocalPhoneDigits(raw string) string {
	d := Digits(raw)
	d = strings.TrimPrefix(d, "992")
	if len(d) != 9 {
		return ""
	}
	return d
}

// NormalizePhone — 992XXXXXXXXX или "".
func NormalizePhone(raw string) string {
	if l := ToLocalPhoneDigits(raw); l != "" {
		return "992" + l
	}
	return ""
}

func FormatPhoneDisplay(p string) string {
	if len(p) != 12 || !strings.HasPrefix(p, "992") {
		return p
	}
	return "+" + p[:3] + " " + p[3:5] + " " + p[5:8] + " " + p[8:]
}

// Round — Math.round(n * 10^d) / 10^d (JS округляет .5 вверх, к +∞).
func Round(n float64, d int) float64 {
	p := math.Pow(10, float64(d))
	return math.Floor(n*p+0.5) / p
}

// JSRound — Math.round.
func JSRound(n float64) float64 { return math.Floor(n + 0.5) }

func Clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

// FirstNonEmpty — a || b || … для строк.
func FirstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// NilIfEmpty — value || null.
func NilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
