#!/usr/bin/env python3
"""Сравнение ответов Node.js и Go на одних и тех же запросах.

Запуск (оба сервиса смотрят в одну тестовую БД):
    python3 scripts/parity.py --node http://localhost:3001 --go http://localhost:8080

Каждый шаг сценария выполняется сначала на Node, затем на Go. Сравниваются
HTTP-статус и JSON. Изменчивые поля (токены, id, время) не сравниваются.
Из-за этого шаги, которые меняют данные, выполняются дважды — сценарий
сам учитывает это (например, разные телефоны для регистрации).
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

VOLATILE = {
    "token", "id", "clientId", "client_id", "created_at", "updated_at", "started_at",
    "finished_at", "expires_at", "device_bound_at", "activated_at", "dev_code", "phone",
    "workout_id", "workoutId", "user_id", "last_point_at", "server_time", "serverTime", "recorded_at",
    "updated_at", "unique_id", "promoCode", "totalMs", "startAt", "expiresAt", "completedAt", "selectedAt", "deliveredAt",
    "challengeId", "milestoneId", "levelId", "receipt_url", "rank", "userId",
}


def call(base, method, path, body=None, token=None, device="parity-device"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Device-Id", device)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        return status, json.loads(raw or b"null")
    except json.JSONDecodeError:
        return status, raw.decode(errors="replace")[:200]


# Осознанные отличия Go от Node: (подстрока пути в diff, пояснение).
KNOWN = [
    (".delivery_fee", "баг Node: стоимость доставки писалась в delivery_method (baseValues[11])"),
    (".delivery_method", "баг Node: см. delivery_fee"),
    (".stockLeft", "общий склад наград: Node и Go резервируют по очереди"),
]


def known_reason(problem):
    for needle, why in KNOWN:
        if needle in problem.split(":")[0]:
            return why
    return None


def strip(v):
    if isinstance(v, dict):
        return {k: strip(x) for k, x in v.items() if k not in VOLATILE}
    if isinstance(v, list):
        return [strip(x) for x in v]
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def diff(a, b, path=""):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{path}.{k}: только в Go = {json.dumps(b[k], ensure_ascii=False)[:120]}")
            elif k not in b:
                out.append(f"{path}.{k}: только в Node = {json.dumps(a[k], ensure_ascii=False)[:120]}")
            else:
                out += diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: длина Node={len(a)} Go={len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff(x, y, f"{path}[{i}]")
    elif a != b:
        out.append(f"{path}: Node={json.dumps(a, ensure_ascii=False)[:120]} Go={json.dumps(b, ensure_ascii=False)[:120]}")
    return out


class Runner:
    def __init__(self, node, go):
        self.bases = {"node": node, "go": go}
        self.tokens = {}
        self.failed = 0
        self.total = 0

    def step(self, name, method, path, body=None, auth=True, device="parity-device", per_side=None):
        """per_side(side) → (path, body) для шагов, которые должны отличаться между сервисами."""
        res = {}
        for side, base in self.bases.items():
            p, b = (path, body) if per_side is None else per_side(side)
            res[side] = call(base, method, p, b, self.tokens.get(side) if auth else None, device)
        self.total += 1
        (sn, jn), (sg, jg) = res["node"], res["go"]
        problems = [] if sn == sg else [f"status Node={sn} Go={sg}"]
        problems += diff(strip(jn), strip(jg))
        known = sorted({known_reason(p) for p in problems if known_reason(p)})
        problems = [p for p in problems if not known_reason(p)]
        mark = "OK  " if not problems else "DIFF"
        print(f"{mark} {method} {path}  [{name}]" + (f"  (известное: {'; '.join(known)})" if known else ""))
        for p in problems[:15]:
            print("       ", p)
        if problems:
            self.failed += 1
        return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--node", default="http://localhost:3001")
    ap.add_argument("--go", default="http://localhost:8080")
    ap.add_argument("--code", default="123456", help="SMS_DEV_CODE на обоих сервисах")
    ap.add_argument("--full", action="store_true",
                    help="сценарий с записью: тренировки, награды, заказ (только для тестовой БД!)")
    args = ap.parse_args()
    r = Runner(args.node, args.go)

    # Уникальные номера на каждый запуск — без кулдауна SMS от прошлого прогона.
    suffix = f"{int(time.time()) % 10000:04d}"
    phones = {"node": f"+992 91 {suffix[:2]}0 {suffix[2:]}01", "go": f"+992 92 {suffix[:2]}0 {suffix[2:]}01"}

    # --- этап 3: auth ---
    r.step("sms status", "GET", "/api/auth/sms/status", auth=False)
    r.step("bad purpose", "POST", "/api/auth/sms/send", {"phone": "1"}, auth=False)
    r.step("bad phone", "POST", "/api/auth/sms/send", {"phone": "123", "purpose": "login"}, auth=False)
    r.step("send login code", "POST", "/api/auth/sms/send", auth=False,
           per_side=lambda s: ("/api/auth/sms/send", {"phone": phones[s], "purpose": "login"}))
    r.step("resend cooldown", "POST", "/api/auth/sms/send", auth=False,
           per_side=lambda s: ("/api/auth/sms/send", {"phone": phones[s], "purpose": "login"}))
    r.step("wrong code", "POST", "/api/auth/sms/login", auth=False,
           per_side=lambda s: ("/api/auth/sms/login", {"phone": phones[s], "code": "000000"}))
    res = r.step("sms login (new user)", "POST", "/api/auth/sms/login", auth=False,
                 per_side=lambda s: ("/api/auth/sms/login", {"phone": phones[s], "code": args.code}))
    for side in r.bases:
        st, js = res[side]
        if isinstance(js, dict) and js.get("token"):
            r.tokens[side] = js["token"]
    if len(r.tokens) != 2:
        print("Не удалось войти на обоих сервисах — дальше не проверяю.")
        sys.exit(1)

    r.step("me", "GET", "/api/auth/me")
    r.step("me other device", "GET", "/api/auth/me", device="other-device")
    r.step("profile no name", "PATCH", "/api/auth/profile", {})
    r.step("profile empty city", "PATCH", "/api/auth/profile", {"firstName": "Тест", "city": ""})
    r.step("profile setup", "PATCH", "/api/auth/profile", {"firstName": "Тест", "lastName": "Бегун", "city": "Душанбе"})
    r.step("no token", "GET", "/api/auth/me", auth=False)
    r.step("bonus gone", "GET", "/api/bonus/balance")
    r.step("summary gone", "GET", "/api/user/summary")
    r.step("password login wrong", "POST", "/api/auth/login", {"phone": "nope", "password": "x"}, auth=False)

    # --- этап 4: shoes ---
    r.step("validate empty", "POST", "/api/mobile/shoes/validate-qr", {}, auth=False)
    r.step("validate unknown", "POST", "/api/mobile/shoes/validate-qr", {"unique_id": "NOPE"}, auth=False)
    r.step("validate demo", "POST", "/api/mobile/shoes/validate-qr", {"unique_id": " shoe-demo-001 "}, auth=False)
    r.step("shoe status", "GET", "/api/mobile/shoes/status")
    r.step("activate gone", "POST", "/api/shoes/activate", {})

    # --- этапы 5–9: только чтение, без побочных эффектов ---
    for path in [
        "/api/me", "/api/rewards/progress", "/api/rewards/milestones", "/api/rewards/my",
        "/api/challenges", "/api/challenges/current", "/api/challenges/state",
        "/api/leaderboard", "/api/leaderboard?period=week",
        "/api/workouts", "/api/workouts/history", "/api/workouts/active", "/api/workouts/current",
        "/api/mobile/shop-categories", "/api/mobile/shop-catalog", "/api/mobile/products",
        "/api/mobile/payment-methods", "/api/mobile/delivery-methods",
        "/api/mobile/mobile-payment-accounts", "/api/mobile/my-orders",
        "/api/mobile/ads/config", "/api/mobile/ads/banners?placement=home",
    ]:
        r.step("read", "GET", path)
    r.step("start without shoe", "POST", "/api/workouts/start", {})

    if args.full:
        scenario(r, args)

    print(f"\n{r.total - r.failed}/{r.total} совпадают")
    sys.exit(1 if r.failed else 0)


def ws_exchange(base, path, messages):
    """Минимальный WebSocket-клиент: handshake, отправка текстовых кадров, чтение ответов."""
    import base64
    import os
    import socket
    from urllib.parse import urlparse

    u = urlparse(base)
    sock = socket.create_connection((u.hostname, u.port or 80), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    sock.sendall((f"GET {path} HTTP/1.1\r\nHost: {u.hostname}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
    head = b""
    while b"\r\n\r\n" not in head:
        chunk = sock.recv(1)
        if not chunk:
            break
        head += chunk
    status = int(head.split(b" ")[1]) if head else 0
    if status != 101:
        sock.close()
        return [{"http_status": status}]

    def recv_exact(n):
        buf = b""
        while len(buf) < n:
            c = sock.recv(n - len(buf))
            if not c:
                raise ConnectionError
            buf += c
        return buf

    def read_frame():
        b1, b2 = recv_exact(2)
        n = b2 & 0x7F
        if n == 126:
            n = int.from_bytes(recv_exact(2), "big")
        elif n == 127:
            n = int.from_bytes(recv_exact(8), "big")
        data = recv_exact(n)
        return b1 & 0x0F, data

    def send(text):
        payload = text.encode()
        mask = os.urandom(4)
        hdr = bytes([0x81])
        n = len(payload)
        if n < 126:
            hdr += bytes([0x80 | n])
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + n.to_bytes(2, "big")
        else:
            hdr += bytes([0x80 | 127]) + n.to_bytes(8, "big")
        sock.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    out = []
    try:
        op, data = read_frame()
        out.append(json.loads(data))
        for m in messages:
            send(json.dumps(m))
            op, data = read_frame()
            if op == 8:
                out.append({"closed": int.from_bytes(data[:2], "big") if len(data) >= 2 else None})
                break
            out.append(json.loads(data))
    except (ConnectionError, socket.timeout):
        out.append({"closed": "eof"})
    sock.close()
    return out


def track(start_lat=38.56, step_m=50, n=12, dt=10, speed=10):
    """Прямой трек на север: n точек каждые dt секунд от текущего момента."""
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    pts = []
    for i in range(n):
        t = now + datetime.timedelta(seconds=i * dt)
        pts.append({"latitude": start_lat + i * step_m / 111_320, "longitude": 68.78, "speed": speed,
                    "accuracy": 5, "recorded_at": t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"})
    return pts


def scenario(r, args):
    print("\n--- сценарий с записью ---")
    st, admin = call(args.node, "POST", "/api/admin/login", {"login": "admin", "password": "admin123"})
    atok = admin.get("token")
    st, gen = call(args.node, "POST", "/api/admin/shoes/generate", {"model_name": "Parity", "quantity": 2}, atok)
    codes = {"node": gen["shoes"][0]["unique_id"], "go": gen["shoes"][1]["unique_id"]}
    call(args.node, "POST", "/api/admin/rewards/milestones",
         {"name": "Тест 0.5 км", "distance_km": 0.5, "status": "active", "reward_ids": [1, 3]}, atok)
    st, prod = call(args.node, "POST", "/api/admin/shop/products",
                    {"name": "Parity Runner", "price": 450, "status": "active", "category_id": "shoes",
                     "sizes": [{"size": "42", "status": "active"}], "images": []}, atok)
    call(args.node, "POST", "/api/admin/shop/warehouse/stock",
         {"product_id": prod["id"], "size": "42", "quantity": 10}, atok)

    suffix = f"{int(time.time()) % 10000:04d}"
    phones = {"node": f"+992 93 {suffix[:2]}0 {suffix[2:]}11", "go": f"+992 94 {suffix[:2]}0 {suffix[2:]}11"}
    dev = "parity-runner"
    res = r.step("register with QR", "POST", "/api/auth/register", auth=False, device=dev,
                 per_side=lambda s: ("/api/auth/register", {"firstName": "Бегун", "lastName": "Тест", "phone": phones[s],
                                                            "password": "1234", "city": "Душанбе", "unique_id": codes[s]}))
    for s in r.bases:
        r.tokens[s] = res[s][1]["token"]
    r.step("register duplicate", "POST", "/api/auth/register", auth=False, device=dev,
           per_side=lambda s: ("/api/auth/register", {"firstName": "Б", "lastName": "Т", "phone": phones[s], "password": "1234"}))
    r.step("password login", "POST", "/api/auth/login", auth=False, device=dev,
           per_side=lambda s: ("/api/auth/login", {"phone": phones[s], "password": "1234"}))
    r.step("shoe status", "GET", "/api/mobile/shoes/status", device=dev)

    # одобренная тренировка
    res = r.step("start", "POST", "/api/workouts/start", {}, device=dev)
    wid = {s: res[s][1].get("workoutId") for s in r.bases}
    r.step("start twice", "POST", "/api/workouts/start", {}, device=dev)
    r.step("current", "GET", "/api/workouts/current", device=dev)
    pts = track()
    r.step("points batch", "POST", "/api/workouts/{id}/points", device=dev,
           per_side=lambda s: (f"/api/workouts/{wid[s]}/points", {"points": pts[:6]}))
    r.step("pause", "POST", "/api/workouts/{id}/pause", {}, device=dev,
           per_side=lambda s: (f"/api/workouts/{wid[s]}/pause", {}))
    r.step("resume", "POST", "/api/workouts/{id}/resume", {}, device=dev,
           per_side=lambda s: (f"/api/workouts/{wid[s]}/resume", {}))

    tokens = dict(r.tokens)
    ws = {s: ws_exchange(r.bases[s], f"/app/workout?token={tokens[s]}&device_id={dev}&workout_id={wid[s]}", [
        {"type": "ping"},
        {"type": "client_point_send", "points": pts[6:], "steps_count": 800, "request_id": "r1"},
        {"type": "bogus"},
        {"type": "client_finish", "request_id": "r2"},
    ]) for s in r.bases}
    r.total += 1
    problems = diff(strip(ws["node"]), strip(ws["go"]))
    print(("OK  " if not problems else "DIFF") + " WS /app/workout  [ping, points, bogus, finish]")
    for p in problems:
        print("       ", p)
    r.failed += bool(problems)
    ws_bad = {s: ws_exchange(r.bases[s], f"/app/workout?token=bad&workout_id={wid[s]}", []) for s in r.bases}
    r.total += 1
    ok = strip(ws_bad["node"]) == strip(ws_bad["go"])
    print(("OK  " if ok else "DIFF") + f" WS /app/workout  [bad token] {ws_bad}")
    r.failed += not ok

    live = {s: ws_exchange(r.bases[s], f"/admin/live-tracking?token={atok}", []) for s in r.bases}
    r.total += 1
    shapes = {s: [(m.get("type"), sorted(m)) for m in live[s]] for s in live}
    ok = shapes["node"] == shapes["go"] and len(live["node"][0].get("workouts", [])) == len(live["go"][0].get("workouts", []))
    print(("OK  " if ok else "DIFF") + f" WS /admin/live-tracking  [snapshot: {len(live['go'][0].get('workouts', []))} активных]")
    r.failed += not ok

    r.step("route points", "GET", "/api/workouts/{id}/points", device=dev,
           per_side=lambda s: (f"/api/workouts/{wid[s]}/points", None))
    r.step("finish approved", "POST", "/api/workouts/finish", device=dev,
           per_side=lambda s: ("/api/workouts/finish", {"workout_id": wid[s], "duration_seconds": 600,
                                                          "steps_count": 900, "moving_seconds": 580, "pause_seconds": 20}))
    r.step("finish again", "POST", "/api/workouts/{id}/finish", {}, device=dev,
           per_side=lambda s: (f"/api/workouts/{wid[s]}/finish", {}))
    r.step("history", "GET", "/api/workouts/history", device=dev)
    r.step("progress", "GET", "/api/rewards/progress", device=dev)
    r.step("me", "GET", "/api/me", device=dev)
    r.step("challenge state", "GET", "/api/challenges/state", device=dev)
    r.step("challenge start busy", "POST", "/api/challenges/start", {}, device=dev)
    r.step("leaderboard", "GET", "/api/leaderboard?limit=5", device=dev)

    # отклонённая: слишком быстро и мало точек
    res = r.step("start 2", "POST", "/api/workouts/start", {}, device=dev)
    wid2 = {s: res[s][1].get("workoutId") for s in r.bases}
    r.step("finish rejected", "POST", "/api/workouts/{id}/finish", device=dev,
           per_side=lambda s: (f"/api/workouts/{wid2[s]}/finish", {"points": track(n=3, step_m=30, dt=2)}))
    # антифрод: скорость 80 км/ч
    res = r.step("start 3", "POST", "/api/workouts/start", {}, device=dev)
    wid3 = {s: res[s][1].get("workoutId") for s in r.bases}
    r.step("speed fraud", "POST", "/api/workouts/{id}/points", device=dev,
           per_side=lambda s: (f"/api/workouts/{wid3[s]}/points", {"points": track(n=2, speed=80)}))
    r.step("after fraud", "GET", "/api/workouts/current", device=dev)

    # награды
    st, ms = call(args.node, "GET", "/api/rewards/milestones", token=r.tokens["node"], device=dev)
    test_ms = next((m for m in ms if m["name"] == "Тест 0.5 км"), None) if isinstance(ms, list) else None
    if test_ms:
        r.step("milestone options", "GET", f"/api/rewards/milestones/{test_ms['id']}", device=dev)
        r.step("select no ids", "POST", "/api/rewards/select", {}, device=dev)
        r.step("select bad reward", "POST", "/api/rewards/select", {"milestoneId": test_ms["id"], "rewardId": 9}, device=dev)
        r.step("select bottle", "POST", "/api/rewards/select",
               {"milestoneId": test_ms["id"], "rewardId": 1, "address": "ул. Рудаки 1"}, device=dev)
        r.step("select again", "POST", "/api/rewards/select", {"milestoneId": test_ms["id"], "rewardId": 3}, device=dev)
        r.step("my rewards", "GET", "/api/rewards/my", device=dev)

    # магазин
    r.step("product", "GET", f"/api/mobile/products/{prod['id']}", device=dev)
    r.step("catalog shoes", "GET", "/api/mobile/shop-catalog?category_id=shoes", device=dev)
    r.step("order invalid", "POST", "/api/mobile/orders", {"product_id": prod["id"]}, device=dev)
    r.step("order no delivery", "POST", "/api/mobile/orders",
           {"product_id": prod["id"], "customer_name": "Бегун Тест", "phone": "900000000"}, device=dev)
    r.step("order mobile no receipt", "POST", "/api/mobile/orders",
           {"product_id": prod["id"], "customer_name": "Бегун Тест", "phone": "900000000", "delivery_method": "pickup",
            "payment_method": "mobile", "payment_details": "x"}, device=dev)
    r.step("order ok", "POST", "/api/mobile/orders",
           {"product_id": prod["id"], "size": "42", "quantity": 2, "customer_name": "Бегун Тестов", "phone": "900000000",
            "city": "Душанбе", "address": "ул. Рудаки 1", "delivery_method": "courier", "payment_method": "cash",
            "apply_delivery_fee": True}, device=dev)
    r.step("order no stock", "POST", "/api/mobile/orders",
           {"product_id": prod["id"], "size": "44", "customer_name": "Б", "phone": "9", "delivery_method": "pickup",
            "payment_method": "cash"}, device=dev)
    r.step("my orders", "GET", "/api/mobile/my-orders", device=dev)
    r.step("push register", "POST", "/api/mobile/push/register", {"token": "parity-token", "platform": "ios"}, device=dev)
    r.step("push unregister", "DELETE", "/api/mobile/push/register", {"token": "parity-token"}, device=dev)
    r.step("logout", "POST", "/api/auth/logout", {}, device=dev)


if __name__ == "__main__":
    main()
