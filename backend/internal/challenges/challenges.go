// Package challenges — задания с дедлайном и наградами за уровни (этап 8).
package challenges

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
	"runbonus/api/internal/rewards"
	"runbonus/api/internal/util"
)

func roundKm(n float64) float64 { return util.Round(n, 3) }

func herr(msg string, status int, code string) error { return httpx.EC(status, msg, code) }

func plural(n int64, one, few, many string) string {
	switch {
	case n == 1:
		return one
	case n < 5:
		return few
	default:
		return many
	}
}

func formatRemaining(ms int64) httpx.M {
	if ms <= 0 {
		return httpx.M{"totalMs": 0, "days": 0, "hours": 0, "minutes": 0, "label": "0", "expired": true}
	}
	totalMin := ms / 60000
	days := totalMin / (60 * 24)
	hours := (totalMin % (60 * 24)) / 60
	minutes := totalMin % 60
	var parts []string
	if days > 0 {
		parts = append(parts, fmt.Sprintf("%d %s", days, plural(days, "день", "дня", "дней")))
	}
	if hours > 0 || days > 0 {
		parts = append(parts, fmt.Sprintf("%d %s", hours, plural(hours, "час", "часа", "часов")))
	}
	if days == 0 {
		parts = append(parts, fmt.Sprintf("%d мин", minutes))
	}
	return httpx.M{"totalMs": ms, "days": days, "hours": hours, "minutes": minutes, "label": strings.Join(parts, " "), "expired": false}
}

func listActiveLevels(ctx context.Context, q db.Querier) ([]db.Row, error) {
	return db.Query(ctx, q, `SELECT id, level_num, name, target_km, deadline_days, description, example_reward, sort_order, status
		FROM challenge_levels WHERE status = 'active' ORDER BY sort_order ASC, level_num ASC`)
}

func levelRewards(ctx context.Context, levelID any) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, `SELECT r.id, r.name, r.type, r.description, r.image, r.requires_size, r.size_options, r.color_options,
			r.discount_percent, r.stock, r.reserved, clr.sort_order
		FROM challenge_level_rewards clr JOIN rewards r ON r.id = clr.reward_id
		WHERE clr.level_id = ? AND clr.active = 1 AND r.active = 1
		ORDER BY clr.sort_order ASC, r.id ASC`, levelID)
	if err != nil {
		return nil, err
	}
	out := []httpx.M{}
	for _, r := range rows {
		var discount any
		if r["discount_percent"] != nil {
			discount = r.Float("discount_percent")
		}
		out = append(out, httpx.M{"id": r["id"], "name": r["name"], "type": r["type"], "description": r["description"],
			"image": r["image"], "requiresSize": r.Bool("requires_size"), "discountPercent": discount, "example": nil})
	}
	return out, nil
}

// DistanceKm — только одобренные тренировки, завершённые после start_at.
func DistanceKm(ctx context.Context, q db.Querier, userID int64, startAt time.Time) (float64, error) {
	v, err := db.Scalar(ctx, q, `SELECT COALESCE(SUM(COALESCE(approved_distance_km, 0)), 0) AS total
		FROM workouts WHERE user_id = ? AND status = 'approved' AND finished_at IS NOT NULL AND finished_at >= ?`, userID, startAt)
	return roundKm(db.ToFloat(v)), err
}

const selectChallenge = `SELECT uc.*, cl.level_num, cl.name AS level_name, cl.description, cl.example_reward, cl.deadline_days,
		r.name AS reward_name
	FROM user_challenges uc
	JOIN challenge_levels cl ON cl.id = uc.level_id
	LEFT JOIN rewards r ON r.id = uc.reward_id`

func loadByID(ctx context.Context, q db.Querier, id any) (db.Row, error) {
	return db.One(ctx, q, selectChallenge+" WHERE uc.id = ?", id)
}

func findOpen(ctx context.Context, q db.Querier, userID int64) (db.Row, error) {
	return db.One(ctx, q, selectChallenge+`
		WHERE uc.user_id = ?
		  AND (uc.status IN ('ACTIVE', 'EXPIRED') OR (uc.status = 'COMPLETED' AND uc.reward_claimed_at IS NULL))
		ORDER BY CASE uc.status WHEN 'ACTIVE' THEN 0 WHEN 'COMPLETED' THEN 1 WHEN 'EXPIRED' THEN 2 ELSE 3 END, uc.id DESC
		LIMIT 1`, userID)
}

