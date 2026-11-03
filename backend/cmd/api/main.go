// RunBonus API.
//
//	runbonus-api                  — HTTP API (порт PORT, по умолчанию 3001)
//	runbonus-api setup-db [dir]   — схема и миграции из каталога database (по умолчанию ../database)
//	runbonus-api seed             — админ admin/admin123, бонусный фонд, настройки, демо-кроссовки
//	runbonus-api daily-report     — отправить утренний отчёт в Telegram сейчас
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"runbonus/api/internal/admin"
	"runbonus/api/internal/ads"
	"runbonus/api/internal/challenges"
	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/notify"
	"runbonus/api/internal/reports"
	"runbonus/api/internal/rewards"
	"runbonus/api/internal/server"
	"runbonus/api/internal/shoes"
	"runbonus/api/internal/shop"
	"runbonus/api/internal/users"
	"runbonus/api/internal/workouts"
)

func main() {
	config.Load()
	if err := db.Open(); err != nil {
		log.Fatalf("db: %v", err)
	}

	if len(os.Args) > 1 {
		ctx := context.Background()
		var err error
		switch os.Args[1] {
		case "setup-db":
			dir := "../database"
			if len(os.Args) > 2 {
				dir = os.Args[2]
			}
			err = db.Setup(ctx, dir)
		case "seed":
			err = db.Seed(ctx)
		case "daily-report":
			var text string
			if text, err = reports.DailyTelegram(ctx); err == nil {
				if id := notify.Telegram(text); id == "" {
					err = errors.New("не удалось отправить отчёт в Telegram")
				} else {
					fmt.Println("Daily report sent, message_id:", id)
				}
			}
		default:
			err = fmt.Errorf("неизвестная команда %q (setup-db, seed, daily-report)", os.Args[1])
		}
		if err != nil {
			log.Fatal(err)
		}
		return
	}

	handler := server.New([]server.Module{
		users.Register, shoes.Register, workouts.Register,
		rewards.RegisterProgress, rewards.RegisterRewards, challenges.Register,
		shop.Register, ads.Register, notify.Register, admin.Register,
	})

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if config.C.Jobs {
		go runJobs(ctx)
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", config.C.Port),
		Handler:           handler,
		ReadHeaderTimeout: 15 * time.Second,
	}
	go func() {
		log.Printf("API: http://localhost:%d (доступен в сети по IP:%d)", config.C.Port, config.C.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

// runJobs — автозакрытие тренировок старше 24 ч (через 15 с после старта, затем каждые 5 минут)
// и утренний Telegram-отчёт в 08:00.
func runJobs(ctx context.Context) {
	go dailyReport(ctx)
	select {
	case <-ctx.Done():
		return
	case <-time.After(15 * time.Second):
	}
	workouts.AutoCloseStale(ctx)
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			workouts.AutoCloseStale(ctx)
		}
	}
}

func dailyReport(ctx context.Context) {
	last := ""
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			key := now.Format("2006-01-02")
			if now.Hour() != 8 || now.Minute() > 1 || last == key {
				continue
			}
			last = key
			text, err := reports.DailyTelegram(ctx)
			if err != nil {
				log.Println("[daily-report]", err)
				continue
			}
			notify.Telegram(text)
		}
	}
}
