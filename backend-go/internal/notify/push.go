package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
)

// Push — уведомление FCM. Data-значения всегда строки (требование FCM).
type Push struct {
	Title string
	Body  string
	Data  map[string]string
}

type PushResult struct {
	Sent    int    `json:"sent"`
	Failed  int    `json:"failed"`
	Skipped bool   `json:"skipped"`
	Reason  string `json:"reason,omitempty"`
}

var (
	fcmOnce    sync.Once
	fcmTokens  oauth2.TokenSource
	fcmProject string
)

func fcm() (oauth2.TokenSource, string) {
	fcmOnce.Do(func() {
		raw := config.C.FirebaseServiceAccount
		if len(raw) == 0 {
			log.Println("[Push] Firebase service account not configured — push send disabled")
			return
		}
		creds, err := google.CredentialsFromJSON(context.Background(), raw, "https://www.googleapis.com/auth/firebase.messaging")
		if err != nil {
			log.Println("[Push] Firebase init failed:", err)
			return
		}
		var sa struct {
			ProjectID string `json:"project_id"`
		}
		_ = json.Unmarshal(raw, &sa)
		fcmTokens, fcmProject = creds.TokenSource, sa.ProjectID
	})
	return fcmTokens, fcmProject
}

func PushConfigured() bool { return len(config.C.FirebaseServiceAccount) > 0 }

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// sendOne возвращает (ok, tokenInvalid).
func sendOne(ctx context.Context, ts oauth2.TokenSource, project, token string, p Push) (bool, bool) {
	tok, err := ts.Token()
	if err != nil {
		log.Println("[Push] token:", err)
		return false, false
	}
	data := p.Data
	if data == nil {
		data = map[string]string{}
	}
	title := p.Title
	if title == "" {
		title = "RunBonus"
	}
	msg := map[string]any{"message": map[string]any{
		"token":        token,
		"notification": map[string]string{"title": truncate(title, 255), "body": truncate(p.Body, 1024)},
		"data":         data,
		"android": map[string]any{
			"priority":     "high",
			"notification": map[string]string{"channel_id": "runbonus_default", "sound": "default"},
		},
	}}
	body, _ := json.Marshal(msg)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", project), bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return false, false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 300 {
		return true, false
	}
	var e struct {
		Error struct {
			Status  string `json:"status"`
			Details []struct {
				ErrorCode string `json:"errorCode"`
			} `json:"details"`
		} `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&e)
	invalid := e.Error.Status == "NOT_FOUND"
	for _, d := range e.Error.Details {
		if d.ErrorCode == "UNREGISTERED" || d.ErrorCode == "INVALID_ARGUMENT" {
			invalid = true
		}
	}
	return false, invalid
}

// SendToTokens — sendPushToTokens.
func SendToTokens(ctx context.Context, tokens []string, p Push) PushResult {
	seen := map[string]bool{}
	var unique []string
	for _, t := range tokens {
		if t != "" && !seen[t] {
			seen[t] = true
			unique = append(unique, t)
		}
	}
	if len(unique) == 0 {
		return PushResult{Skipped: true, Reason: "no_tokens"}
	}
	ts, project := fcm()
	if ts == nil {
		return PushResult{Failed: len(unique), Skipped: true, Reason: "firebase_not_configured"}
	}
	var res PushResult
	var invalid []any
	for _, t := range unique {
		ok, bad := sendOne(ctx, ts, project, t, p)
		if ok {
			res.Sent++
		} else {
			res.Failed++
			if bad {
				invalid = append(invalid, t)
			}
		}
	}
	if len(invalid) > 0 {
		q := "DELETE FROM user_push_tokens WHERE token IN (" + strings.TrimSuffix(strings.Repeat("?,", len(invalid)), ",") + ")"
		_, _, _ = db.Exec(ctx, db.Pool, q, invalid...)
	}
	return res
}

func userTokens(ctx context.Context, userID int64) []string {
	rows, err := db.Query(ctx, db.Pool, "SELECT token FROM user_push_tokens WHERE user_id = ?", userID)
	if err != nil {
		return nil
	}
	var out []string
	for _, r := range rows {
		if t := r.Str("token"); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// ToUser — sendPushToUser.
func ToUser(ctx context.Context, userID int64, p Push) PushResult {
	return SendToTokens(ctx, userTokens(ctx, userID), p)
}

// ToUserAsync — fire-and-forget.
func ToUserAsync(userID int64, p Push) {
	go ToUser(context.Background(), userID, p)
}

// OrderStatus — push о смене статуса заказа + запись в push_notification_log.
func OrderStatus(ctx context.Context, userID, orderID int64, title, body, status string) (PushResult, int) {
	if userID == 0 || orderID == 0 {
		return PushResult{Skipped: true, Reason: "no_user"}, 0
	}
	tokens := userTokens(ctx, userID)
	if title == "" {
		title = "Статус заказа"
	}
	if body == "" {
		body = "Статус вашего заказа обновлён"
	}
	res := SendToTokens(ctx, tokens, Push{Title: title, Body: body, Data: map[string]string{
		"type": "order_status", "order_id": fmt.Sprint(orderID), "status": status,
	}})
	_, _, _ = db.Exec(ctx, db.Pool, `INSERT INTO push_notification_log (campaign_id, title, body, sent_count, failed_count) VALUES (NULL, ?, ?, ?, ?)`,
		title, body, res.Sent, res.Failed)
	return res, len(tokens)
}

// SaveToken — savePushToken.
func SaveToken(ctx context.Context, userID int64, token, platform, deviceID string) (bool, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return false, nil
	}
	if platform == "" {
		platform = "android"
	}
	var dev any
	if deviceID != "" {
		dev = deviceID
	}
	_, _, err := db.Exec(ctx, db.Pool, `INSERT INTO user_push_tokens (user_id, token, platform, device_id)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE platform = VALUES(platform), device_id = VALUES(device_id), updated_at = NOW()`,
		userID, token, platform, dev)
	if db.IsNoTable(err) {
		return false, nil
	}
	return err == nil, err
}

// RemoveToken — removePushToken (без токена — все токены пользователя).
func RemoveToken(ctx context.Context, userID int64, token string) error {
	var err error
	if token != "" {
		_, _, err = db.Exec(ctx, db.Pool, "DELETE FROM user_push_tokens WHERE user_id = ? AND token = ?", userID, token)
	} else {
		_, _, err = db.Exec(ctx, db.Pool, "DELETE FROM user_push_tokens WHERE user_id = ?", userID)
	}
	if db.IsNoTable(err) {
		return nil
	}
	return err
}