// expireIfNeeded — по истечении срока: COMPLETED, если цель набрана, иначе EXPIRED.
func expireIfNeeded(ctx context.Context, q db.Querier, c db.Row) (db.Row, error) {
	if c == nil || c.Str("status") != "ACTIVE" || time.Now().Before(c.Time("expires_at")) {
		return c, nil
	}
	km, err := DistanceKm(ctx, q, c.Int("user_id"), c.Time("start_at"))
	if err != nil {
		return nil, err
	}
	if km >= c.Float("target_km") {
		_, _, err = db.Exec(ctx, q, `UPDATE user_challenges SET status = 'COMPLETED', current_km = ?, completed_at = COALESCE(completed_at, NOW())
			WHERE id = ? AND status = 'ACTIVE'`, km, c["id"])
		c["status"] = "COMPLETED"
	} else {
		_, _, err = db.Exec(ctx, q, `UPDATE user_challenges SET status = 'EXPIRED', current_km = ?, expired_at = NOW()
			WHERE id = ? AND status = 'ACTIVE'`, km, c["id"])
		c["status"] = "EXPIRED"
	}
	c["current_km"] = km
	return c, err
}

func refreshActive(ctx context.Context, q db.Querier, c db.Row) (db.Row, error) {
	if c == nil || c.Str("status") != "ACTIVE" {
		return c, nil
	}
	km, err := DistanceKm(ctx, q, c.Int("user_id"), c.Time("start_at"))
	if err != nil {
		return nil, err
	}
	if km >= c.Float("target_km") {
		_, _, err = db.Exec(ctx, q, `UPDATE user_challenges SET status = 'COMPLETED', current_km = ?, completed_at = NOW()
			WHERE id = ? AND status = 'ACTIVE'`, km, c["id"])
		c["status"] = "COMPLETED"
	} else if c.Float("current_km") != km {
		_, _, err = db.Exec(ctx, q, "UPDATE user_challenges SET current_km = ? WHERE id = ?", km, c["id"])
	}
	c["current_km"] = km
	return c, err
}

func isoOrNil(r db.Row, k string) any {
	if r[k] == nil {
		return nil
	}
	return db.ISO(r.Time(k))
}

func mapRow(r db.Row, now time.Time, rws []httpx.M) httpx.M {
	if r == nil {
		return nil
	}
	if rws == nil {
		rws = []httpx.M{}
	}
	target := r.Float("target_km")
	current := roundKm(r.Float("current_km"))
	var remainingMs int64
	if r.Str("status") == "ACTIVE" && r["expires_at"] != nil {
		remainingMs = max(0, r.Time("expires_at").UnixMilli()-now.UnixMilli())
	}
	percent := 0.0
	if target > 0 {
		percent = math.Min(100, util.JSRound(current/target*100))
	}
	name := r["level_name"]
	if r.Str("level_name") == "" {
		name = r["name"]
	}
	return httpx.M{
		"id": r["id"], "challengeId": r["id"], "userId": r["user_id"], "levelId": r["level_id"], "levelNum": r["level_num"],
		"name": name, "description": r["description"], "exampleReward": r["example_reward"],
		"status": r["status"], "targetKm": target, "currentKm": current,
		"startAt": isoOrNil(r, "start_at"), "expiresAt": isoOrNil(r, "expires_at"),
		"completedAt": isoOrNil(r, "completed_at"), "expiredAt": isoOrNil(r, "expired_at"),
		"rewardId": r["reward_id"], "rewardClaimedAt": isoOrNil(r, "reward_claimed_at"), "rewardClaimed": r["reward_claimed_at"] != nil,
		"attempt": r["attempt"], "deadlineDays": r["deadline_days"],
		"progressPercent": percent, "remainingKm": math.Max(0, roundKm(target-current)),
		"remaining": formatRemaining(remainingMs), "serverTime": db.ISO(now),
		"rewards": rws, "rewardName": util.NilIfEmpty(r.Str("reward_name")),
	}
}

