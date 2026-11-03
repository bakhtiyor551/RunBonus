package users

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
)

func splitFullName(full string) (string, string) {
	parts := strings.Fields(full)
	if len(parts) == 0 {
		return "", ""
	}
	return parts[0], strings.Join(parts[1:], " ")
}

func BuildDisplayName(first, last string) string {
	var out []string
	for _, s := range []string{first, last} {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return strings.Join(out, " ")
}

// NormalizeAvatarURL — путь для клиента (через /api/uploads).
func NormalizeAvatarURL(v any) any {
	s, _ := v.(string)
	if s == "" {
		return nil
	}
	if strings.HasPrefix(s, "/uploads/") {
		return "/api" + s
	}
	return s
}

// MapProfileRow — mapUserProfileRow из Node.
func MapProfileRow(u db.Row) httpx.M {
	sf, sl := splitFullName(u.Str("name"))
	first := util.FirstNonEmpty(u.Str("first_name"), sf)
	last := util.FirstNonEmpty(u.Str("last_name"), sl)
	name := util.FirstNonEmpty(BuildDisplayName(first, last), u.Str("name"))
	return httpx.M{
		"id": u["id"], "clientId": u["id"], "client_id": u["id"],
		"name": name, "first_name": first, "last_name": last,
		"phone": u["phone"], "city": u["city"], "status": u["status"],
		"avatar_url": NormalizeAvatarURL(u["avatar_url"]),
	}
}

var dataURLImage = regexp.MustCompile(`(?is)^data:image/(jpeg|jpg|png|webp);base64,(.+)$`)

// SaveAvatar сохраняет data URL в uploads/avatars/user-ID.ext.
func SaveAvatar(userID int64, dataURL string) (string, error) {
	m := dataURLImage.FindStringSubmatch(dataURL)
	if m == nil {
		return "", httpx.E(400, "Неверный формат изображения")
	}
	ext := "jpg"
	switch strings.ToLower(m[1]) {
	case "png":
		ext = "png"
	case "webp":
		ext = "webp"
	}
	buf, err := base64.StdEncoding.DecodeString(strings.TrimSpace(m[2]))
	if err != nil {
		return "", httpx.E(400, "Неверный формат изображения")
	}
	if len(buf) > 2*1024*1024 {
		return "", httpx.E(400, "Фото не больше 2 МБ")
	}
	dir := filepath.Join(config.C.UploadsRoot, "avatars")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	prefix := fmt.Sprintf("user-%d.", userID)
	if entries, err := os.ReadDir(dir); err == nil {
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), prefix) {
				_ = os.Remove(filepath.Join(dir, e.Name()))
			}
		}
	}
	name := prefix + ext
	if err := os.WriteFile(filepath.Join(dir, name), buf, 0o644); err != nil {
		return "", err
	}
	return "/api/uploads/avatars/" + name, nil
}

func roundKm(n float64) float64 { return util.Round(n, 3) }

// ConfirmedDistanceKm — сумма одобренных тренировок.
func ConfirmedDistanceKm(ctx context.Context, q db.Querier, userID int64) (float64, error) {
	v, err := db.Scalar(ctx, q, `SELECT COALESCE(SUM(distance_km), 0) AS total FROM workouts WHERE user_id = ? AND status = 'approved'`, userID)
	return roundKm(db.ToFloat(v)), err
}

// Subscription — getSubscriptionInfo.
func Subscription(ctx context.Context, userID int64) httpx.M {
	row, err := db.One(ctx, db.Pool, `SELECT plan, status, started_at, expires_at, source
		FROM user_subscriptions
		WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY expires_at DESC LIMIT 1`, userID)
	if err != nil || row == nil {
		return httpx.M{"is_premium": false, "plan": nil, "expires_at": nil}
	}
	return httpx.M{"is_premium": true, "plan": row["plan"], "started_at": row["started_at"], "expires_at": row["expires_at"], "source": row["source"]}
}

// BuildProfile — buildUserProfile из routes/auth.js.
func BuildProfile(ctx context.Context, userID int64, requestDevice string) (httpx.M, error) {
	u, err := db.One(ctx, db.Pool, `SELECT id, name, first_name, last_name, avatar_url, phone, city, status, device_id FROM users WHERE id = ?`, userID)
	if err != nil || u == nil {
		return nil, err
	}
	base := MapProfileRow(u)

	shoe, err := db.One(ctx, db.Pool, `SELECT s.id, s.unique_id, s.model_name, s.status, s.max_bonus_limit
		FROM user_active_shoes uas JOIN shoes s ON s.id = uas.shoe_id WHERE uas.user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	total, err := ConfirmedDistanceKm(ctx, db.Pool, userID)
	if err != nil {
		total = 0
	}
	sub := Subscription(ctx, userID)

	var active any
	if shoe != nil {
		active = httpx.M{"id": shoe["id"], "unique_id": shoe["unique_id"], "model_name": shoe["model_name"]}
	}
	extra := httpx.M{
		"clientId": userID, "client_id": userID,
		"needsProfileSetup":        false,
		"balance":                  0,
		"blocked_balance":          0,
		"available_balance":        0,
		"total_confirmed_distance": total,
		"total_distance_km":        total,
		"is_premium":               sub["is_premium"],
		"premium_expires_at":       sub["expires_at"],
		"activeShoe":               active,
		"needsActivation":          shoe == nil || shoe.Str("status") != "activated",
		"qrActivationAllowed":      !auth.IsDeviceMismatch(u.Str("device_id"), requestDevice),
	}
	for k, v := range extra {
		base[k] = v
	}
	return base, nil
}
