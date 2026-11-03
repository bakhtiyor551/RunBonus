package workouts

import (
	"context"
	"fmt"
	"math"
	"time"

	"runbonus/api/internal/db"
	"runbonus/api/internal/gps"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
)

// ForceStopSpeedKmh — антифрод: принудительная остановка при аномальной скорости.
const ForceStopSpeedKmh = 60

func activeWorkout(ctx context.Context, workoutID any, userID int64) (db.Row, error) {
	return db.One(ctx, db.Pool, `SELECT * FROM workouts WHERE id = ? AND user_id = ? AND status IN ('in_progress', 'paused')`, workoutID, userID)
}

func lastPoint(ctx context.Context, q db.Querier, workoutID any) (*gps.Point, error) {
	r, err := db.One(ctx, q, `SELECT latitude, longitude, speed, accuracy, recorded_at FROM workout_points
		WHERE workout_id = ? ORDER BY recorded_at DESC LIMIT 1`, workoutID)
	if err != nil || r == nil {
		return nil, err
	}
	p, ok := gps.Normalize(r)
	if !ok {
		return nil, nil
	}
	return &p, nil
}

// detectSpeedFraud — скорость любой точки > 60 км/ч.
func detectSpeedFraud(points []map[string]any) string {
	for _, raw := range points {
		p, ok := gps.Normalize(raw)
		if !ok || p.Speed == nil || *p.Speed == 0 || math.IsNaN(*p.Speed) || math.IsInf(*p.Speed, 0) {
			continue
		}
		if *p.Speed > ForceStopSpeedKmh {
			return fmt.Sprintf("Аномальная скорость (%v км/ч). Пробежка аннулирована.", util.JSRound(*p.Speed))
		}
	}
	return ""
}

type pointRow struct {
	point      gps.Point
	recordedAt time.Time
}

// prepare — привязка recorded_at к старту тренировки (точки до старта переносятся на started_at).
func prepare(p gps.Point, startedAt time.Time) (pointRow, bool) {
	t, ok := p.Time()
	if !ok {
		t = time.Now()
	}
	if !startedAt.IsZero() && t.Before(startedAt) {
		t = startedAt
	}
	p.RecordedAt = db.ISO(t)
	return pointRow{point: p, recordedAt: t}, true
}

// clampToStart — clampPointToWorkoutStart.
func clampToStart(p gps.Point, startedAt time.Time) gps.Point {
	if startedAt.IsZero() {
		return p
	}
	t, ok := p.Time()
	if !ok || t.Before(startedAt) {
		p.RecordedAt = db.ISO(startedAt)
	}
	return p
}

func ptr(f *float64) any {
	if f == nil || math.IsNaN(*f) {
		return nil
	}
	return *f
}

func insertPoints(ctx context.Context, q db.Querier, workoutID any, rows []pointRow) error {
	if len(rows) == 0 {
		return nil
	}
	args := make([]any, 0, len(rows)*8)
	for _, r := range rows {
		args = append(args, workoutID, r.point.Latitude, r.point.Longitude, ptr(r.point.Speed), ptr(r.point.Accuracy),
			ptr(r.point.Altitude), ptr(r.point.Course), r.recordedAt)
	}
	_, _, err := db.Exec(ctx, q, `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, altitude, course, recorded_at)
		VALUES `+repeatGroup("(?, ?, ?, ?, ?, ?, ?, ?)", len(rows)), args...)
	if err == nil || !db.IsBadField(err) {
		return err
	}
	args = args[:0]
	for _, r := range rows {
		args = append(args, workoutID, r.point.Latitude, r.point.Longitude, ptr(r.point.Speed), ptr(r.point.Accuracy), r.recordedAt)
	}
	_, _, err = db.Exec(ctx, q, `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
		VALUES `+repeatGroup("(?, ?, ?, ?, ?, ?)", len(rows)), args...)
	return err
}

func repeatGroup(g string, n int) string {
	s := make([]byte, 0, (len(g)+2)*n)
	for i := 0; i < n; i++ {
		if i > 0 {
			s = append(s, ", "...)
		}
		s = append(s, g...)
	}
	return string(s)
}

// SaveResult — итог saveWorkoutPoints. nil — тренировка не найдена/не активна.
type SaveResult struct {
	Workout    db.Row
	Saved      []httpx.M
	DistanceKm float64
	Fraud      string
}