func highestClaimedLevel(ctx context.Context, q db.Querier, userID int64) (int64, error) {
	v, err := db.Scalar(ctx, q, `SELECT MAX(cl.level_num) AS max_level FROM user_challenges uc
		JOIN challenge_levels cl ON cl.id = uc.level_id
		WHERE uc.user_id = ? AND uc.status = 'COMPLETED' AND uc.reward_claimed_at IS NOT NULL`, userID)
	return int64(db.ToFloat(v)), err
}

func nextStartable(ctx context.Context, q db.Querier, userID int64) (db.Row, error) {
	levels, err := listActiveLevels(ctx, q)
	if err != nil || len(levels) == 0 {
		return nil, err
	}
	open, err := findOpen(ctx, q, userID)
	if err != nil || open != nil {
		return nil, err
	}
	maxDone, err := highestClaimedLevel(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	for _, l := range levels {
		if l.Int("level_num") == maxDone+1 {
			return l, nil
		}
	}
	if maxDone == 0 {
		return levels[0], nil
	}
	return nil, nil
}

// State — getChallengeState.
func State(ctx context.Context, userID int64) (httpx.M, error) {
	now := time.Now()
	row, err := findOpen(ctx, db.Pool, userID)
	if err != nil {
		return nil, err
	}
	if row != nil {
		if row, err = expireIfNeeded(ctx, db.Pool, row); err != nil {
			return nil, err
		}
		if row.Str("status") == "ACTIVE" {
			if row, err = refreshActive(ctx, db.Pool, row); err != nil {
				return nil, err
			}
		}
		if row, err = loadByID(ctx, db.Pool, row["id"]); err != nil {
			return nil, err
		}
	}
	levels, err := listActiveLevels(ctx, db.Pool)
	if err != nil {
		return nil, err
	}
	maxDone, err := highestClaimedLevel(ctx, db.Pool, userID)
	if err != nil {
		return nil, err
	}
	var challenge httpx.M
	if row != nil {
		rws, err := levelRewards(ctx, row["level_id"])
		if err != nil {
			return nil, err
		}
		challenge = mapRow(row, now, rws)
	}

	var nextLevel httpx.M
	if challenge == nil {
		st, err := nextStartable(ctx, db.Pool, userID)
		if err != nil {
			return nil, err
		}
		if st != nil {
			rws, err := levelRewards(ctx, st["id"])
			if err != nil {
				return nil, err
			}
			nextLevel = httpx.M{"levelId": st["id"], "levelNum": st["level_num"], "name": st["name"], "targetKm": st.Float("target_km"),
				"deadlineDays": st["deadline_days"], "description": st["description"], "exampleReward": st["example_reward"],
				"rewards": rws, "status": "LOCKED", "canStart": true}
		}
	}

	cards := make([]httpx.M, 0, len(levels))
	for _, l := range levels {
		num := l.Int("level_num")
		status := any("LOCKED")
		if challenge != nil && db.ToFloat(challenge["levelNum"]) == float64(num) {
			status = challenge["status"]
		} else if num <= maxDone {
			status = "COMPLETED"
		}
		canStart := (nextLevel != nil && db.ToFloat(nextLevel["levelNum"]) == float64(num)) ||
			(challenge != nil && challenge["status"] == "EXPIRED" && db.ToFloat(challenge["levelNum"]) == float64(num))
		cards = append(cards, httpx.M{"levelId": l["id"], "levelNum": num, "name": l["name"], "targetKm": l.Float("target_km"),
			"deadlineDays": l["deadline_days"], "description": l["description"], "exampleReward": l["example_reward"],
			"status": status, "canStart": canStart})
	}

	var ch, nl any
	if challenge != nil {
		ch = challenge
	}
	if nextLevel != nil {
		nl = nextLevel
	}
	return httpx.M{
		"serverTime": db.ISO(now), "challenge": ch, "nextLevel": nl, "levels": cards, "completedLevels": maxDone,
		"allDone": challenge == nil && nextLevel == nil && maxDone > 0 && maxDone >= int64(len(levels)),
	}, nil
}

func nextAttempt(ctx context.Context, q db.Querier, userID int64, levelID any) (int64, error) {
	v, err := db.Scalar(ctx, q, `SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt FROM user_challenges WHERE user_id = ? AND level_id = ?`, userID, levelID)
	n := int64(db.ToFloat(v))
	if n == 0 {
		n = 1
	}
	return n, err
}

func insertChallenge(ctx context.Context, q db.Querier, userID int64, level db.Row, startAt time.Time, deadlineDays float64) (int64, error) {
	attempt, err := nextAttempt(ctx, q, userID, level["id"])
	if err != nil {
		return 0, err
	}
	expires := startAt.Add(time.Duration(deadlineDays * float64(24*time.Hour)))
	id, _, err := db.Exec(ctx, q, `INSERT INTO user_challenges (user_id, level_id, status, target_km, current_km, start_at, expires_at, attempt)
		VALUES (?, ?, 'ACTIVE', ?, 0, ?, ?, ?)`, userID, level["id"], level["target_km"], startAt, expires, attempt)
	return id, err
}

// Start — startChallenge.
func Start(ctx context.Context, userID int64, levelID float64) (httpx.M, error) {
	var newID int64
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		user, err := db.One(ctx, tx, "SELECT id, status FROM users WHERE id = ? FOR UPDATE", userID)
		if err != nil {
			return err
		}
		if user == nil {
			return herr("Пользователь не найден", 404, "NOT_FOUND")
		}
		if user.Str("status") == "blocked" {
			return herr("Аккаунт заблокирован", 403, "BLOCKED")
		}
		open, err := findOpen(ctx, tx, userID)
		if err != nil {
			return err
		}
		if open != nil {
			if open, err = expireIfNeeded(ctx, tx, open); err != nil {
				return err
			}
			if open.Str("status") == "ACTIVE" {
				return herr("У вас уже есть активное задание", 409, "ALREADY_ACTIVE")
			}
			if open.Str("status") == "COMPLETED" && open["reward_claimed_at"] == nil {
				return herr("Сначала заберите награду за выполненное задание", 409, "CLAIM_FIRST")
			}
		}
		expired := open != nil && open.Str("status") == "EXPIRED"
		if expired && (levelID == 0 || levelID == open.Float("level_id")) {
			level, err := db.One(ctx, tx, "SELECT * FROM challenge_levels WHERE id = ? AND status = 'active'", open["level_id"])
			if err != nil {
				return err
			}
			if level == nil {
				return herr("Уровень недоступен", 404, "LEVEL_NOT_FOUND")
			}
			newID, err = insertChallenge(ctx, tx, userID, level, time.Now(), level.Float("deadline_days"))
			return err
		}
		if expired && levelID != 0 && levelID != open.Float("level_id") {
			return herr("Сначала перезапустите текущее задание", 409, "RESTART_CURRENT")
		}
		st, err := nextStartable(ctx, tx, userID)
		if err != nil {
			return err
		}
		if st == nil {
			return herr("Нет доступного задания для старта", 409, "NOTHING_TO_START")
		}
		if levelID != 0 && levelID != st.Float("id") {
			return herr("Это задание ещё недоступно", 403, "LOCKED")
		}
		newID, err = insertChallenge(ctx, tx, userID, st, time.Now(), st.Float("deadline_days"))
		return err
	})
	if err != nil {
		return nil, err
	}
	state, err := State(ctx, userID)
	if err != nil {
		return nil, err
	}
	state["challengeId"] = newID
	return state, nil
}

