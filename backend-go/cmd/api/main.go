package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"runbonus/api/internal/ads"
	"runbonus/api/internal/challenges"
	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/notify"
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

	handler := server.New([]server.Module{
		{Name: "auth", Register: users.Register},
		{Name: "shoes", Register: shoes.Register},
		{Name: "workouts", Register: workouts.Register},
		{Name: "progress", Register: rewards.RegisterProgress},
		{Name: "rewards", Register: rewards.RegisterRewards},
		{Name: "challenges", Register: challenges.Register},
		{Name: "shop", Register: shop.Register},
		{Name: "ads", Register: ads.Register},
		{Name: "push", Register: notify.Register},
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
		log.Printf("API (Go): http://localhost:%d, Node upstream: %q", config.C.Port, config.C.NodeUpstream)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

// runJobs — автозакрытие тренировок старше 24 ч (через 15 с после старта, затем каждые 5 минут).
// Утренний Telegram-отчёт пока формирует Node (он строится по админским отчётам).
func runJobs(ctx context.Context) {
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
