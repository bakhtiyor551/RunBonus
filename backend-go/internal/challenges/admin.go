package challenges

import (
	"context"
	"database/sql"
	"strings"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
)

func AdminLevels(ctx context.Context) ([]httpx.M, error) {
	levels, err := db.Query(ctx, db.Pool, "SELECT * FROM challenge_levels ORDER BY sort_order ASC, level_num ASC")
	if err != nil {
		return nil, err
	}
	links, err := db.Query(ctx, db.Pool, `SELECT clr.*, r.name AS reward_name, r.type AS reward_type
		FROM challenge_level_rewards clr JOIN rewards r ON r.id = clr.reward_id
		ORDER BY clr.level_id ASC, clr.sort_order ASC`)
	if err != nil {
		return nil, err
	}
	byLevel := map[int64][]httpx.M{}
	for _, l := range links {
		byLevel[l.Int("level_id")] = append(byLevel[l.Int("level_id")], httpx.M{
			"id": l["reward_id"], "name": l["reward_name"], "type": l["reward_type"], "sort_order": l["sort_order"], "active": l.Bool("active")})
	}
	out := make([]httpx.M, 0, len(levels))
	for _, l := range levels {
		m := httpx.M{}
		for k, v := range l {
			m[k] = v
		}
		rws := byLevel[l.Int("id")]
		if rws == nil {
			rws = []httpx.M{}
		}
		ids := make([]any, 0, len(rws))
		for _, rw := range rws {
			ids = append(ids, rw["id"])
		}
		m["target_km"], m["reward_ids"], m["rewards"] = l.Float("target_km"), ids, rws
		out = append(out, m)
	}
	return out, nil
}

func AdminSaveLevel(ctx context.Context, b httpx.Body) ([]httpx.M, error) {
	name := strings.TrimSpace(b.Str("name"))
	switch {
	case name == "":
		return nil, httpx.E(400, "Укажите название")
	case !b.Bool("level_num"):
		return nil, httpx.E(400, "Укажите номер уровня")
	case !(b.Float("target_km") > 0):
		return nil, httpx.E(400, "Укажите цель в км")
	case !(b.Float("deadline_days") > 0):
		return nil, httpx.E(400, "Укажите срок в днях")
	}
	sortOrder := any(0)
	if v := b.Raw("sort_order"); v != nil {
		sortOrder = httpx.ToString(v)
	}
	status := b.Str("status")
	if status == "" {
		status = "active"
	}
	args := []any{httpx.ToString(b.Raw("level_num")), name, httpx.ToString(b.Raw("target_km")), httpx.ToString(b.Raw("deadline_days")),
		util.NilIfEmpty(b.Str("description")), util.NilIfEmpty(b.Str("example_reward")), sortOrder, status}

	err := db.Tx(ctx, func(tx *sql.Tx) error {
		levelID := int64(b.Float("id"))
		if levelID != 0 {
			if _, _, err := db.Exec(ctx, tx, `UPDATE challenge_levels SET level_num = ?, name = ?, target_km = ?, deadline_days = ?, description = ?,
				example_reward = ?, sort_order = ?, status = ? WHERE id = ?`, append(args, levelID)...); err != nil {
				return err
			}
		} else {
			id, _, err := db.Exec(ctx, tx, `INSERT INTO challenge_levels (level_num, name, target_km, deadline_days, description, example_reward, sort_order, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, args...)
			if err != nil {
				return err
			}
			levelID = id
		}
		if ids, isList := b["reward_ids"].([]any); isList {
			if _, _, err := db.Exec(ctx, tx, "DELETE FROM challenge_level_rewards WHERE level_id = ?", levelID); err != nil {
				return err
			}
			for i, rid := range ids {
				if _, _, err := db.Exec(ctx, tx, "INSERT INTO challenge_level_rewards (level_id, reward_id, sort_order, active) VALUES (?, ?, ?, 1)",
					levelID, httpx.ToString(rid), (i+1)*10); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return AdminLevels(ctx)
}

func AdminClaims(ctx context.Context, status string) ([]db.Row, error) {
	where, args := "1=1", []any{}
	if status != "" {
		where, args = "1=1 AND ucr.status = ?", []any{status}
	}
	return db.Query(ctx, db.Pool, `SELECT ucr.*, cl.level_num, cl.name AS level_name, r.name AS reward_name, r.type AS reward_type,
			u.phone AS user_phone, u.name AS user_name, u.first_name
		FROM user_challenge_rewards ucr
		JOIN challenge_levels cl ON cl.id = ucr.level_id
		JOIN rewards r ON r.id = ucr.reward_id
		JOIN users u ON u.id = ucr.user_id
		WHERE `+where+` ORDER BY ucr.claimed_at DESC LIMIT 500`, args...)
}

func AdminUpdateClaim(ctx context.Context, id, status string, comment string) ([]db.Row, error) {
	switch status {
	case "CLAIMED", "PROCESSING", "READY", "DELIVERED", "CANCELLED":
	default:
		return nil, httpx.E(400, "Неверный статус")
	}
	if _, _, err := db.Exec(ctx, db.Pool, `UPDATE user_challenge_rewards SET status = ?,
			admin_comment = COALESCE(?, admin_comment),
			processed_at = CASE WHEN ? IN ('PROCESSING','READY','DELIVERED') THEN COALESCE(processed_at, NOW()) ELSE processed_at END,
			delivered_at = CASE WHEN ? = 'DELIVERED' THEN NOW() ELSE delivered_at END
		WHERE id = ?`, status, util.NilIfEmpty(comment), status, status, id); err != nil {
		return nil, err
	}
	return AdminClaims(ctx, "")
}