// EnsureForFinishedWorkout — после финиша первой тренировки создаёт ACTIVE challenge со start_at = начало тренировки.
func EnsureForFinishedWorkout(ctx context.Context, userID int64, workoutStartedAt time.Time) {
	open, err := findOpen(ctx, db.Pool, userID)
	if err == nil && open != nil {
		if open, err = expireIfNeeded(ctx, db.Pool, open); err == nil {
			if open.Str("status") == "ACTIVE" || (open.Str("status") == "COMPLETED" && open["reward_claimed_at"] == nil) {
				return
			}
		}
	}
	if err != nil {
		log.Println("[challenge/finish-boot]", err)
		return
	}
	var st db.Row
	if open != nil && open.Str("status") == "EXPIRED" {
		st, err = db.One(ctx, db.Pool, "SELECT * FROM challenge_levels WHERE id = ? AND status = 'active'", open["level_id"])
	} else {
		st, err = nextStartable(ctx, db.Pool, userID)
	}
	if err != nil || st == nil {
		if err != nil {
			log.Println("[challenge/finish-boot]", err)
		}
		return
	}
	days := st.Float("deadline_days")
	if days == 0 {
		days = 7
	}
	start := workoutStartedAt
	if start.IsZero() {
		start = time.Now()
	}
	if _, err := insertChallenge(ctx, db.Pool, userID, st, start, days); err != nil {
		log.Println("[challenge/finish-boot]", err)
	}
}

