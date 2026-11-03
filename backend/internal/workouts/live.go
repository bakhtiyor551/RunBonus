package workouts

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/gps"
	"runbonus/api/internal/httpx"

	"github.com/golang-jwt/jwt/v5"
)

const (
	AdminWSPath   = "/admin/live-tracking"
	WorkoutWSPath = "/app/workout"

	maxSessionDuration    = 24 * time.Hour
	abandonedNoGpsMinutes = 30
	futureTolerance       = 2 * time.Minute
)

// --- Live GPS для админки ---

type adminHub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]struct{}
}

var admins = &adminHub{clients: map[*websocket.Conn]struct{}{}}

func writeJSON(c *websocket.Conn, v any) {
	b, _ := json.Marshal(v)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = c.Write(ctx, websocket.MessageText, b)
}

func (h *adminHub) broadcast(msgType string, data httpx.M) {
	msg := httpx.M{"type": msgType}
	for k, v := range data {
		msg[k] = v
	}
	h.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(h.clients))
	for c := range h.clients {
		conns = append(conns, c)
	}
	h.mu.Unlock()
	for _, c := range conns {
		go writeJSON(c, msg)
	}
}

func EmitWorkoutStarted(row httpx.M) { admins.broadcast("workout_started", httpx.M{"workout": row}) }

func EmitWorkoutClosed(workoutID any, status string, extra httpx.M) {
	data := httpx.M{"workout_id": workoutID, "status": status}
	for k, v := range extra {
		data[k] = v
	}
	admins.broadcast("workout_closed", data)
}

func EmitPointReceived(workoutID any, points []httpx.M, distanceKm float64, meta httpx.M) {
	if len(points) == 0 {
		return
	}
	data := httpx.M{"workout_id": workoutID, "points": points, "distance_km": distanceKm}
	for k, v := range meta {
		data[k] = v
	}
	admins.broadcast("point_received", data)
}

func verifyToken(token, secret, claim string) int64 {
	if token == "" {
		return 0
	}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return []byte(secret), nil },
		jwt.WithValidMethods([]string{"HS256"})); err != nil {
		return 0
	}
	return int64(db.ToFloat(claims[claim]))
}

func adminWS(w http.ResponseWriter, r *http.Request) {
	if verifyToken(r.URL.Query().Get("token"), config.C.JWTAdminSecret, "adminId") == 0 {
		http.Error(w, "", http.StatusUnauthorized)
		return
	}
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	admins.mu.Lock()
	admins.clients[c] = struct{}{}
	admins.mu.Unlock()
	defer func() {
		admins.mu.Lock()
		delete(admins.clients, c)
		admins.mu.Unlock()
		c.CloseNow()
	}()

	if snap, err := LiveSnapshot(r.Context()); err != nil {
		log.Println("[live-ws] snapshot error", err)
		writeJSON(c, httpx.M{"type": "error", "message": "Не удалось загрузить снимок"})
	} else {
		snap["type"] = "live_snapshot"
		writeJSON(c, snap)
	}
	// Входящие сообщения админки не обрабатываются — читаем до закрытия.
	for {
		if _, _, err := c.Read(context.Background()); err != nil {
			return
		}
	}
}

// --- точки в формате live-карты ---

func mapPointRow(row db.Row) httpx.M {
	lat := row["lat"]
	if lat == nil {
		lat = row["latitude"]
	}
	lng := row["lng"]
	if lng == nil {
		lng = row["longitude"]
	}
	var speed, acc any
	if row["speed"] != nil {
		speed = row.Float("speed")
	}
	if row["accuracy"] != nil {
		acc = row.Float("accuracy")
	}
	return httpx.M{"lat": db.ToFloat(lat), "lng": db.ToFloat(lng), "speed": speed, "accuracy": acc, "recorded_at": row["recorded_at"]}
}

func livePointToGps(p httpx.M) gps.Point {
	pt := gps.Point{Latitude: db.ToFloat(p["lat"]), Longitude: db.ToFloat(p["lng"]), RecordedAt: p["recorded_at"]}
	if v, ok := p["speed"].(float64); ok {
		pt.Speed = &v
	}
	if v, ok := p["accuracy"].(float64); ok {
		pt.Accuracy = &v
	}
	return pt
}

// PointTimestampValid — защита от подмены времени точек.
func PointTimestampValid(startedAt time.Time, recordedAt any) bool {
	if startedAt.IsZero() || recordedAt == nil {
		return true
	}
	t, ok := gps.ParseJSDate(recordedAt)
	if !ok {
		return true
	}
	if t.After(startedAt.Add(maxSessionDuration)) {
		return false
	}
	return !t.After(time.Now().Add(futureTolerance))
}

