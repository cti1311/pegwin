# Pegwin Backend — Resume Handoff (Muse Code on Windows)

Date: 2026-10-11. Previous work done in a Linux sandbox; moving to Windows.
This file is the full context needed to resume. The old chat session does not transfer.

## 1. Project layout

```
pegwin/
  backend/
    src/
      app.js                 # Slim entry: JSON body, request logger, /health, single routes import, error logging
      config/index.js        # PORT, DB_*, LOG_* (level, dir, file/console toggles, retention days, max bytes)
      db/index.js            # mysql2 pool (db.execute + db.query)
      middleware/auth.js     # STUB: any bearer -> stub user. Real JWT verification is TODO.
      middleware/errors.js   # { error: { code, message, details? } } envelope; generic 500 mapping
      routes/index.js        # SINGLE entry: wires all 14 slice routers. app.js imports only this.
      routes/*Routes.js      # Thin HTTP mapping only, no SQL/rules
      services/*Service.js   # Flows; consume dtos/*, throw { status, code, message } via helpers/domainError
      repositories/*Repository.js  # Own all SQL strings, byte-identical
      models/*Model.js       # Pure constants/validation/paging/mapping, no DB
      dtos/*.js              # Request parse/validate + response shaping (auth, users, events, ticketing,
                             #   orders, payments, payouts, checkins, communities, groups, posts,
                             #   engagement, admin, support)
      utils/logger.js        # Console + file logging, daily rotation, size roll, retention pruning. Default file ON.
      utils/httpClient.js    # axios instance for outbound calls
      utils/ids.js           # ULID-ish uid()
      helpers/asyncRoute.js  # withDomainErrors, needRole
      helpers/domainError.js # fail(status, code, message)
    migrations/001-core.sql … 010-notify-logs.sql  # Forward-only; apply in order. Do NOT edit old ones.
    tests/                   # auth-users (jest) + ticketing/events/communities/payments-checkins/
                             #   notifications (node:test TAP) + engagement-admin smoke
    scripts/migrate.js       # `npm run migrate`
    .env.example             # Includes LOG_* + FIREBASE_*/PUSH_*/EMAIL_* keys
    utils/firebase.js        # Admin SDK: verifyIdToken + FCM send (lazy-require; boots without creds)
    utils/emailer.js         # Multi-provider SMTP email, SES primary + Brevo failover
    services/notificationsService.js  # dispatch(): inbox + push + email, pref-gated, never throws
  Dockerfile, docker-compose.yml, docker-compose.prod.yml   # Compose files YAML-validated only; `up` never run here
  postman/pegwin-api.postman_collection.json (163 requests)
  postman/pegwin-local.postman_environment.json
```

Layer rules (must keep): routes = HTTP mapping only; services = flows + DTOs, no SQL;
repositories = SQL only; models = pure, no DB; DTOs = all input validation.
`app.js` imports only `routes/index.js`.

## 2. Run on Windows

```powershell
cd pegwin\backend
npm install
# Start MySQL 8 + Redis:
docker compose up -d            # from pegwin/ (uses docker-compose.yml)
# Configure backend/.env from .env.example (DB_HOST/PORT/USER/PASSWORD/NAME, PORT, LOG_*)
npm run migrate                 # applies migrations/001..009 in order
npm test                        # full gate, must be green
npm start                       # or: node src/app.js
```

Health check: `GET /health` -> `{"ok":true}`. API base: `/api/v1`.
Unknown route contract: `404 {"error":{"code":"NOT_FOUND","message":"Route not found."}}`.
Errors never leak internals (ECONNREFUSED etc. -> generic 500 envelope; details go to logs).

## 3. Verified state (do not redo unless changing code)

- `npm test` green: jest auth-users 9/9; communities 5/5; payments-checkins 5/5;
  ticketing + events TAP files pass; engagement-admin smoke passes.
