# RunBonus — GPS / Apple Maps / Challenge (TZ)

## Принцип
- **Клиент** шлёт GPS + actions (start / points / pause / resume / finish).
- **Backend** — источник истины: дистанция, validation, `approved` / `suspicious` / `rejected` / `auto_closed`.
- В Challenge попадают **только** `status = approved` и `approved_distance_km` (после `start_at` задания).

## Статус реализации

| TZ | Статус |
|----|--------|
| Start только с ACTIVE shoes | ✅ `requireActiveShoe` + UI lock «Мои кроссовки» |
| Одна активная тренировка | ✅ `409 ACTIVE_WORKOUT_EXISTS` |
| GPS points batch + offline buffer | ✅ `gpsBuffer` + WS/HTTP flush |
| Core Location (iOS) | ✅ `@capacitor/geolocation` → CLLocation |
| Карта маршрута | ✅ Leaflet + Carto Voyager на iOS; polyline |
| altitude / course / accuracy | ✅ клиент → buffer → `workout_points` |
| Server distance + validation | ✅ `workoutValidation.js` + reason codes |
| APPROVED → Challenge | ✅ только approved KM |
| SUSPICIOUS / REJECTED → 0 KM | ✅ `approved_distance_km = 0` |
| Pause / Resume API | ✅ `POST /:id/pause`, `/:id/resume` |
| Auto-close >24h | ✅ `auto_closed` + interval |
| Hold-to-stop finish | ✅ `HoldToStopButton` |
| Admin Live GPS | ✅ `WorkoutsLivePanel` |

## Миграция (обязательно)

```bash
mysql -u ... -p runbonus < database/migrations/044_workout_gps_tz.sql
# при необходимости:
mysql -u ... -p runbonus < database/migrations/043_challenges.sql
pm2 restart runbonus-api
```

## API
- `POST /api/workouts/start` `{ shoeId?, deviceId? }`
- `POST /api/workouts/:id/points` `{ points: [...] }`
- `POST /api/workouts/:id/pause` | `resume`
- `POST /api/workouts/:id/finish` → `distanceKm`, `approvedDistanceKm`, `status`, `validation_reasons`
- `GET /api/workouts/current` | `/active`
- `GET /api/workouts/history` | `/:id`
- `GET /api/challenges/current`

## Validation reasons
`GPS_JUMP`, `HIGH_SPEED`, `LOW_ACCURACY`, `GPS_GAP`, `INVALID_TIMESTAMP`, `DUPLICATE_POINTS`, `UNREALISTIC_DISTANCE`, `MOCK_LOCATION`, `AUTO_CLOSED`

## iOS Maps
На **iOS Workout Screen** — нативный **MapKit / MKMapView** (плагин `AppleMaps`):
- GPS = Core Location через `@capacitor/geolocation` (CLLocation);
- карта = Apple Maps (без Carto / Esri / OSM / Leaflet);
- маршрут = `MKPolyline`;
- позиция = стандартный `showsUserLocation`.

На **Android / Web** остаётся Leaflet + Esri/OSM (не iOS).

Admin Web: Leaflet / OSM — отдельные координаты из той же БД.

## Acceptance
1. Без активированных кроссовок старт недоступен.
2. Точки пакетами; offline → IndexedDB → flush.
3. Дистанция и статус только с сервера.
4. Challenge += только approved KM после `start_at`.
5. Workout >24ч → `auto_closed`, 0 KM.
6. Награда только после COMPLETED challenge (backend).
