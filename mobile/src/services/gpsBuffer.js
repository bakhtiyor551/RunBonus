const DB_NAME = 'runbonus_gps_buffer';
const DB_VERSION = 1;
const STORE = 'pending_points';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('workout_status', ['workout_id', 'status'], { unique: false });
        store.createIndex('workout_id', 'workout_id', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function pointPayload(workoutId, point) {
  const lat = Number(point.latitude ?? point.lat);
  const lng = Number(point.longitude ?? point.lng);
  const recordedAt = point.recorded_at ?? point.recordedAt ?? new Date().toISOString();
  return {
    workout_id: Number(workoutId),
    latitude: lat,
    longitude: lng,
    speed: point.speed != null ? Number(point.speed) : point.speedMps ?? null,
    accuracy: point.accuracy != null ? Number(point.accuracy) : null,
    recorded_at: recordedAt,
    status: 'pending',
    created_at: Date.now(),
  };
}

/** Записать GPS-точку в локальный буфер (status: pending). */
export async function bufferGpsPoint(workoutId, point) {
  const payload = pointPayload(workoutId, point);
  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) return null;

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.add(payload);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Получить pending-точки для тренировки (по recorded_at). */
export async function getPendingPoints(workoutId, limit = 50) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const index = store.index('workout_id');
    const req = index.getAll(Number(workoutId));
    req.onsuccess = () => {
      const rows = (req.result || [])
        .filter((r) => r.status === 'pending')
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
        .slice(0, limit);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Удалить точки из буфера после успешной отправки. */
export async function deleteBufferedPoints(ids) {
  if (!ids?.length) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Очистить буфер тренировки. */
export async function clearWorkoutBuffer(workoutId) {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const index = store.index('workout_id');
    const req = index.getAll(Number(workoutId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  if (!all.length) return;
  await deleteBufferedPoints(all.map((r) => r.id));
}

/** Преобразовать buffered row в формат API. */
export function bufferedToApiPoint(row) {
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    accuracy: row.accuracy,
    recorded_at: row.recorded_at,
  };
}
