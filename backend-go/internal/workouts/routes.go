// Package workouts — тренировки и GPS: REST, WebSocket, Live GPS (этап 5).
package workouts

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/challenges"
	"runbonus/api/internal/db"
	"runbonus/api/internal/gps"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/rewards"
	"runbonus/api/internal/shoes"
)

func Register(r chi.Router) {
	r.Get(WorkoutWSPath, workoutWS)
	r.Get(AdminWSPath, adminWS)

	r.Route("/api/workouts", func(r chi.Router) {
		r.Use(auth.User)
		r.Get("/active", httpx.H("Ошибка загрузки активной тренировки", current))
		r.Get("/current", httpx.H("Ошибка загрузки активной тренировки", current))
		r.With(auth.ActiveUser, auth.ActiveShoe).Post("/start", httpx.H("Не удалось начать тренировку", start))
		r.Post("/point", httpx.H("Ошибка сохранения точки", func(w http.ResponseWriter, r *http.Request) error {
			b := httpx.BodyOf(r)
			return pointsResponse(w, r, b.Raw("workout_id"), []map[string]any{b})
		}))
		r.Post("/{id}/pause", httpx.H("Не удалось поставить на паузу", pause))
		r.Post("/{id}/resume", httpx.H("Не удалось продолжить тренировку", resume))
		r.Post("/{id}/points", httpx.H("Ошибка сохранения точек", func(w http.ResponseWriter, r *http.Request) error {
			b := httpx.BodyOf(r)
			list := toPointList(b["points"])
			if len(list) == 0 {
				list = []map[string]any{b}
			}
			return pointsResponse(w, r, chi.URLParam(r, "id"), list)
		}))
		r.Post("/finish", httpx.H("Ошибка завершения тренировки", func(w http.ResponseWriter, r *http.Request) error {
			return finishResponse(w, r, httpx.BodyOf(r).Raw("workout_id"))
		}))
		r.Post("/{id}/finish", httpx.H("Ошибка завершения тренировки", func(w http.ResponseWriter, r *http.Request) error {
			return finishResponse(w, r, chi.URLParam(r, "id"))
		}))
		r.Get("/history", httpx.H("Ошибка загрузки истории", history))
		r.Get("/", httpx.H("Ошибка загрузки истории", history))
		r.Get("/{id}/points", httpx.H("Ошибка загрузки маршрута", routePoints))
	})
}

func closeStale(ctx context.Context, q db.Querier, userID int64) error {
	_, _, err := db.Exec(ctx, q, `UPDATE workouts SET status = 'auto_closed', approved_distance_km = 0, validation_status = 'auto_closed',
		reject_reason = 'Автоматически закрыта: более 24 часов без завершения', finished_at = NOW()
		WHERE user_id = ? AND status IN ('in_progress', 'paused') AND started_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`, userID)
	return err
}

func current(w http.ResponseWriter, r *http.Request) error {
	ctx, uid := r.Context(), auth.UserID(r)
	if err := closeStale(ctx, db.Pool, uid); err != nil {
		return err
	}
	if _, err := CloseAbandoned(ctx, db.Pool); err != nil {
		return err
	}
	row, err := db.One(ctx, db.Pool, `SELECT id, started_at, status FROM workouts
		WHERE user_id = ? AND status IN ('in_progress', 'paused') ORDER BY started_at DESC LIMIT 1`, uid)
	if err != nil {
		return err
	}
	if row == nil {
		httpx.OK(w, httpx.M{"active": false, "workoutId": nil, "id": nil})
		return nil
	}
	httpx.OK(w, httpx.M{"active": true, "workoutId": row["id"], "id": row["id"], "started_at": row["started_at"], "status": row["status"]})
	return nil
}

