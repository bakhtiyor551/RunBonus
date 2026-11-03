package gps

import (
	"fmt"
	"math"
	"testing"
	"time"
)

// line — прямой трек на север: n точек через dt секунд, шаг stepM метров.
func line(n int, stepM float64, dt time.Duration, speed float64) []Point {
	start := time.Date(2026, 11, 3, 6, 0, 0, 0, time.UTC)
	out := make([]Point, n)
	for i := range out {
		s, acc := speed, 5.0
		out[i] = Point{
			Latitude: 38.56 + float64(i)*stepM/111320, Longitude: 68.78,
			Speed: &s, Accuracy: &acc,
			RecordedAt: start.Add(time.Duration(i) * dt).Format("2006-01-02T15:04:05.000Z"),
		}
	}
	return out
}

var settings = Settings{MinDurationMinutes: 5, MinDistanceKm: 0.5, MaxSpeedKmh: 18}

func TestHaversine(t *testing.T) {
	// 1° широты ≈ 111.2 км
	if d := HaversineKm(0, 0, 1, 0); math.Abs(d-111.195) > 0.01 {
		t.Fatalf("haversine = %v", d)
	}
}

func TestNormalizeJSSemantics(t *testing.T) {
	if _, ok := Normalize(map[string]any{"lat": "abc", "lng": 1.0}); ok {
		t.Fatal("нечисловая широта должна отбрасываться")
	}
	p, ok := Normalize(map[string]any{"latitude": "38.5", "lng": 68.0, "speed": ""})
	if !ok || p.Latitude != 38.5 || p.Speed != nil {
		t.Fatalf("got %+v ok=%v", p, ok)
	}
}

func TestValidateApproved(t *testing.T) {
	r := Validate(line(12, 50, 10*time.Second, 10), 600, settings)
	if !r.OK || r.Status != "approved" || math.Abs(r.DistanceKm-0.549) > 0.001 {
		t.Fatalf("got %+v", r)
	}
}

// Эталоны получены из validateWorkout() Node на тех же точках.
func TestValidateRejections(t *testing.T) {
	cases := []struct {
		name     string
		points   []Point
		duration float64
		status   string
		reason   string
	}{
		{"мало точек", line(1, 50, time.Second, 10), 600, "rejected", "Недостаточно GPS-точек для маршрута"},
		{"короткая", line(12, 50, 10*time.Second, 10), 120, "rejected", "Тренировка меньше 5 минут"},
		{"мало км", line(5, 50, 10*time.Second, 10), 600, "rejected", "Минимум 0.5 км"},
		{"скачки", line(12, 140, 2*time.Second, 10), 600, "rejected", "Максимальная скорость 251.7 км/ч превышает лимит 18 км/ч"},
	}
	for _, c := range cases {
		r := Validate(c.points, c.duration, settings)
		if r.Status != c.status || r.Reason != c.reason {
			t.Errorf("%s: got %s / %q", c.name, r.Status, r.Reason)
		}
	}
}

func TestShouldSaveFiltersNoise(t *testing.T) {
	pts := line(3, 1, 10*time.Second, 10) // шаг 1 м < MinGpsSegmentM
	if !ShouldSave(nil, pts[0]) {
		t.Fatal("первая точка сохраняется")
	}
	if ShouldSave(&pts[0], pts[1]) {
		t.Fatal("смещение < 2.5 м не сохраняется")
	}
}

func ExampleDistanceKm() {
	fmt.Println(DistanceKm(line(12, 50, 10*time.Second, 10)))
	// Output: 0.549
}