// BuildLiveRow — buildWorkoutLiveRow.
func BuildLiveRow(w httpx.M, points []httpx.M) httpx.M {
	track := make([]gps.Point, 0, len(points))
	for _, p := range points {
		track = append(track, livePointToGps(p))
	}
	dist := 0.0
	if len(track) >= 2 {
		dist = gps.DistanceKm(track)
	}
	elapsed := int64(0)
	if t, ok := gps.ParseJSDate(w["started_at"]); ok {
		elapsed = max(0, int64(time.Since(t).Seconds()))
	}
	var lastAt, lastPos any
	if n := len(points); n > 0 {
		last := points[n-1]
		lastAt = last["recorded_at"]
		lastPos = httpx.M{"lat": last["lat"], "lng": last["lng"]}
	}
	if points == nil {
		points = []httpx.M{}
	}
	return httpx.M{
		"workout_id": w["id"], "user_id": w["user_id"], "client_name": w["client_name"], "phone": w["phone"],
		"started_at": w["started_at"], "status": w["status"],
		"steps_count": db.ToFloat(w["steps_count"]), "pause_seconds": db.ToFloat(w["pause_seconds"]),
		"distance_km": dist, "elapsed_seconds": elapsed, "points_count": len(points),
		"last_point_at": lastAt, "last_position": lastPos, "points": points,
	}
}

// CloseAbandoned — in_progress без GPS-активности дольше 30 минут → auto_closed.
func CloseAbandoned(ctx context.Context, q db.Querier) ([]any, error) {
	rows, err := db.Query(ctx, q, `SELECT w.id FROM workouts w
		WHERE w.status = 'in_progress'
		  AND COALESCE((SELECT MAX(p.recorded_at) FROM workout_points p WHERE p.workout_id = w.id), w.started_at)
		      < DATE_SUB(NOW(), INTERVAL ? MINUTE)`, abandonedNoGpsMinutes)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	ids := make([]any, len(rows))
	for i, r := range rows {
		ids[i] = r["id"]
	}
	_, _, err = db.Exec(ctx, q, `UPDATE workouts SET status = 'auto_closed', approved_distance_km = 0, validation_status = 'auto_closed',
		reject_reason = 'Тренировка отменена (нет активности GPS)', finished_at = NOW()
		WHERE id IN (`+placeholders(len(ids))+`)`, ids...)
	return ids, err
}

func placeholders(n int) string { return strings.TrimSuffix(strings.Repeat("?,", n), ",") }

// LiveSnapshot — все in_progress тренировки с точками.
func LiveSnapshot(ctx context.Context) (httpx.M, error) {
	closed, err := CloseAbandoned(ctx, db.Pool)
	if err != nil {
		return nil, err
	}
	for _, id := range closed {
		EmitWorkoutClosed(id, "rejected", nil)
	}
	ws, err := db.Query(ctx, db.Pool, `SELECT w.id, w.user_id, u.name AS client_name, u.phone, w.started_at, w.status,
			w.steps_count, w.pause_seconds, w.moving_seconds, w.duration_seconds, w.avg_speed, w.max_speed, w.distance_km
		FROM workouts w JOIN users u ON u.id = w.user_id
		WHERE w.status = 'in_progress' ORDER BY w.started_at DESC`)
	if err != nil {
		return nil, err
	}
	out := []httpx.M{}
	if len(ws) > 0 {
		ids := make([]any, len(ws))
		for i, w := range ws {
			ids[i] = w["id"]
		}
		pts, err := db.Query(ctx, db.Pool, `SELECT workout_id, latitude AS lat, longitude AS lng, speed, accuracy, recorded_at
			FROM workout_points WHERE workout_id IN (`+placeholders(len(ids))+`) ORDER BY workout_id, recorded_at`, ids...)
		if err != nil {
			return nil, err
		}
		byW := map[int64][]httpx.M{}
		for _, p := range pts {
			byW[p.Int("workout_id")] = append(byW[p.Int("workout_id")], mapPointRow(p))
		}
		for _, w := range ws {
			started := w.Time("started_at")
			var shown []httpx.M
			for _, p := range byW[w.Int("id")] {
				if t, ok := gps.ParseJSDate(p["recorded_at"]); ok && t.Before(started) {
					p["recorded_at"] = db.ISO(started)
				}
				if PointTimestampValid(started, p["recorded_at"]) {
					shown = append(shown, p)
				}
			}
			out = append(out, BuildLiveRow(httpx.M(w), shown))
		}
	}
	return httpx.M{"workouts": out, "updated_at": db.ISO(time.Now())}, nil
}

// --- WebSocket тренировки (приложение) ---

type userConn struct {
	c         *websocket.Conn
	userID    int64
	workoutID int64
}