func start(w http.ResponseWriter, r *http.Request) error {
	ctx, uid, b := r.Context(), auth.UserID(r), httpx.BodyOf(r)
	shoe, err := db.One(ctx, db.Pool, "SELECT s.* FROM user_active_shoes uas JOIN shoes s ON s.id = uas.shoe_id WHERE uas.user_id = ?", uid)
	if err != nil {
		return err
	}
	if shoe == nil {
		return httpx.E(400, "Сначала активируйте кроссовки")
	}
	if shoe.Str("status") != "activated" {
		return httpx.E(400, "Кроссовки не активированы")
	}

	var device any
	if v := b.Raw("deviceId", "device_id"); v != nil {
		s := []rune(httpx.ToString(v))
		if len(s) > 128 {
			s = s[:128]
		}
		device = string(s)
	}

	var newID int64
	var existing db.Row
	err = db.Tx(ctx, func(tx *sql.Tx) error {
		if err := closeStale(ctx, tx, uid); err != nil {
			return err
		}
		if _, err := CloseAbandoned(ctx, tx); err != nil {
			return err
		}
		ex, err := db.One(ctx, tx, `SELECT id, status FROM workouts WHERE user_id = ? AND status IN ('in_progress', 'paused')
			ORDER BY started_at DESC LIMIT 1`, uid)
		if err != nil || ex != nil {
			existing = ex
			return err
		}
		newID, _, err = db.Exec(ctx, tx, `INSERT INTO workouts (user_id, shoe_id, device_id, started_at, status, background_tracking)
			VALUES (?, ?, ?, NOW(), 'in_progress', TRUE)`, uid, shoe["id"], device)
		if db.IsBadField(err) {
			newID, _, err = db.Exec(ctx, tx, `INSERT INTO workouts (user_id, shoe_id, started_at, status, background_tracking)
				VALUES (?, ?, NOW(), 'in_progress', TRUE)`, uid, shoe["id"])
		}
		return err
	})
	if err != nil {
		return err
	}
	if existing != nil {
		httpx.JSON(w, 409, httpx.M{"error": "ACTIVE_WORKOUT_EXISTS", "code": "ACTIVE_WORKOUT_EXISTS", "workoutId": existing["id"], "id": existing["id"]})
		return nil
	}

	user, _ := db.One(ctx, db.Pool, "SELECT name AS client_name, phone FROM users WHERE id = ?", uid)
	if user == nil {
		user = db.Row{}
	}
	EmitWorkoutStarted(BuildLiveRow(httpx.M{
		"id": newID, "user_id": uid, "client_name": user["client_name"], "phone": user["phone"],
		"started_at": db.ISO(time.Now()), "status": "in_progress", "steps_count": 0, "pause_seconds": 0,
	}, nil))
	httpx.JSON(w, 201, httpx.M{"workoutId": newID, "id": newID, "challenge": httpx.M{"started": false, "reason": "deferred_to_finish"}})
	return nil
}

func pointsResponse(w http.ResponseWriter, r *http.Request, workoutID any, list []map[string]any) error {
	ctx, uid := r.Context(), auth.UserID(r)
	res, err := SavePoints(ctx, workoutID, uid, list, nil)
	if err != nil {
		return err
	}
	if res != nil && res.Fraud != "" {
		if _, err := ForceStop(ctx, workoutID, uid, res.Fraud); err != nil {
			return err
		}
		SendWorkoutCommand(uid, "workout_force_stop", httpx.M{"message": res.Fraud, "reason": "speed_fraud"})
		EmitWorkoutClosed(workoutID, "rejected", httpx.M{"reason": res.Fraud})
		res = nil
	}
	if res == nil {
		return httpx.E(404, "Тренировка не найдена")
	}
	httpx.OK(w, httpx.M{"ok": true})
	return nil
}

func pause(w http.ResponseWriter, r *http.Request) error {
	ctx, uid := r.Context(), auth.UserID(r)
	wk, err := activeWorkout(ctx, chi.URLParam(r, "id"), uid)
	if err != nil {
		return err
	}
	if wk == nil {
		return httpx.EC(404, "Активная тренировка не найдена", "WORKOUT_NOT_ACTIVE")
	}
	if wk.Str("status") != "paused" {
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE workouts SET status = 'paused', paused_at = NOW() WHERE id = ? AND user_id = ?", wk["id"], uid); err != nil {
			return err
		}
	}
	httpx.OK(w, httpx.M{"ok": true, "status": "paused", "workoutId": wk["id"]})
	return nil
}

func resume(w http.ResponseWriter, r *http.Request) error {
	ctx, uid := r.Context(), auth.UserID(r)
	wk, err := activeWorkout(ctx, chi.URLParam(r, "id"), uid)
	if err != nil {
		return err
	}
	if wk == nil {
		return httpx.EC(404, "Активная тренировка не найдена", "WORKOUT_NOT_ACTIVE")
	}
	if _, _, err := db.Exec(ctx, db.Pool, "UPDATE workouts SET status = 'in_progress', paused_at = NULL WHERE id = ? AND user_id = ?", wk["id"], uid); err != nil {
		return err
	}
	httpx.OK(w, httpx.M{"ok": true, "status": "in_progress", "workoutId": wk["id"]})
	return nil
}

