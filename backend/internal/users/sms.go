package users

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
)

const (
	codeTTL        = 10 * time.Minute
	resendCooldown = time.Minute
	maxAttempts    = 5
)

func smsConfigured() bool { return config.C.SMS.Login != "" && config.C.SMS.Token != "" }

func devCode() string {
	if config.C.Production || config.C.SMS.DevCode == "" {
		return ""
	}
	d := util.Digits(config.C.SMS.DevCode)
	if len(d) > 6 {
		d = d[:6]
	}
	return fmt.Sprintf("%06s", d)
}

func SmsEnabled() bool { return smsConfigured() || devCode() != "" }

// smsEnabledJSON повторяет JS-выражение `configured || (NODE_ENV !== 'production' && devCode)`:
// без шлюза в dev отдаётся сама строка dev-кода (или ""), в production — false.
func smsEnabledJSON() any {
	switch {
	case smsConfigured():
		return true
	case config.C.Production:
		return false
	default:
		return config.C.SMS.DevCode
	}
}

var tableOnce sync.Once

func ensureTable(ctx context.Context) {
	tableOnce.Do(func() {
		_, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM sms_verification_codes LIMIT 1")
		if err != nil && db.IsNoTable(err) {
			_, _, _ = db.Exec(ctx, db.Pool, `CREATE TABLE sms_verification_codes (
				id BIGINT AUTO_INCREMENT PRIMARY KEY,
				phone VARCHAR(20) NOT NULL,
				code_hash VARCHAR(64) NOT NULL,
				purpose ENUM('register', 'login') NOT NULL,
				expires_at DATETIME NOT NULL,
				attempts INT NOT NULL DEFAULT 0,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_sms_phone_purpose (phone, purpose),
				KEY idx_sms_expires (expires_at)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		}
	})
}

func fixedTestCode(phone string) string {
	if config.C.SMS.TestPhone != "" && phone == config.C.SMS.TestPhone {
		return config.C.SMS.TestCode
	}
	return ""
}

func generateCode(phone string) string {
	if c := fixedTestCode(phone); c != "" {
		return c
	}
	if c := devCode(); c != "" {
		return c
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(899999))
	return fmt.Sprint(100000 + n.Int64())
}

func hashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

func SendVerificationCode(ctx context.Context, phoneRaw, purpose string) (httpx.M, error) {
	ensureTable(ctx)
	if purpose != "register" && purpose != "login" {
		return nil, httpx.E(400, "Неверный тип запроса")
	}
	phone := util.NormalizePhone(phoneRaw)
	if phone == "" {
		return nil, httpx.E(400, "Неверный формат номера")
	}
	if !SmsEnabled() {
		return nil, httpx.E(503, "SMS-авторизация не настроена")
	}

	user, err := db.One(ctx, db.Pool, "SELECT id, status FROM users WHERE phone = ?", phone)
	if err != nil {
		return nil, err
	}
	if purpose == "register" && user != nil {
		return nil, httpx.E(409, "Номер уже зарегистрирован. Войдите по SMS.")
	}
	if purpose == "login" && user != nil && user.Str("status") == "blocked" {
		return nil, httpx.E(403, "Аккаунт заблокирован")
	}

	if _, _, err := db.Exec(ctx, db.Pool, "DELETE FROM sms_verification_codes WHERE expires_at < NOW()"); err != nil {
		return nil, err
	}
	recent, err := db.One(ctx, db.Pool, `SELECT created_at FROM sms_verification_codes
		WHERE phone = ? AND purpose = ? ORDER BY id DESC LIMIT 1`, phone, purpose)
	if err != nil {
		return nil, err
	}
	if recent != nil && time.Since(recent.Time("created_at")) < resendCooldown {
		return nil, httpx.E(429, "Подождите минуту перед повторной отправкой")
	}
	if _, _, err := db.Exec(ctx, db.Pool, "DELETE FROM sms_verification_codes WHERE phone = ? AND purpose = ?", phone, purpose); err != nil {
		return nil, err
	}

	code := generateCode(phone)
	if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO sms_verification_codes (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?)`,
		phone, hashCode(code), purpose, time.Now().Add(codeTTL)); err != nil {
		return nil, err
	}

	isTest := fixedTestCode(phone) != ""
	dev := devCode() != ""
	if !dev && !isTest {
		if err := sendSms(ctx, phone, otpMessage(code)); err != nil {
			return nil, err
		}
	}
	msg := "Код отправлен на ваш номер"
	if isTest {
		msg = "Тестовый код (SMS не отправляется)"
	}
	out := httpx.M{"message": msg, "phone": phone, "expires_in": int(codeTTL.Seconds())}
	if dev || isTest {
		out["dev_code"] = code
	}
	return out, nil
}

func VerifyCode(ctx context.Context, phoneRaw, purpose, code string) (string, error) {
	ensureTable(ctx)
	phone := util.NormalizePhone(phoneRaw)
	if phone == "" {
		return "", httpx.E(400, "Неверный формат номера")
	}
	c := util.Digits(code)
	if len(c) != 6 {
		return "", httpx.E(400, "Введите 6-значный код")
	}
	row, err := db.One(ctx, db.Pool, `SELECT * FROM sms_verification_codes
		WHERE phone = ? AND purpose = ? ORDER BY id DESC LIMIT 1`, phone, purpose)
	if err != nil {
		return "", err
	}
	if row == nil {
		return "", httpx.E(400, "Код не найден. Запросите новый.")
	}
	if row.Time("expires_at").Before(time.Now()) {
		return "", httpx.E(400, "Код истёк. Запросите новый.")
	}
	if row.Int("attempts") >= maxAttempts {
		return "", httpx.E(400, "Слишком много попыток. Запросите новый код.")
	}
	if hashCode(c) != row.Str("code_hash") {
		_, _, _ = db.Exec(ctx, db.Pool, "UPDATE sms_verification_codes SET attempts = attempts + 1 WHERE id = ?", row["id"])
		return "", httpx.E(400, "Неверный код")
	}
	_, _, _ = db.Exec(ctx, db.Pool, "DELETE FROM sms_verification_codes WHERE id = ?", row["id"])
	return phone, nil
}

func otpMessage(code string) string {
	c := util.Digits(code)
	if len(c) > 6 {
		c = c[:6]
	}
	if h := config.C.SMS.AppHash; h != "" {
		return fmt.Sprintf("<#> RunBonus: код %s. Никому не сообщайте.\n%s", c, h)
	}
	return fmt.Sprintf("RunBonus: код %s. Никому не сообщайте.", c)
}

// sendSms — OsonSMS sendsms_v1.php.
func sendSms(ctx context.Context, phone992, message string) error {
	if !smsConfigured() {
		return httpx.E(503, "SMS не настроен на сервере")
	}
	base := strings.TrimSuffix(config.C.SMS.Server, "/sendsms_v1.php")
	txn := make([]byte, 12)
	_, _ = rand.Read(txn)
	q := url.Values{}
	q.Set("from", config.C.SMS.Sender)
	q.Set("phone_number", phone992)
	q.Set("msg", message)
	q.Set("txn_id", hex.EncodeToString(txn))
	q.Set("login", config.C.SMS.Login)

	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, base+"/sendsms_v1.php?"+q.Encode(), nil)
	req.Header.Set("Authorization", "Bearer "+config.C.SMS.Token)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return httpx.E(502, "Не удалось отправить SMS")
	}
	defer resp.Body.Close()
	var data map[string]any
	if json.NewDecoder(resp.Body).Decode(&data) != nil {
		return httpx.E(502, "Некорректный ответ SMS-шлюза")
	}
	if resp.StatusCode >= 300 || data["error"] != nil {
		msg := "Не удалось отправить SMS"
		if e, ok := data["error"].(map[string]any); ok {
			if m, ok := e["msg"].(string); ok && m != "" {
				msg = m
			}
		} else if m, ok := data["message"].(string); ok && m != "" {
			msg = m
		}
		return httpx.E(502, msg)
	}
	return nil
}