var (
	userMu      sync.Mutex
	userSockets = map[int64]*userConn{}
)

// SendWorkoutCommand — сообщение в сокет тренировки пользователя.
func SendWorkoutCommand(userID int64, msgType string, data httpx.M) bool {
	userMu.Lock()
	uc := userSockets[userID]
	userMu.Unlock()
	if uc == nil {
		return false
	}
	msg := httpx.M{"type": msgType}
	for k, v := range data {
		msg[k] = v
	}
	writeJSON(uc.c, msg)
	return true
}

func workoutWS(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	userID := verifyToken(q.Get("token"), config.C.JWTSecret, "userId")
	device := q.Get("device_id")
	if device == "" {
		device = r.Header.Get("X-Device-Id")
	}
	workoutID := int64(db.ToFloat(q.Get("workout_id")))
	ok := userID != 0 && auth.AssertMatchingDevice(r.Context(), db.Pool, userID, device) == nil && workoutID != 0
	if ok {
		row, err := db.One(r.Context(), db.Pool, "SELECT id FROM workouts WHERE id = ? AND user_id = ? AND status = 'in_progress'", workoutID, userID)
		ok = err == nil && row != nil
	}
	if !ok {
		http.Error(w, "", http.StatusUnauthorized)
		return
	}
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	c.SetReadLimit(4 << 20)
	uc := &userConn{c: c, userID: userID, workoutID: workoutID}
	userMu.Lock()
	userSockets[userID] = uc
	userMu.Unlock()
	log.Printf("[workout-ws] connected user=%d workout=%d", userID, workoutID)
	defer func() {
		userMu.Lock()
		if userSockets[userID] == uc {
			delete(userSockets, userID)
		}
		userMu.Unlock()
		c.CloseNow()
		log.Printf("[workout-ws] disconnected user=%d", userID)
	}()

	writeJSON(c, httpx.M{"type": "connected", "workout_id": workoutID, "ok": true})
	for {
		_, data, err := c.Read(context.Background())
		if err != nil {
			return
		}
		if done := handleWSMessage(uc, data); done {
			return
		}
	}
}

// handleWSMessage возвращает true, если соединение нужно закрыть.
func handleWSMessage(uc *userConn, raw []byte) bool {
	ctx := context.Background()
	var msg map[string]any
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	if dec.Decode(&msg) != nil {
		writeJSON(uc.c, httpx.M{"type": "error", "message": "Некорректный JSON"})
		return false
	}
	reqID := msg["request_id"]
	switch msg["type"] {
	case "ping":
		writeJSON(uc.c, httpx.M{"type": "pong"})
	case "client_point_send":
		var steps any
		if v, ok := msg["steps_count"]; ok {
			steps = v
		}
		res, err := SavePoints(ctx, uc.workoutID, uc.userID, toPointList(msg["points"]), steps)
		if err != nil {
			log.Println("[workout-ws] message error", err)
			writeJSON(uc.c, httpx.M{"type": "error", "message": "Ошибка обработки"})
			return false
		}
		if res == nil {
			writeJSON(uc.c, httpx.M{"type": "points_ack", "ok": false, "error": "workout_not_active", "request_id": reqID})
			return false
		}
		if res.Fraud != "" {
			_, _ = ForceStop(ctx, uc.workoutID, uc.userID, res.Fraud)
			EmitWorkoutClosed(uc.workoutID, "rejected", httpx.M{"reason": res.Fraud})
			writeJSON(uc.c, httpx.M{"type": "workout_force_stop", "message": res.Fraud, "reason": "speed_fraud"})
			_ = uc.c.Close(4000, "speed_fraud")
			return true
		}
		writeJSON(uc.c, httpx.M{"type": "points_ack", "ok": true, "saved": len(res.Saved), "distance_km": res.DistanceKm, "request_id": reqID})
	case "client_finish":
		writeJSON(uc.c, httpx.M{"type": "finish_ack", "ok": true, "request_id": reqID})
		_ = uc.c.Close(websocket.StatusNormalClosure, "finish")
		return true
	default:
		writeJSON(uc.c, httpx.M{"type": "error", "message": "Неизвестный тип события"})
	}
	return false
}

// toPointList — точки из тела: массив объектов или один объект.
func toPointList(v any) []map[string]any {
	switch x := v.(type) {
	case []any:
		out := make([]map[string]any, 0, len(x))
		for _, it := range x {
			if m, ok := it.(map[string]any); ok {
				out = append(out, m)
			} else {
				out = append(out, map[string]any{})
			}
		}
		return out
	case map[string]any:
		return []map[string]any{x}
	case httpx.Body:
		return []map[string]any{x}
	}
	return nil
}