const historySQL = `SELECT id, distance_km, duration_seconds, avg_speed, max_speed, steps_count, moving_seconds, pause_seconds,
		started_at, finished_at, status, reject_reason
	FROM workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT 50`

func history(w http.ResponseWriter, r *http.Request) error {
	rows, err := db.Query(r.Context(), db.Pool, historySQL, auth.UserID(r))
	if err != nil {
		return err
	}
	httpx.OK(w, rows)
	return nil
}

func routePoints(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := db.ToFloat(chi.URLParam(r, "id"))
	wk, err := db.One(ctx, db.Pool, "SELECT id FROM workouts WHERE id = ? AND user_id = ?", id, auth.UserID(r))
	if err != nil {
		return err
	}
	if wk == nil {
		return httpx.E(404, "Тренировка не найдена")
	}
	rows, err := db.Query(ctx, db.Pool, `SELECT latitude, longitude, speed, accuracy, recorded_at FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`, id)
	if err != nil {
		return err
	}
	httpx.OK(w, httpx.M{"points": rows})
	return nil
}

// --- финиш ---

func bonusSettings(ctx context.Context, q db.Querier) gps.Settings {
	s := gps.Settings{MinDurationMinutes: 5, MinDistanceKm: 0.5, MaxSpeedKmh: 18}
	row, err := db.One(ctx, q, "SELECT * FROM bonus_settings WHERE status = 'active' ORDER BY id DESC LIMIT 1")
	if err != nil || row == nil {
		return s
	}
	return gps.Settings{MinDurationMinutes: row.Float("min_duration_minutes"), MinDistanceKm: row.Float("min_distance_km"), MaxSpeedKmh: row.Float("max_speed_kmh")}
}

// metaInt — Math.max(0, Math.floor(Number(v))) или nil, если поле не передано.
func metaInt(b httpx.Body, k string) any {
	v, ok := b[k]
	if !ok || v == nil {
		return nil
	}
	f := math.Max(0, math.Floor(gps.JSNumber(v, true)))
	if math.IsNaN(f) {
		return nil
	}
	return f
}

func finishResponse(w http.ResponseWriter, r *http.Request, workoutID any) error {
	b := httpx.BodyOf(r)
	status, body, err := Finish(r.Context(), workoutID, auth.UserID(r), toPointList(b["points"]), b)
	if err != nil {
		return err
	}
	httpx.JSON(w, status, body)
	return nil
}

func notActive(row db.Row) httpx.M {
	return httpx.M{"error": "Эта тренировка уже завершена. Начните новую с главного экрана.", "code": "WORKOUT_NOT_ACTIVE",
		"workout_id": row["id"], "status": row["status"]}
}

