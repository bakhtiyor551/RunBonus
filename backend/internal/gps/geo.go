// Package gps — геометрия маршрута, фильтр GPS-точек и антифрод-проверка тренировки (этап 6).
package gps

import (
	"math"
	"sort"
	"time"
)

const (
	earthRadiusKm = 6371
	coordEps      = 1e-6

	MaxGpsAccuracyM      = 15
	GpsAcquireAccuracyM  = 120
	MinGpsSegmentM       = 2.5
	GpsStationarySpeedMs = 0.2
	MaxGpsSpeedKmh       = 19
)

// Point — нормализованная GPS-точка (normalizeGpsPoint). Nullable-поля — указатели.
type Point struct {
	Latitude   float64
	Longitude  float64
	Speed      *float64
	Accuracy   *float64
	Altitude   *float64
	Course     *float64
	RecordedAt any // исходное значение (строка ISO, число мс или time.Time)
}

func toRad(d float64) float64 { return d * math.Pi / 180 }

func HaversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Pow(math.Sin(dLat/2), 2) + math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Pow(math.Sin(dLon/2), 2)
	return earthRadiusKm * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func optional(m map[string]any, k string) *float64 {
	v, ok := m[k]
	if !ok || v == nil {
		return nil
	}
	if s, isStr := v.(string); isStr && s == "" {
		return nil
	}
	f := JSNumber(v, true)
	return &f
}

// Normalize — normalizeGpsPoint; ok=false, если координаты нечисловые.
func Normalize(m map[string]any) (Point, bool) {
	lv, lok := coalesce(m, "latitude", "lat")
	gv, gok := coalesce(m, "longitude", "lng")
	lat, lng := JSNumber(lv, lok), JSNumber(gv, gok)
	if !finite(lat) || !finite(lng) {
		return Point{}, false
	}
	var rec any
	for _, k := range []string{"recorded_at", "timestamp", "recordedAt", "time"} {
		if v, ok := m[k]; ok && v != nil {
			rec = v
			break
		}
	}
	if rec == nil {
		rec = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	}
	return Point{
		Latitude: lat, Longitude: lng,
		Speed: optional(m, "speed"), Accuracy: optional(m, "accuracy"),
		Altitude: optional(m, "altitude"), Course: optional(m, "course"),
		RecordedAt: rec,
	}, true
}

// NormalizeAll — map(normalizeGpsPoint).filter(Boolean).
func NormalizeAll(list []map[string]any) []Point {
	out := make([]Point, 0, len(list))
	for _, m := range list {
		if p, ok := Normalize(m); ok {
			out = append(out, p)
		}
	}
	return out
}

// Time — new Date(recorded_at); ok=false для Invalid Date.
func (p Point) Time() (time.Time, bool) { return ParseJSDate(p.RecordedAt) }

func SameCoordinates(a, b Point) bool {
	return math.Abs(a.Latitude-b.Latitude) < coordEps && math.Abs(a.Longitude-b.Longitude) < coordEps
}

// ValidTrackPoint — точка участвует в маршруте (точность и скорость в пределах).
func ValidTrackPoint(p Point, acquire bool) bool {
	maxAcc := float64(MaxGpsAccuracyM)
	if acquire {
		maxAcc = GpsAcquireAccuracyM
	}
	if p.Accuracy != nil && *p.Accuracy > maxAcc {
		return false
	}
	if p.Speed != nil && *p.Speed > MaxGpsSpeedKmh {
		return false
	}
	return true
}

func tooClose(last, p Point) bool {
	if HaversineKm(last.Latitude, last.Longitude, p.Latitude, p.Longitude)*1000 < MinGpsSegmentM {
		return true
	}
	return p.Speed != nil && *p.Speed/3.6 < GpsStationarySpeedMs
}

// PrepareTrack — сортировка по времени, отсев плохих точек, фильтр минимального смещения.
func PrepareTrack(points []Point) []Point {
	sorted := append([]Point(nil), points...)
	sort.SliceStable(sorted, func(i, j int) bool {
		ti, oki := sorted[i].Time()
		tj, okj := sorted[j].Time()
		return oki && okj && ti.Before(tj)
	})
	var out []Point
	for _, p := range sorted {
		if !ValidTrackPoint(p, false) {
			continue
		}
		if n := len(out); n > 0 {
			last := out[n-1]
			if SameCoordinates(last, p) || tooClose(last, p) {
				continue
			}
		}
		out = append(out, p)
	}
	return out
}

func roundKm(n float64) float64 { return math.Floor(n*1000+0.5) / 1000 }

// DistanceKm — сумма Haversine по подготовленному треку, округление до метра.
func DistanceKm(points []Point) float64 {
	track := PrepareTrack(points)
	if len(track) < 2 {
		return 0
	}
	total := 0.0
	for i := 1; i < len(track); i++ {
		total += HaversineKm(track[i-1].Latitude, track[i-1].Longitude, track[i].Latitude, track[i].Longitude)
	}
	return roundKm(total)
}

// ShouldSave — нужно ли сохранять точку (не дубль, мин. смещение). last == nil — первая точка.
func ShouldSave(last *Point, p Point) bool {
	if !ValidTrackPoint(p, last == nil) {
		return false
	}
	if last != nil && (SameCoordinates(*last, p) || tooClose(*last, p)) {
		return false
	}
	return true
}

// IncrementalKm — дистанция новых точек от предыдущей последней.
func IncrementalKm(prev *Point, saved []Point) float64 {
	total := 0.0
	last := prev
	for i := range saved {
		if last != nil {
			total += HaversineKm(last.Latitude, last.Longitude, saved[i].Latitude, saved[i].Longitude)
		}
		last = &saved[i]
	}
	return roundKm(total)
}