// SavePoints — saveWorkoutPoints: фильтр, вставка, дистанция, событие для live-карты.
func SavePoints(ctx context.Context, workoutID any, userID int64, list []map[string]any, steps any) (*SaveResult, error) {
	fraud := detectSpeedFraud(list)
	w, err := activeWorkout(ctx, workoutID, userID)
	if err != nil || w == nil {
		return nil, err
	}
	if fraud != "" {
		return &SaveResult{Workout: w, Saved: []httpx.M{}, Fraud: fraud}, nil
	}
	startedAt := w.Time("started_at")

	last, err := lastPoint(ctx, db.Pool, workoutID)
	if err != nil {
		return nil, err
	}
	prevLast := last
	var toInsert []pointRow
	var saved []gps.Point

	if last == nil {
		for _, raw := range list {
			p, ok := gps.Normalize(raw)
			if !ok {
				continue
			}
			p = clampToStart(p, startedAt)
			if !gps.ValidTrackPoint(p, true) || !PointTimestampValid(startedAt, p.RecordedAt) {
				continue
			}
			row, _ := prepare(p, startedAt)
			toInsert = append(toInsert, row)
			saved = append(saved, row.point)
			last = &saved[len(saved)-1]
			break
		}
	}
	for _, raw := range list {
		p, ok := gps.Normalize(raw)
		if !ok || !gps.ShouldSave(last, p) {
			continue
		}
		p = clampToStart(p, startedAt)
		if !PointTimestampValid(startedAt, p.RecordedAt) {
			continue
		}
		if last != nil && gps.SameCoordinates(*last, p) {
			continue
		}
		row, _ := prepare(p, startedAt)
		toInsert = append(toInsert, row)
		saved = append(saved, row.point)
		lp := saved[len(saved)-1]
		last = &lp
	}

	if err := insertPoints(ctx, db.Pool, workoutID, toInsert); err != nil {
		return nil, err
	}
	if steps != nil {
		n := math.Max(0, math.Floor(gps.JSNumber(steps, true)))
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE workouts SET steps_count = ? WHERE id = ?", nanToNil(n), workoutID); err != nil {
			return nil, err
		}
	}

	out := make([]httpx.M, 0, len(saved))
	for _, p := range saved {
		out = append(out, httpx.M{"lat": p.Latitude, "lng": p.Longitude, "speed": ptr(p.Speed), "accuracy": ptr(p.Accuracy), "recorded_at": p.RecordedAt})
	}
	res := &SaveResult{Workout: w, Saved: out}
	if len(saved) > 0 {
		if prevLast != nil {
			res.DistanceKm = util.Round(w.Float("distance_km")+gps.IncrementalKm(prevLast, saved), 3)
		} else if res.DistanceKm, err = workoutDistanceKm(ctx, db.Pool, workoutID); err != nil {
			return nil, err
		}
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE workouts SET distance_km = ? WHERE id = ?", res.DistanceKm, workoutID); err != nil {
			return nil, err
		}
		meta, _ := db.One(ctx, db.Pool, `SELECT u.name AS client_name, u.phone FROM workouts w JOIN users u ON u.id = w.user_id WHERE w.id = ?`, workoutID)
		if meta == nil {
			meta = db.Row{}
		}
		EmitPointReceived(numericID(workoutID), out, res.DistanceKm, httpx.M{"client_name": meta["client_name"], "phone": meta["phone"], "points_count": len(out)})
	}
	return res, nil
}

func workoutDistanceKm(ctx context.Context, q db.Querier, workoutID any) (float64, error) {
	pts, err := trackFromDB(ctx, q, workoutID)
	if err != nil || len(pts) < 2 {
		return 0, err
	}
	return gps.DistanceKm(pts), nil
}

func trackFromDB(ctx context.Context, q db.Querier, workoutID any) ([]gps.Point, error) {
	rows, err := db.Query(ctx, q, `SELECT latitude, longitude, speed, accuracy, recorded_at FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`, workoutID)
	if err != nil {
		return nil, err
	}
	list := make([]map[string]any, len(rows))
	for i, r := range rows {
		list[i] = r
	}
	return gps.NormalizeAll(list), nil
}

// ForceStop — тренировка отклонена антифродом.
func ForceStop(ctx context.Context, workoutID any, userID int64, reason string) (bool, error) {
	_, n, err := db.Exec(ctx, db.Pool, `UPDATE workouts SET status = 'rejected', reject_reason = ?, approved_distance_km = 0, finished_at = NOW()
		WHERE id = ? AND user_id = ? AND status IN ('in_progress', 'paused')`, reason, workoutID, userID)
	return n > 0, err
}

func nanToNil(f float64) any {
	if math.IsNaN(f) {
		return nil
	}
	return f
}

// numericID — id из URL/тела как число, если возможно (в Node emit-ы получали строку из params).
func numericID(v any) any {
	if s, ok := v.(string); ok {
		return s
	}
	return v
}