- Live DB e2e (`/tmp/rt/e2e.js` — Linux-only path, NOT transferred) is STALE for auth:
  it used the retired /otp/* flow. OTP is now Firebase Phone Auth (client verifies,
  backend verifies the ID token). Non-auth steps still valid: event discovery ->
  quote math 129800 (2x50000 + 10% fee + 18% GST) -> hold 201 -> order 201 pending ->
  idempotent retry 200 same order -> 2 tickets, 12-char codes -> ticket confirmed ->
  cancel refunds full 129800.
- Request logging (info/line) + error logging (stack for 5xx) confirmed in `logs/`.
- Windows bring-up done 2026-10-12: Docker mysql+redis up, `backend/.env` created
  (note: NO dotenv loader — host runs need DB_* in shell env), migrations 001-010
  applied on real MySQL 8, backend on :3000 reachable via LAN. Backend auth-verify
  still needs FIREBASE_* service-account values + restart.

## 4. Fresh-DB checklist (Windows MySQL is empty)

1. `docker compose up -d`, `npm run migrate`, confirm 9 migrations applied.
2. Register + OTP verify flow needs no seed (OTP code read from `otp_codes` table).
3. For quote/hold/order flow: insert one `events` row (status `on_sale`) + one `tiers` row,
   then POST `/api/v1/checkout/quote` -> `/checkout/holds` -> `/orders` (Idempotency-Key header).
4. E2E uses fixed seed IDs (`01J000...`); on rerun, stale rows cause `duplicate primary key`
   or idempotency replays of old (possibly cancelled) orders. If a rerun fails at
   order/cancel steps, delete that order chain first:
   `DELETE FROM tickets/order_items/orders WHERE <ids>`, plus seed events/tiers/holds.

## 5. Known TODOs / risks (not yet done)

- `middleware/auth.js` is a STUB (any bearer accepted). Real JWT verification pending.
- Firebase service-account (FIREBASE_*) + SES/Brevo SMTP creds still needed in
  `backend/.env` (see `.env.example`); without them verify 503s, push/email skip.
- Scheduled reminders (cron for `upcoming_reminders`) still open — only event-driven
  triggers are wired (purchase/cancel, event cancel/reschedule, refund, announcements).
- Postman collection still shows retired `/otp/*` + `/password/forgot` (generated file,
  needs regeneration).
- Payments/payouts are draft-gated (`PAYMENTS_DRAFT=true`); spec section still TBD.
- Migrations were verified on Dolt (MySQL-compatible), NOT strict MySQL 8 — re-run 001-009
  on real MySQL 8 at least once and fix any dialect complaints forward-only (new migration).
- `logs/` rotation/retention is code-reviewed only; never observed over days.
- `docker compose up` with MySQL 8 + Redis was never executed (no daemon in sandbox).
- Postman collection exists (163 requests) but was generated, not hand-executed request-by-request.
- Test DB used: host 127.0.0.1 port 3307 user root, no password, db `pegwin`. Dolt data
  (`/tmp/rt/doltdb`) does NOT transfer — Windows starts from an empty MySQL.

## 6. Gotchas learned

- DTO signatures: `groupsDto.parseMessage(body, user)`, `parseUploadSlot(body, user)` —
  body FIRST. A rewire once swapped these and broke 3 tests; always read the DTO file.
- `communitiesService.patch` still needs the `EDITABLE` model import (column mapping);
  `groupsService.uploadSlot` still needs `UPLOAD_TTL_MS`. Don't strip "unused" model imports
  without checking the whole file.
- `ordersService.create` returns 201 fresh, 200 on idempotency replay — a test seeing 200
  on "create" means a stale row with the same Idempotency-Key, not a code bug.
- `tickets` table PK is `ticket_code` (no `id`); it has `event_id`, `holder_name` via 008/009.
- Reserve-word quoting: `` `groups` `` table is backtick-quoted in SQL.
- `node --check <file>` before every test run; full gate is `npm test` (exit 0 = all 7 files).
