// Package notify — Telegram и Firebase push (этап 10).
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"runbonus/api/internal/config"
)

var client = &http.Client{Timeout: 30 * time.Second}

type tgResp struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
	Result      struct {
		MessageID int64 `json:"message_id"`
	} `json:"result"`
}

func tgConfigured() bool { return config.C.TelegramToken != "" && config.C.TelegramChatID != "" }

func tgDo(req *http.Request, label string) string {
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[%s] %v", label, err)
		return ""
	}
	defer resp.Body.Close()
	var data tgResp
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || !data.OK {
		log.Printf("[%s] %s", label, data.Description)
		return ""
	}
	return fmt.Sprint(data.Result.MessageID)
}

// Telegram отправляет HTML-сообщение в чат администраторов. Возвращает message_id или "".
func Telegram(text string) string {
	if !tgConfigured() {
		log.Println("[Telegram] TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы")
		return ""
	}
	body, _ := json.Marshal(map[string]any{"chat_id": config.C.TelegramChatID, "text": text, "parse_mode": "HTML"})
	req, _ := http.NewRequest(http.MethodPost, "https://api.telegram.org/bot"+config.C.TelegramToken+"/sendMessage", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return tgDo(req, "Telegram")
}

// TelegramAsync — fire-and-forget, как sendTelegramMessage(...).catch(() => {}).
func TelegramAsync(text string) { go Telegram(text) }

func EscapeHTML(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

var httpURL = regexp.MustCompile(`(?i)^https?://`)

// ResolveReceiptPhoto — локальный файл чека или публичный URL.
func ResolveReceiptPhoto(receiptURL string) string {
	if receiptURL == "" {
		return ""
	}
	if httpURL.MatchString(receiptURL) {
		return receiptURL
	}
	rel := strings.TrimPrefix(strings.TrimPrefix(receiptURL, "/api/uploads/"), "/uploads/")
	file := filepath.Join(config.C.UploadsRoot, rel)
	if _, err := os.Stat(file); err == nil {
		return file
	}
	if config.C.PublicAPIURL != "" && strings.HasPrefix(receiptURL, "/") {
		return config.C.PublicAPIURL + receiptURL
	}
	return ""
}

// TelegramPhoto — фото по URL или с диска с подписью.
func TelegramPhoto(source, caption string) string {
	if !tgConfigured() || source == "" {
		return ""
	}
	if r := []rune(caption); len(r) > 1024 {
		caption = string(r[:1024])
	}
	endpoint := "https://api.telegram.org/bot" + config.C.TelegramToken + "/sendPhoto"

	if httpURL.MatchString(source) {
		payload := map[string]any{"chat_id": config.C.TelegramChatID, "photo": source, "parse_mode": "HTML"}
		if caption != "" {
			payload["caption"] = caption
		}
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		return tgDo(req, "Telegram sendPhoto")
	}

	f, err := os.Open(source)
	if err != nil {
		return ""
	}
	defer f.Close()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("chat_id", config.C.TelegramChatID)
	part, _ := mw.CreateFormFile("photo", filepath.Base(source))
	_, _ = io.Copy(part, f)
	if caption != "" {
		_ = mw.WriteField("caption", caption)
		_ = mw.WriteField("parse_mode", "HTML")
	}
	_ = mw.Close()
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return tgDo(req, "Telegram sendPhoto")
}