// Finish — finishWorkout: серверная валидация трека, прогресс, задания, награды.
func Finish(ctx context.Context, workoutID any, userID int64, clientPoints []map[string]any, meta httpx.Body) (int, httpx.M, error) {
	var (
		status   = 200
		resp     httpx.M
		final    string
		workout  db.Row
		distance float64
		approved float64
		duration float64
		reject   any
		reasons  []string
		finished = time.Now()
	)

	err := db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		workout, err = db.One(ctx, tx, `SELECT w.*, s.status AS shoe_status FROM workouts w JOIN shoes s ON s.id = w.shoe_id
			WHERE w.id = ? AND w.user_id = ? FOR UPDATE`, workoutID, userID)
		if err != nil {
			return err
		}
		if workout == nil {
			anyRow, err := db.One(ctx, tx, "SELECT id, status FROM workouts WHERE id = ? AND user_id = ?", workoutID, userID)
			if err != nil {
				return err
			}
			if anyRow != nil {
				status, resp = 400, notActive(anyRow)
			} else {
				status, resp = 404, httpx.M{"error": "Тренировка не найдена"}
			}
			return errAbort
		}
		if s := workout.Str("status"); s != "in_progress" && s != "paused" {
			status, resp = 400, notActive(workout)
			return errAbort
		}

		if len(clientPoints) > 0 {
			last, err := lastPoint(ctx, tx, workoutID)
			if err != nil {
				return err
			}
			var rows []pointRow
			for _, raw := range clientPoints {
				p, ok := gps.Normalize(raw)
				if !ok || (last != nil && gps.SameCoordinates(*last, p)) {
					continue
				}
				t, ok := p.Time()
				if !ok {
					t = time.Now()
				}
				rows = append(rows, pointRow{point: p, recordedAt: t})
				lp := p
				last = &lp
			}
			if err := insertPoints(ctx, tx, workoutID, rows); err != nil {
				return err
			}
		}

		dbPoints, err := trackFromDB(ctx, tx, workoutID)
		if err != nil {
			return err
		}

		serverDuration := math.Floor(finished.Sub(workout.Time("started_at")).Seconds())
		duration = serverDuration
		if cd := gps.JSNumber(meta["duration_seconds"], meta.Has("duration_seconds")); cd > 0 {
			duration = math.Floor(cd)
		}
		steps, moving, pauseSec := metaInt(meta, "steps_count"), metaInt(meta, "moving_seconds"), metaInt(meta, "pause_seconds")

		settings := bonusSettings(ctx, tx)
		if _, _, err := db.Exec(ctx, tx, "UPDATE workouts SET status = 'processing' WHERE id = ? AND status IN ('in_progress', 'paused')", workoutID); err != nil {
			return err
		}

		v := gps.Validate(dbPoints, duration, settings)
		clientTrack := 0.0
		if len(clientPoints) > 0 {
			clientTrack = gps.DistanceKm(gps.NormalizeAll(clientPoints))
		}
		distance = v.DistanceKm
		if distance < 0.001 && clientTrack > 0 {
			distance = clientTrack
			if v.OK {
				v.DistanceKm, v.ApprovedDistanceKm, v.OK, v.Status = distance, 0, false, "suspicious"
				v.Reason, v.Reasons = "Недостаточно серверных GPS-точек", []string{"GPS_GAP"}
			}
		}

		final = v.Status
		if final == "" {
			final = "rejected"
		}
		if !v.OK {
			reject = v.Reason
		}
		progressKm := 0.0
		switch {
		case v.OK && v.Status == "approved":
			if workout.Str("shoe_status") == "blocked" {
				final, reject = "rejected", "Кроссовки заблокированы"
			} else {
				final = "approved"
				approved = v.ApprovedDistanceKm
				progressKm = approved
				if _, err := shoes.EnsureProgress(ctx, tx, userID, workout.Int("shoe_id")); err != nil {
					return err
				}
			}
		case final == "suspicious":
		default:
			final = "rejected"
		}

		var avgPace any
		if approved > 0 && duration > 0 {
			avgPace = duration / approved
		}
		var reasonsJSON any
		if len(v.Reasons) > 0 {
			bs, _ := json.Marshal(v.Reasons)
			reasonsJSON = string(bs)
		}
		reasons = v.Reasons
		active := any(duration)
		if moving != nil {
			active = moving
		}
		if _, _, err := db.Exec(ctx, tx, `UPDATE workouts SET
				distance_km = ?, approved_distance_km = ?, duration_seconds = ?,
				active_duration_seconds = ?, avg_speed = ?, max_speed = ?, avg_pace = ?,
				gps_points_count = ?, steps_count = ?, moving_seconds = ?, pause_seconds = ?,
				finished_at = ?, status = ?, reject_reason = ?,
				validation_status = ?, validation_score = ?, validation_reasons = ?,
				price_per_km = ?, calculated_bonus = ?, level_snapshot = ?, bonus_breakdown = ?
			WHERE id = ?`,
			distance, approved, duration, active, ptr(v.AvgSpeed), ptr(v.MaxSpeed), avgPace,
			len(dbPoints), steps, moving, pauseSec,
			finished, final, reject, final, v.Score, reasonsJSON, 0, 0, nil, nil, workoutID); err != nil {
			return err
		}
		if final == "approved" && progressKm > 0 {
			if _, _, err := shoes.ApplyWorkoutProgress(ctx, tx, userID, workout.Int("shoe_id"), progressKm, 0); err != nil {
				return err
			}
		}
		return nil
	})
	if err == errAbort {
		return status, resp, nil
	}
	if err != nil {
		return 0, nil, err
	}

	var unlocked []db.Row
	var challenge httpx.M
	if final == "approved" {
		challenges.EnsureForFinishedWorkout(ctx, userID, workout.Time("started_at"))
		if c, err := challenges.ApplyWorkout(ctx, userID); err != nil {
			log.Println("[workout/finish/challenge]", err)
		} else {
			challenge = c
		}
		if u, err := rewards.UnlockMilestones(ctx, db.Pool, userID); err != nil {
			log.Println("[workout/finish/rewards]", err)
		} else {
			unlocked = u
			rewards.NotifyUnlocked(userID, unlocked)
		}
	}
	if challenge == nil {
		if st, err := challenges.State(ctx, userID); err == nil {
			challenge, _ = st["challenge"].(httpx.M)
		}
	}

	EmitWorkoutClosed(workoutID, final, httpx.M{"distance_km": distance, "approved_distance_km": approved, "client_name": nil})

	out := clientFinish(final, distance, approved, duration, reject, reasons)
	if len(unlocked) > 0 {
		list := make([]httpx.M, 0, len(unlocked))
		for _, m := range unlocked {
			list = append(list, httpx.M{"id": m["id"], "distance": m.Float("distance_km"), "name": m["name"]})
		}
		out["rewards_unlocked"] = list
		first := unlocked[0]
		out["reward_popup"] = httpx.M{"title": "Поздравляем!", "message": "Вы достигли " + first.Str("distance_km") + " км! Вам доступна награда",
			"milestoneId": first["id"], "distance": first.Float("distance_km")}
	}
	if challenge != nil {
		out["challenge"] = challenge
		if challenge["status"] == "COMPLETED" {
			out["challenge_completed"] = true
			out["challenge_popup"] = httpx.M{"title": "Задание выполнено!",
				"message":     jsNum(challenge["currentKm"]) + " / " + jsNum(challenge["targetKm"]) + " KM",
				"challengeId": challenge["id"]}
		}
	}
	return 200, out, nil
}