// ApplyWorkout — пересчёт активного задания после одобренной тренировки (nil — нет активного).
func ApplyWorkout(ctx context.Context, userID int64) (httpx.M, error) {
	row, err := findOpen(ctx, db.Pool, userID)
	if err != nil || row == nil || row.Str("status") != "ACTIVE" {
		return nil, err
	}
	if row, err = expireIfNeeded(ctx, db.Pool, row); err != nil {
		return nil, err
	}
	if row.Str("status") != "ACTIVE" {
		fresh, err := loadByID(ctx, db.Pool, row["id"])
		if err != nil {
			return nil, err
		}
		return mapRow(fresh, time.Now(), nil), nil
	}
	if row, err = refreshActive(ctx, db.Pool, row); err != nil {
		return nil, err
	}
	fresh, err := loadByID(ctx, db.Pool, row["id"])
	if err != nil || fresh == nil {
		return nil, err
	}
	rws, err := levelRewards(ctx, fresh["level_id"])
	if err != nil {
		return nil, err
	}
	return mapRow(fresh, time.Now(), rws), nil
}

// RewardOptions — getChallengeRewardOptions.
func RewardOptions(ctx context.Context, userID int64, challengeID string) (httpx.M, error) {
	state, err := State(ctx, userID)
	if err != nil {
		return nil, err
	}
	ch, _ := state["challenge"].(httpx.M)
	if ch == nil || db.ToFloat(ch["id"]) != db.ToFloat(challengeID) {
		return nil, herr("Задание не найдено", 404, "NOT_FOUND")
	}
	if ch["status"] != "COMPLETED" || ch["rewardClaimed"] == true {
		return nil, herr("Награда недоступна для получения", 409, "NOT_CLAIMABLE")
	}
	rows, err := db.Query(ctx, db.Pool, `SELECT r.*, clr.sort_order AS link_sort
		FROM challenge_level_rewards clr JOIN rewards r ON r.id = clr.reward_id
		WHERE clr.level_id = ? AND clr.active = 1 AND r.active = 1
		ORDER BY clr.sort_order ASC, r.id ASC`, ch["levelId"])
	if err != nil {
		return nil, err
	}
	opts, err := rewards.Options(ctx, rows, true)
	if err != nil {
		return nil, err
	}
	return httpx.M{"challenge": ch, "canSelect": true, "options": opts, "exampleReward": ch["exampleReward"]}, nil
}

type ClaimInput struct {
	ChallengeID                       string
	RewardID                          any
	Size, Color, Phone, Address, City string
}

func reserve(ctx context.Context, tx *sql.Tx, reward db.Row, size, color string) error {
	if reward.Str("type") == "DISCOUNT" {
		return nil
	}
	if reward.Bool("requires_size") && size != "" {
		_, n, err := db.Exec(ctx, tx, `UPDATE reward_stock SET reserved = reserved + 1
			WHERE reward_id = ? AND size = ? AND (color = ? OR ? = '') AND quantity > reserved`, reward["id"], size, color, color)
		if err != nil {
			return err
		}
		if n == 0 {
			return herr("Нет в наличии выбранного размера", 409, "OUT_OF_STOCK")
		}
		return nil
	}
	_, n, err := db.Exec(ctx, tx, "UPDATE rewards SET reserved = reserved + 1 WHERE id = ? AND stock > reserved", reward["id"])
	if err != nil {
		return err
	}
	if n == 0 {
		return herr("Нет в наличии", 409, "OUT_OF_STOCK")
	}
	return nil
}

