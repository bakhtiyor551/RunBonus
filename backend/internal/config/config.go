package config

import (
	"encoding/json"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type DB struct {
	Host, User, Password, Name string
	Port                       int
}

type SMS struct {
	Login, Token, Sender, Server, DevCode, AppHash string
	TestPhone, TestCode                            string
}

type Config struct {
	Port           int
	DB             DB
	JWTSecret      string
	JWTAdminSecret string
	Production     bool
	PublicAPIURL   string
	UploadsRoot    string
	TelegramToken  string
	TelegramChatID string
	SMS            SMS
	// Firebase service account (JSON). Пустой — push отключены.
	FirebaseServiceAccount []byte
	// Фоновые задачи: автозакрытие тренировок и утренний отчёт. В нескольких репликах — включать в одной.
	Jobs bool
}

var C Config

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func envInt(key string, def int) int {
	n, err := strconv.Atoi(env(key, ""))
	if err != nil {
		return def
	}
	return n
}

func Load() {
	_ = godotenv.Load(".env")

	C = Config{
		Port: envInt("PORT", 3001),
		DB: DB{
			Host:     env("DB_HOST", "localhost"),
			Port:     envInt("DB_PORT", 3306),
			User:     env("DB_USER", "runbonus"),
			Password: env("DB_PASSWORD", "runbonus"),
			Name:     env("DB_NAME", "runbonus"),
		},
		JWTSecret:      env("JWT_SECRET", "dev-secret"),
		JWTAdminSecret: env("JWT_ADMIN_SECRET", "dev-admin-secret"),
		Production:     env("NODE_ENV", "") == "production",
		PublicAPIURL:   strings.TrimRight(env("PUBLIC_API_URL", env("API_PUBLIC_URL", "")), "/"),
		UploadsRoot:    env("UPLOADS_ROOT", "uploads"),
		TelegramToken:  env("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID: env("TELEGRAM_CHAT_ID", ""),
		SMS: SMS{
			Login:   env("SMS_LOGIN", ""),
			Token:   env("SMS_TOKEN", ""),
			Sender:  env("SMS_SENDER", "RunBonus"),
			Server:  strings.TrimRight(env("SMS_SERVER", "https://api.osonsms.com"), "/"),
			DevCode: env("SMS_DEV_CODE", ""),
			AppHash: env("SMS_APP_HASH", ""),
		},
		Jobs: env("JOBS", "true") != "false",
	}

	if phone, code := env("SMS_TEST_PHONE", ""), env("SMS_TEST_CODE", ""); phone != "" && code != "" {
		if p := normalizePhone(phone); p != "" {
			digits := regexp.MustCompile(`\D`).ReplaceAllString(code, "")
			if len(digits) > 6 {
				digits = digits[:6]
			}
			C.SMS.TestPhone, C.SMS.TestCode = p, leftPad(digits, 6)
		}
	}

	if raw := env("FIREBASE_SERVICE_ACCOUNT_JSON", ""); raw != "" {
		if json.Valid([]byte(raw)) {
			C.FirebaseServiceAccount = []byte(raw)
		} else {
			log.Println("[config] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON")
		}
	} else if p := env("FIREBASE_SERVICE_ACCOUNT_PATH", ""); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			C.FirebaseServiceAccount = b
		} else {
			log.Println("[config] firebase service account:", err)
		}
	}

}

func leftPad(s string, n int) string {
	for len(s) < n {
		s = "0" + s
	}
	return s
}

// normalizePhone дублирует util/phone, чтобы config не зависел от других пакетов.
func normalizePhone(raw string) string {
	d := regexp.MustCompile(`\D`).ReplaceAllString(raw, "")
	d = strings.TrimPrefix(d, "992")
	if len(d) != 9 {
		return ""
	}
	return "992" + d
}

// Env — переменная окружения (после загрузки .env).
func Env(key string) string { return env(key, "") }