type abortErr struct{}

func (abortErr) Error() string { return "abort" }

var errAbort error = abortErr{}

// jsNum — String(number) из JS.
func jsNum(v any) string { return strconv.FormatFloat(db.ToFloat(v), 'f', -1, 64) }

// clientFinish — buildClientFinishResponse (undefined-поля опускаются).
func clientFinish(final string, distance, approved, duration float64, reject any, reasons []string) httpx.M {
	approvedKm := 0.0
	if final == "approved" {
		approvedKm = approved
	}
	out := httpx.M{
		"title": "Тренировка завершена!", "status": final,
		"distance_km": distance, "distanceKm": distance,
		"approved_distance_km": approvedKm, "approvedDistanceKm": approvedKm,
		"duration_seconds": duration, "bonus_credited": false, "bonus_earned": 0,
	}
	if s, _ := reject.(string); s != "" {
		out["reject_reason"] = s
	}
	if reasons != nil {
		out["validation_reasons"] = reasons
	}
	switch {
	case final == "approved":
	case reject != nil && reject != "":
		out["message"] = reject
	case final == "suspicious":
		out["message"] = "Тренировка на проверке у администратора"
	case final == "processing":
		out["message"] = "Идёт проверка GPS…"
	default:
		out["message"] = "Дистанция на проверке"
	}
	return out
}

// AutoCloseStale — фоновая задача: тренировки старше 24 ч → auto_closed.
func AutoCloseStale(ctx context.Context) {
	rows, err := db.Query(ctx, db.Pool, `SELECT id, user_id FROM workouts
		WHERE status IN ('in_progress', 'paused') AND started_at < (NOW() - INTERVAL 24 HOUR) LIMIT 50`)
	if err != nil {
		log.Println("[auto-close]", err)
		return
	}
	for _, wk := range rows {
		_, _, err := db.Exec(ctx, db.Pool, `UPDATE workouts SET status = 'auto_closed', finished_at = COALESCE(finished_at, NOW()),
				approved_distance_km = 0, validation_status = 'auto_closed',
				reject_reason = 'Автоматически закрыта: более 24 часов без завершения', validation_reasons = JSON_ARRAY('AUTO_CLOSED')
			WHERE id = ? AND status IN ('in_progress', 'paused')`, wk["id"])
		if err != nil {
			log.Println("[auto-close]", wk["id"], err)
			continue
		}
		EmitWorkoutClosed(wk["id"], "auto_closed", httpx.M{"distance_km": 0, "client_name": nil})
	}
}