// Claim — claimChallengeReward.
func Claim(ctx context.Context, userID int64, in ClaimInput) (httpx.M, error) {
	var claimed httpx.M
	var tgText string
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		ch, err := db.One(ctx, tx, `SELECT uc.*, cl.level_num, cl.name AS level_name, cl.example_reward
			FROM user_challenges uc JOIN challenge_levels cl ON cl.id = uc.level_id
			WHERE uc.id = ? AND uc.user_id = ? FOR UPDATE`, in.ChallengeID, userID)
		if err != nil {
			return err
		}
		if ch == nil {
			return herr("Задание не найдено", 404, "NOT_FOUND")
		}
		if ch.Str("status") != "COMPLETED" {
			return herr("Задание ещё не выполнено", 409, "NOT_COMPLETED")
		}
		if ch["reward_claimed_at"] != nil {
			return herr("Награда уже получена", 409, "ALREADY_CLAIMED")
		}

		var reward db.Row
		if httpx.Truthy(in.RewardID) {
			if reward, err = db.One(ctx, tx, `SELECT r.* FROM challenge_level_rewards clr JOIN rewards r ON r.id = clr.reward_id
				WHERE clr.level_id = ? AND clr.reward_id = ? AND clr.active = 1 AND r.active = 1`, ch["level_id"], httpx.ToString(in.RewardID)); err != nil {
				return err
			}
			if reward == nil {
				cnt, err := db.Scalar(ctx, tx, "SELECT COUNT(*) AS cnt FROM challenge_level_rewards WHERE level_id = ? AND active = 1", ch["level_id"])
				if err != nil {
					return err
				}
				if db.ToFloat(cnt) > 0 {
					return herr("Эта награда недоступна для задания", 400, "INVALID_REWARD")
				}
				if reward, err = db.One(ctx, tx, "SELECT * FROM rewards WHERE id = ? AND active = 1", httpx.ToString(in.RewardID)); err != nil {
					return err
				}
			}
		} else if reward, err = db.One(ctx, tx, `SELECT r.* FROM challenge_level_rewards clr JOIN rewards r ON r.id = clr.reward_id
			WHERE clr.level_id = ? AND clr.active = 1 AND r.active = 1 ORDER BY clr.sort_order ASC LIMIT 1`, ch["level_id"]); err != nil {
			return err
		}

		if reward == nil {
			if _, _, err := db.Exec(ctx, tx, "UPDATE user_challenges SET reward_claimed_at = NOW() WHERE id = ?", ch["id"]); err != nil {
				return err
			}
			claimed = httpx.M{"id": nil, "name": util.FirstNonEmpty(ch.Str("example_reward"), ch.Str("level_name")), "type": "SPECIAL"}
			return nil
		}
		if reward.Bool("requires_size") && strings.TrimSpace(in.Size) == "" {
			return herr("Выберите размер", 400, "SIZE_REQUIRED")
		}
		var promo any
		if reward.Str("type") == "DISCOUNT" {
			promo = "RUN-" + strings.ToUpper(rewards.NanoID(6))
		}
		if err := reserve(ctx, tx, reward, in.Size, in.Color); err != nil {
			return err
		}
		if _, _, err := db.Exec(ctx, tx, "UPDATE user_challenges SET reward_id = ?, reward_claimed_at = NOW() WHERE id = ?", reward["id"], ch["id"]); err != nil {
			return err
		}
		if _, _, err := db.Exec(ctx, tx, `INSERT INTO user_challenge_rewards
			(user_challenge_id, user_id, level_id, reward_id, status, size, color, phone, address, city, promo_code, claimed_at)
			VALUES (?, ?, ?, ?, 'CLAIMED', ?, ?, ?, ?, ?, ?, NOW())`,
			ch["id"], userID, ch["level_id"], reward["id"], util.NilIfEmpty(in.Size), util.NilIfEmpty(in.Color),
			util.NilIfEmpty(in.Phone), util.NilIfEmpty(in.Address), util.NilIfEmpty(in.City), promo); err != nil {
			return err
		}
		claimed = httpx.M{"id": reward["id"], "name": reward["name"], "type": reward["type"], "promoCode": promo}
		tgText = fmt.Sprintf("🎁 Challenge reward claimed\nUser #%d\nLevel %v: %s\nReward: %s", userID, ch["level_num"], ch.Str("level_name"), reward.Str("name"))
		return nil
	})
	if err != nil {
		return nil, err
	}
	if tgText != "" {
		notify.Telegram(tgText)
	}
	state, err := State(ctx, userID)
	if err != nil {
		return nil, err
	}
	state["claimed"] = true
	state["reward"] = claimed
	return state, nil
}
