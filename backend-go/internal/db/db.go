package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/go-sql-driver/mysql"

	"runbonus/api/internal/config"
)

// Pool — общий пул соединений (аналог mysql2 pool, connectionLimit 10 → здесь 20).
var Pool *sql.DB

func Open() error {
	c := config.C.DB
	cfg := mysql.NewConfig()
	cfg.User, cfg.Passwd, cfg.DBName = c.User, c.Password, c.Name
	cfg.Net, cfg.Addr = "tcp", fmt.Sprintf("%s:%d", c.Host, c.Port)
	cfg.ParseTime = true
	// mysql2 читает/пишет DATETIME в часовом поясе процесса — повторяем.
	cfg.Loc = time.Local
	cfg.InterpolateParams = true
	cfg.Params = map[string]string{"charset": "utf8mb4"}

	conn, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		return err
	}
	conn.SetMaxOpenConns(20)
	conn.SetMaxIdleConns(10)
	conn.SetConnMaxLifetime(30 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.PingContext(ctx); err != nil {
		return err
	}
	Pool = conn
	return nil
}

// Querier — *sql.DB или *sql.Tx.
type Querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func mysqlCode(err error) uint16 {
	var me *mysql.MySQLError
	if errors.As(err, &me) {
		return me.Number
	}
	return 0
}

// IsDup — ER_DUP_ENTRY.
func IsDup(err error) bool { return mysqlCode(err) == 1062 }

// IsNoTable — ER_NO_SUCH_TABLE.
func IsNoTable(err error) bool { return mysqlCode(err) == 1146 }

// IsBadField — ER_BAD_FIELD_ERROR (колонка ещё не создана миграцией).
func IsBadField(err error) bool { return mysqlCode(err) == 1054 }

// Exec выполняет запрос и возвращает (insertId, affectedRows).
func Exec(ctx context.Context, q Querier, query string, args ...any) (int64, int64, error) {
	res, err := q.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, 0, err
	}
	id, _ := res.LastInsertId()
	n, _ := res.RowsAffected()
	return id, n, nil
}

// Tx выполняет fn в транзакции; при ошибке или панике — откат.
func Tx(ctx context.Context, fn func(tx *sql.Tx) error) (err error) {
	tx, err := Pool.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}
