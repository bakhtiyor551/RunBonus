package gps

import (
	"fmt"
	"math"
	"strconv"
)

const (
	walkMin              = 3
	walkMax              = 7
	runMin               = 7
	maxJumpKm            = 0.15
	maxJumpSec           = 5
	staleCoordSec        = 120
	gpsSpeedToleranceKmh = 1
	maxGapSec            = 180
	badAccuracyM         = 100
)

// Settings — активные лимиты из bonus_settings.
type Settings struct {
	MinDurationMinutes float64
	MinDistanceKm      float64
	MaxSpeedKmh        float64
}

// Result — результат validateWorkout. Nullable-метрики — указатели (undefined в JS → null в БД).
type Result struct {
	OK                 bool
	Status             string
	Reason             string
	Reasons            []string
	DistanceKm         float64
	ApprovedDistanceKm float64
	AvgSpeed           *float64
	MaxSpeed           *float64
	Score              float64
}

func jsNum(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

func speedOf(p Point) float64 {
	if p.Speed == nil || !finite(*p.Speed) {
		return 0
	}
	return *p.Speed
}

// Validate — серверная проверка трека (backend — источник истины для дистанции и статуса).
func Validate(points []Point, durationSeconds float64, s Settings) Result {
	minDurationSec := s.MinDurationMinutes * 60
	maxSpeedKmh := s.MaxSpeedKmh
	runMax := maxSpeedKmh
	speedRejectAbove := maxSpeedKmh + gpsSpeedToleranceKmh

	track := PrepareTrack(points)
	distanceFromRaw := DistanceKm(points)

	if len(track) < 2 {
		return Result{Status: "rejected", Reason: "Недостаточно GPS-точек для маршрута", Reasons: []string{"DUPLICATE_POINTS"}, DistanceKm: distanceFromRaw}
	}
	if durationSeconds < minDurationSec {
		return Result{Status: "rejected", Reason: fmt.Sprintf("Тренировка меньше %s минут", jsNum(s.MinDurationMinutes)),
			Reasons: []string{"UNREALISTIC_DISTANCE"}, DistanceKm: distanceFromRaw, Score: 10}
	}
	distanceKm := DistanceKm(track)
	if distanceKm < s.MinDistanceKm {
		return Result{Status: "rejected", Reason: "Минимум " + jsNum(s.MinDistanceKm) + " км",
			Reasons: []string{"UNREALISTIC_DISTANCE"}, DistanceKm: distanceKm, Score: 15}
	}

	var maxSpeed float64
	var invalidSpeed, suspicious, jumps, badAcc, lowAcc, stale, gaps, dups, tsIssues int

	for i, p := range track {
		sp := speedOf(p)
		if sp > maxSpeed {
			maxSpeed = sp
		}
		if sp > speedRejectAbove {
			invalidSpeed++
		} else if sp > runMax {
			suspicious++
		}
		if p.Accuracy != nil {
			if *p.Accuracy > badAccuracyM {
				badAcc++
			} else if *p.Accuracy > MaxGpsAccuracyM {
				lowAcc++
			}
		}
		if i == 0 {
			continue
		}
		prev := track[i-1]
		tPrev, ok1 := prev.Time()
		tCur, ok2 := p.Time()
		dt := math.NaN()
		if ok1 && ok2 {
			dt = float64(tCur.UnixMilli()-tPrev.UnixMilli()) / 1000
		}
		if !finite(dt) || dt < 0 {
			tsIssues++
		} else if dt >= maxGapSec {
			gaps++
		}
		if dt > 0 && dt <= maxJumpSec {
			seg := HaversineKm(prev.Latitude, prev.Longitude, p.Latitude, p.Longitude)
			if seg > maxJumpKm {
				jumps++
			}
			segSpeed := seg / dt * 3600
			if segSpeed > maxSpeed {
				maxSpeed = segSpeed
			}
			if segSpeed > speedRejectAbove {
				invalidSpeed++
			} else if segSpeed > runMax {
				suspicious++
			}
		}
		if p.Latitude == prev.Latitude && p.Longitude == prev.Longitude {
			if dt >= staleCoordSec {
				stale++
			}
			if dt < 1 {
				dups++
			}
		}
	}

	sum, n := 0.0, 0
	for _, p := range track {
		if sp := speedOf(p); sp > 0 {
			sum += sp
			n++
		}
	}
	avgSpeed := 0.0
	if n > 0 {
		avgSpeed = sum / float64(n)
	}

	var reasons []string
	add := func(cond bool, r string) {
		if cond {
			reasons = append(reasons, r)
		}
	}
	add(tsIssues > 0, "INVALID_TIMESTAMP")
	add(jumps > 0, "GPS_JUMP")
	add(invalidSpeed > 0 || maxSpeed > speedRejectAbove, "HIGH_SPEED")
	add(badAcc > 0 || float64(lowAcc) > float64(len(track))*0.4, "LOW_ACCURACY")
	add(gaps > 0, "GPS_GAP")
	add(dups > 5 || stale > 2, "DUPLICATE_POINTS")

	score := 100.0 - float64(jumps*8) - float64(invalidSpeed*5) - math.Min(30, float64(badAcc)) - float64(gaps*4) - float64(stale*6)
	score = math.Max(0, math.Min(100, score))

	fail := func(status, reason string) Result {
		rs := reasons
		if len(rs) == 0 {
			if status == "rejected" {
				rs = []string{"UNREALISTIC_DISTANCE"}
			} else {
				rs = []string{"HIGH_SPEED"}
			}
		}
		return Result{Status: status, Reason: reason, Reasons: rs, DistanceKm: distanceKm,
			AvgSpeed: &avgSpeed, MaxSpeed: &maxSpeed, Score: score}
	}

	total := float64(len(track))
	switch {
	case maxSpeed > speedRejectAbove:
		return fail("rejected", fmt.Sprintf("Максимальная скорость %.1f км/ч превышает лимит %s км/ч", maxSpeed, jsNum(maxSpeedKmh)))
	case invalidSpeed > 0:
		return fail("rejected", "Превышен лимит скорости "+jsNum(maxSpeedKmh)+" км/ч")
	case jumps > 3:
		return fail("rejected", "Подозрительные скачки GPS")
	case float64(badAcc) > total*0.5:
		return fail("rejected", "Слабый сигнал GPS")
	case stale > 2:
		return fail("rejected", "Одинаковые координаты слишком долго")
	case tsIssues > 2:
		return fail("rejected", "Некорректные метки времени GPS")
	case float64(suspicious) > total*0.3 || gaps > 3 || jumps > 0:
		if jumps > 0 {
			return fail("suspicious", "Подозрительные скачки GPS")
		}
		return fail("suspicious", "Подозрительная скорость")
	}

	validPace := (avgSpeed >= walkMin && avgSpeed <= walkMax) || (avgSpeed >= runMin && avgSpeed <= runMax) || avgSpeed == 0
	if !validPace && avgSpeed > runMax {
		return fail("suspicious", "Средняя скорость вне нормы")
	}

	overall := 0.0
	if durationSeconds > 0 {
		overall = distanceKm / durationSeconds * 3600
	}
	if overall > speedRejectAbove {
		reasons = append(reasons, "UNREALISTIC_DISTANCE")
		return fail("rejected", "Нереалистичная дистанция за время тренировки")
	}

	if reasons == nil {
		reasons = []string{}
	}
	return Result{OK: true, Status: "approved", Reasons: reasons, DistanceKm: distanceKm, ApprovedDistanceKm: distanceKm,
		AvgSpeed: &avgSpeed, MaxSpeed: &maxSpeed, Score: score}
}
