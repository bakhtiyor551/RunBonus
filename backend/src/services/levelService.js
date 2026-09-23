import { pool } from '../db.js';
import { getConfirmedDistanceKm, syncUserTotalDistance } from './rewardService.js';

function roundKm(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export async function listActiveLevels(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, level_number, name, description, min_distance, max_distance, icon, color, sort_order, active
     FROM runbonus_levels
     WHERE active = 1
     ORDER BY level_number ASC, sort_order ASC`
  );
  return rows.map(mapLevel);
}

export async function listAllLevels(conn = pool) {
  const [rows] = await conn.query(
    `SELECT * FROM runbonus_levels ORDER BY level_number ASC, sort_order ASC`
  );
  return rows.map(mapLevel);
}

function mapLevel(row) {
  return {
    id: row.id,
    level: Number(row.level_number),
    name: row.name,
    description: row.description || null,
    minDistance: roundKm(row.min_distance),
    maxDistance: row.max_distance == null ? null : roundKm(row.max_distance),
    icon: row.icon || null,
    color: row.color || null,
    sortOrder: Number(row.sort_order) || 0,
    active: Boolean(row.active),
  };
}

export function resolveLevelForDistance(totalDistance, levels) {
  const km = roundKm(totalDistance);
  const sorted = [...(levels || [])].sort((a, b) => a.level - b.level);
  if (!sorted.length) {
    return {
      level: 0,
      name: 'Новичок',
      icon: null,
      color: null,
      minDistance: 0,
      maxDistance: null,
      nextLevel: null,
      nextDistance: null,
      remainingDistance: null,
      progress: 100,
    };
  }

  let current = sorted[0];
  for (const lv of sorted) {
    if (km >= lv.minDistance) current = lv;
  }

  const idx = sorted.findIndex((l) => l.id === current.id);
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  const spanStart = current.minDistance;
  const spanEnd = next ? next.minDistance : current.maxDistance;
  let progress = 100;
  let remainingDistance = null;
  if (next) {
    const span = Math.max(next.minDistance - spanStart, 0.001);
    progress = round2(Math.min(100, Math.max(0, ((km - spanStart) / span) * 100)));
    remainingDistance = roundKm(Math.max(0, next.minDistance - km));
  }

  return {
    level: current.level,
    name: current.name,
    description: current.description,
    icon: current.icon,
    color: current.color,
    minDistance: current.minDistance,
    maxDistance: current.maxDistance,
    nextLevel: next ? next.level : null,
    nextName: next ? next.name : null,
    nextDistance: next ? next.minDistance : null,
    remainingDistance,
    progress,
    totalDistance: km,
  };
}

/** GET /api/levels/me */
export async function getMyLevel(userId) {
  const totalDistance = await syncUserTotalDistance(userId);
  const levels = await listActiveLevels();
  const resolved = resolveLevelForDistance(totalDistance, levels);
  return {
    level: resolved.level,
    name: resolved.name,
    description: resolved.description || null,
    icon: resolved.icon,
    color: resolved.color,
    totalDistance: resolved.totalDistance,
    nextLevel: resolved.nextLevel,
    nextName: resolved.nextName || null,
    nextDistance: resolved.nextDistance,
    remainingDistance: resolved.remainingDistance,
    progress: resolved.progress,
    levels: levels.map((lv) => ({
      ...lv,
      isCurrent: lv.level === resolved.level,
      unlocked: totalDistance >= lv.minDistance,
    })),
  };
}

/**
 * Detect level-up after distance sync. Returns newly reached level or null.
 * previousDistance = distance before this workout was added.
 */
export async function detectLevelUp(previousDistance, currentDistance, conn = pool) {
  const levels = await listActiveLevels(conn);
  const before = resolveLevelForDistance(previousDistance, levels);
  const after = resolveLevelForDistance(currentDistance, levels);
  if (after.level > before.level) {
    return after;
  }
  return null;
}

export async function createLevel(data) {
  const [result] = await pool.query(
    `INSERT INTO runbonus_levels
      (level_number, name, description, min_distance, max_distance, icon, color, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(data.level_number ?? data.level),
      data.name,
      data.description || null,
      Number(data.min_distance ?? data.minDistance) || 0,
      data.max_distance != null || data.maxDistance != null
        ? Number(data.max_distance ?? data.maxDistance)
        : null,
      data.icon || null,
      data.color || null,
      Number(data.sort_order ?? data.sortOrder) || 0,
      data.active === false || data.active === 0 ? 0 : 1,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM runbonus_levels WHERE id = ?', [result.insertId]);
  return mapLevel(rows[0]);
}

export async function updateLevel(id, data) {
  await pool.query(
    `UPDATE runbonus_levels SET
      level_number = ?, name = ?, description = ?, min_distance = ?, max_distance = ?,
      icon = ?, color = ?, sort_order = ?, active = ?
     WHERE id = ?`,
    [
      Number(data.level_number ?? data.level),
      data.name,
      data.description || null,
      Number(data.min_distance ?? data.minDistance) || 0,
      data.max_distance != null || data.maxDistance != null
        ? Number(data.max_distance ?? data.maxDistance)
        : null,
      data.icon || null,
      data.color || null,
      Number(data.sort_order ?? data.sortOrder) || 0,
      data.active === false || data.active === 0 ? 0 : 1,
      id,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM runbonus_levels WHERE id = ?', [id]);
  return rows[0] ? mapLevel(rows[0]) : null;
}

export async function setLevelActive(id, active) {
  await pool.query('UPDATE runbonus_levels SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  const [rows] = await pool.query('SELECT * FROM runbonus_levels WHERE id = ?', [id]);
  return rows[0] ? mapLevel(rows[0]) : null;
}

export { getConfirmedDistanceKm };
