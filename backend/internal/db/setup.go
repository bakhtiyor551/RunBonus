package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// statements делит SQL-файл по «;». CREATE DATABASE и USE пропускаются: база задаётся в DB_NAME
// (миграция 025 содержит USE runbonus и иначе переключила бы соединение на другую базу).
func statements(sql string) []string {
	var out []string
	for _, s := range strings.Split(sql, ";") {
		s = strings.TrimSpace(s)
		up := strings.ToUpper(s)
		if s == "" || strings.HasPrefix(up, "CREATE DATABASE") || strings.HasPrefix(up, "USE ") {
			continue
		}
		out = append(out, s)
	}
	return out
}

// Setup применяет database/schema.sql и все database/migrations/*.sql по алфавиту.
// Ошибки «колонка/таблица уже есть» пропускаются, остальные в миграциях только логируются —
// миграции не идемпотентны и при повторном запуске частично падают.
// Всё выполняется на одном соединении: миграции используют сессионные переменные (@db) и PREPARE.
func Setup(ctx context.Context, dir string) error {
	conn, err := Pool.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	schema, err := os.ReadFile(filepath.Join(dir, "schema.sql"))
	if err != nil {
		return fmt.Errorf("не найден файл схемы: %w", err)
	}
	for _, st := range statements(string(schema)) {
		if _, err := conn.ExecContext(ctx, st); err != nil {
			return fmt.Errorf("schema.sql: %w", err)
		}
	}
	files, _ := filepath.Glob(filepath.Join(dir, "migrations", "*.sql"))
	sort.Strings(files)
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			return err
		}
		for _, st := range statements(string(sql)) {
			if _, err := conn.ExecContext(ctx, st); err != nil {
				if code := mysqlCode(err); code != 1060 && code != 1050 { // ER_DUP_FIELDNAME, ER_TABLE_EXISTS_ERROR
					log.Printf("Миграция %s: %v", filepath.Base(f), err)
				}
			}
		}
	}
	fmt.Println("Таблицы созданы успешно.")
	return nil
}

// Seed — начальные данные: админ, бонусный фонд, кошельки, настройки бонусов, демо-кроссовки.
func Seed(ctx context.Context) error {
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), 10)
	if err != nil {
		return err
	}
	if _, _, err := Exec(ctx, Pool, "INSERT IGNORE INTO admin_users (login, password_hash, role) VALUES ('admin', ?, 'super_admin')", string(hash)); err != nil {
		return err
	}

	fund, err := One(ctx, Pool, "SELECT id FROM accounts WHERE type = 'bonus_fund' LIMIT 1")
	if err != nil {
		return err
	}
	if fund == nil {
		id, _, err := Exec(ctx, Pool, `INSERT INTO accounts (name, type, initial_balance, current_balance, currency, comment, status)
			VALUES (?, 'bonus_fund', 10000, 10000, 'TJS', ?, 'active')`, "Бонусный фонд RunBonus", "Основной счёт для начисления бонусов клиентам")
		if err != nil {
			return err
		}
		if _, _, err := Exec(ctx, Pool, `INSERT INTO account_transactions (account_id, type, amount, balance_before, balance_after, comment)
			VALUES (?, 'topup', 10000, 0, 10000, ?)`, id, "Начальный баланс при открытии счёта"); err != nil {
			return err
		}
		fmt.Println("Бонусный фонд: 10 000 сомони")
	}

	noWallet, err := Query(ctx, Pool, "SELECT u.id FROM users u LEFT JOIN user_bonus_wallets w ON w.user_id = u.id WHERE w.id IS NULL")
	if err != nil {
		return err
	}
	for _, u := range noWallet {
		balance, _ := Scalar(ctx, Pool, "SELECT balance_after FROM bonuses WHERE user_id = ? ORDER BY id DESC LIMIT 1", u["id"])
		earned, _ := Scalar(ctx, Pool, "SELECT COALESCE(SUM(amount), 0) AS t FROM bonuses WHERE user_id = ? AND type IN ('earn', 'manual_add')", u["id"])
		spent, _ := Scalar(ctx, Pool, "SELECT COALESCE(SUM(amount), 0) AS t FROM bonuses WHERE user_id = ? AND type IN ('spend', 'manual_remove')", u["id"])
		if _, _, err := Exec(ctx, Pool, "INSERT INTO user_bonus_wallets (user_id, balance, total_earned, total_spent) VALUES (?, ?, ?, ?)",
			u["id"], ToFloat(balance), ToFloat(earned), ToFloat(spent)); err != nil {
			return err
		}
	}

	if s, err := One(ctx, Pool, "SELECT id FROM bonus_settings LIMIT 1"); err != nil {
		return err
	} else if s == nil {
		if _, _, err := Exec(ctx, Pool, `INSERT INTO bonus_settings (price_per_km, daily_limit, total_limit_per_shoe, min_distance_km, min_duration_minutes, max_speed_kmh, status)
			VALUES (3, 10, 200, 0.5, 5, 18, 'active')`); err != nil {
			return err
		}
		fmt.Println("Настройки бонусов: 3 сомони/км")
	}

	if s, err := One(ctx, Pool, "SELECT id FROM shoes LIMIT 1"); err != nil {
		return err
	} else if s == nil {
		if _, _, err := Exec(ctx, Pool, "INSERT INTO shoes (model_name, qr_code, unique_id, status) VALUES ('Demo Runner', 'SHOE-DEMO-001', 'SHOE-DEMO-001', 'new')"); err != nil {
			return err
		}
		fmt.Println("Тестовый код для активации: SHOE-DEMO-001")
	}
	fmt.Println("Seed OK. Админ: login=admin, password=admin123")
	return nil
}
