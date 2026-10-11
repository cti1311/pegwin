# Pegwin Circle — API Specification (Node.js backend)

- Version: 1.0 (MVP baseline)
- Sources: `Pegwin_Client_BRD1.pdf` (BRD v1.0, Final Draft, 29 Aug 2026) and the Figma screen exports in `figma/` (8 flows, 141 unique screens, inspected screen-by-screen). Where Figma and BRD conflict, both are noted and Figma is marked Figma-mandated (per BRD §19, Figma is the primary UI reference).
- Screen → endpoint traceability: §17. Figma-mandated additions beyond the BRD baseline are tagged `(Figma)`.
- Scope: API surface only. No backend/frontend implementation.
- Out of scope for MVP: wallet (skipped per decision — Book Tickets shows UPI/Card only), ticket transfer, user-to-user direct messaging, member media sending (members text-only per decision), desktop host portal (see §15). Coordinates + radius search follow Figma maps; tile rendering stays client-side.

## 1. Conventions

- Base URL: `https://api.pegwin.in/api/v1` (version in path; breaking changes → `/v2`).
- Protocol: REST + JSON. `Content-Type: application/json`. Times in ISO-8601 UTC. Currency `INR` only.
- Auth: `Authorization: Bearer <accessJwt>` (short-lived) + `POST /auth/refresh` rotation via httpOnly refresh cookie or `refreshToken` body. OTP is part of auth (§2).
- Roles: `user` (attendee), `host` (Host Admin — owns events/communities), `event_staff` (per-event scoped permissions assigned by host), `super_admin`. Every endpoint lists allowed roles.
- Pagination: `GET` list endpoints accept `?page=&limit=` (default 20, max 100) and return `{ data: [...], page, limit, total }`.
- Errors: `{ error: { code, message, details? } }` with HTTP status. `code` values catalogued in §14.
- Idempotency: `POST /orders`, `POST /payments/intents`, `POST /checkins`, `POST /checkins/sync` accept optional `Idempotency-Key` header; retries with the same key return the original result.
- Webhooks (§8) are unauthenticated-by-JWT; verified by gateway signature headers instead.
- Pricing math (§6) is server-computed; clients never compute payable amounts.

### 1a. Field-level conventions (apply to every endpoint; per-API tables reference these)

- Charset: all strings are UTF-8. Unless noted, free-text max lengths are enforced server-side (400/4000 fast-fail with `VALIDATION_ERROR`).
- IDs: every resource `id` is a ULID string — `string(26), charset [0-9A-Z]`, sortable, generated server-side, never accepted from clients. `ticketCode` is `string(12), [A-Z0-9]`, server-generated. OTP is `string(6), digits`.
- Money: integer paise (`int >= 0`), e.g. ₹531.00 = `53100`. Currency is always `INR`. No floats for money.
- Timestamps: ISO-8601 UTC strings (`2026-08-18T18:30:00Z`). Date-only fields are `YYYY-MM-DD`.
- Phone: E.164 `string(4–16), +[0-9]`. Email: `string(3–254)` RFC format, lowercased by server.
- Coordinates: `latitude number(-90..90)`, `longitude number(-180..180)`. `radiusKm number(5..100)`.
- Pagination: `page int>=1 (default 1)`, `limit int 1..100 (default 20)` → `{ data[], page, limit, total }`. Cursor feeds (messages, posts, comments): `before? string, limit` → `{ data[], nextCursor }`.
- Errors: `{ error: { code: string (see §14), message: string, details?: object } }`.
- In per-API tables, Req `M` = client must send (400 if missing), `O` = optional (defaults noted). Fields marked `RO` are response-only (sent by server, rejected/ignored if sent).

## 2. Authentication & OTP

BRD: user registration, login and OTP authentication.

| Method & Path | Auth | Description |
|---|---|---|
| `POST /auth/register` | none | Register with name, phone/email, password. Body: `{ name, phone, email?, password }`. Returns `201 { userId, otpRequired: true }`. Triggers OTP. |
| `POST /auth/otp/request` | none | Request (or re-request) OTP. Body: `{ phone?, email?, purpose: "register"\|"login"\|"reset" }`. Returns `200 { expiresInSec }`. Rate-limited. |
| `POST /auth/otp/verify` | none | Verify OTP. Body: `{ phone?, email?, otp, purpose }`. Returns `200 { accessToken, refreshToken, user }` on success. Errors: `INVALID_OR_EXPIRED_OTP` (400/410). |
| `POST /auth/otp/resend` | none | Resend OTP (cooldown-enforced). Same body as request minus purpose ambiguity. Error `OTP_COOLDOWN` (429). |
| `POST /auth/login` | none | Password or OTP-initiated login. Body: `{ phone?, email?, password? }`. If account requires OTP, returns `202 { otpRequired: true }`. Else `200 { accessToken, refreshToken, user }`. |
| `POST /auth/refresh` | refresh token | Rotate tokens. Body: `{ refreshToken }` (or cookie). Returns new pair. |
| `POST /auth/logout` | bearer | Invalidate refresh token. Returns `204`. |
| `POST /auth/password/forgot` | none | Start reset (Forget Password screen). Body: `{ phone?, email? }`. Sends OTP. Returns `200`. |
| `POST /auth/password/reset` | none | Complete reset (New Password screen). Body: `{ phone?, email?, otp, newPassword }`. Returns `200`. |

### 2a. Auth field reference (per API)

**`POST /auth/register`** — Request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| name | string | M | 1–100 |
| phone | string | M* | E.164; *one of phone/email required |
| email | string | M* | 3–254 RFC; *one of phone/email required |
| password | string | M | 8–72 |

Response `201`: `{ userId: ULID(RO), otpRequired: true(RO) }`.

**`POST /auth/otp/request`** — Request `{ phone?, email? }` (same types; one required), `{ purpose: enum(register\|login\|reset) M }`. Response `200`: `{ expiresInSec: int(RO) }`.

**`POST /auth/otp/verify`** — Request adds `{ otp: string M, 6 digits }` to the above. Response `200`: `{ accessToken: string(JWT)(RO), refreshToken: string(RO), user: User(RO, §3a) }`.

**`POST /auth/otp/resend`** — Same as request. Error `OTP_COOLDOWN` (429) when resent too soon.

**`POST /auth/login`** — Request `{ phone?, email?, password? }` (same types). Response `200` tokens+user, or `202 { otpRequired: true(RO) }` when OTP is required.

**`POST /auth/refresh`** — Request `{ refreshToken: string M }` (or cookie). Response `200`: new `{ accessToken, refreshToken }(RO)`.

**`POST /auth/logout`** — No body. Response `204`.

**`POST /auth/password/forgot`** — Request `{ phone?, email? }` (one required). Response `200`.

**`POST /auth/password/reset`** — Request `{ phone?, email?, otp: string(6 digits) M, newPassword: string(8–72) M }`. Response `200`.

## 3. Users, Privacy & Account Management

BRD: user account and privacy management; visibility controls; exact real-time location never exposed; account deletion removes/anonymizes personal data (financial/transaction records retained).

| Method & Path | Auth | Description |
|---|---|---|
| `GET /users/me` | user, host, staff, admin | Own profile. Returns `{ id, name, username, avatarUrl, bio, phone, email, role, interests[], city, country, socialLinks {instagram, linkedin, website}, locale, visibility, createdAt }`. City-level location only, never exact. |
| `PATCH /users/me` | user, host, staff, admin | Update profile (Edit Profile screen: name, username, avatar via §11a upload, bio, interests from `GET /meta/interests`, city/country, social links, locale). Phone/email change re-triggers OTP verify. |
| `GET /users/username-available?username=` | bearer | Username uniqueness check for Edit Profile. Returns `{ available }`. |
| `GET /users/:userId/public` | bearer | Minimal public profile (Top Members, attendee lists, reporters): `{ id, name, username, avatarUrl }`. |
| `GET /users/me/events?filter=&range=` | user, host | Event history lists: `filter=hosted\|attended\|booked\|past`, `range=this_week\|last_month\|3_months\|1_year` (Hosted/Attended/Joined/Past screens). Hosted items add `{ ticketsSold, attendeesCount, checkedInPct, status }` and support `rehost` (§5). |
| `PATCH /users/me/visibility` | user, host | Visibility controls. Body: `{ profileVisible?: boolean, … }` per agreed settings. |
| `GET /users/me/orders` | user | Own orders (see §7). |
| `GET /users/me/tickets?status=` | user | Own digital tickets (My Tickets tabs: `active\|used\|expired`). See §7. (Figma) |
| `GET /users/me/communities` | user, host | Communities/groups joined (see §10). |
| `DELETE /users/me` | user, host | Delete/anonymize account. Query `?confirm=true`. Returns `202 { status: "scheduled" }`. Personal data removed/anonymized; orders/payments retained per law. Deleted/suspended accounts get `ACCOUNT_DELETED_OR_SUSPENDED` (403) on further calls. |

### 3a. User field reference (per API)

**`GET /users/me`** — Response `200`:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| id | ULID | RO | |
| name | string | RO | 1–100 |
| username | string | RO | 3–30, `[a-z0-9_.]` |
| avatarUrl | string(url) | RO | max 2048 |
| bio | string | RO | max 500 |
| phone | string | RO | E.164 |
| email | string | RO | 3–254 |
| role | enum | RO | `user\|host\|event_staff\|super_admin` |
| interests | string[] | RO | ≤10, from `GET /meta/interests` |
| city / country | string | RO | 1–100 each, city-level only |
| socialLinks | object | RO | `{instagram?,linkedin?,website?}` ≤2048 each |
| locale | string | RO | BCP-47, default `en-IN` |
| visibility | object | RO | `{profileVisible: bool}` |
| createdAt | datetime | RO | |

**`PATCH /users/me`** — Request: same fields as above except `id/role/createdAt`, all O (partial update; phone/email change re-triggers OTP). Response `200`: updated User.

**`GET /users/username-available?username=`** — Query `{ username: string(3–30) M }`. Response `200`: `{ available: bool(RO) }`.

**`GET /users/:userId/public`** — Response `200`: `{ id, name, username, avatarUrl }` (same types as above).

**`GET /users/me/orders`, `GET /users/me/tickets?status=`, `GET /users/me/communities`** — Standard list envelope (§1a); ticket items per §7a; `status` query `enum(active\|used\|expired) O`.

**`GET /users/me/events?filter=&range=`** — Query:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| filter | enum | M | `hosted\|attended\|booked\|past` |
| range | enum | O | `this_week\|last_month\|3_months\|1_year` |

Response `200`: Event cards (§4b) + on hosted items `{ ticketsSold: int(RO) ≥0, attendeesCount: int(RO) ≥0, checkedInPct: number(RO) 0..100, status: event-enum(RO) }`.

**`PATCH /users/me/visibility`** — Request `{ profileVisible?: bool O }` (+ any extra visibility keys). Response `200`: updated `visibility` object.

**`DELETE /users/me`** — Query `?confirm=true M`. Response `202`: `{ status: "scheduled"(RO) }`.

## 4. Event Discovery

BRD: discovery, search, filtering; location-based discovery is text/city-level in MVP (no maps provider — §15).

| Method & Path | Auth | Description |
|---|---|---|
| `GET /events` | optional bearer (personalization) | Public discovery (Explore). Only `on_sale`/`live`. Query: `search, city, category (GET /meta/categories), mode=online\|offline, eventType=public\|private\|invite_only, pricingModel=free\|paid\|vip\|hybrid, dateFrom, dateTo, priceMin, priceMax, lat, lng, radiusKm (Figma: discovery radius + Select City), page, limit`. Card: `{ id, title, coverImage, category, city, venue, startAt, endAt, status, minPrice, soldCount ("480 / 500 tickets sold"), goingCount ("412 going"), avgRating, isSaved }`. |
| `GET /events/:eventId` | optional bearer | Full detail (Event Details / Past Event Details screens): description, agenda (§4a), schedule, venue + address + city + lat/lng (map + View on Map deep-link; tiles are client-side), tiers, policies `{ refundPolicy, entryRules, ageRestriction }`, host public card (§5), linked community card (§11) with membership state, stats `{ goingCount, attendedCount, soldCount }`, `isSaved`. Non-public statuses → `EVENT_NOT_FOUND` (404) unless owner/admin. |
| `POST /events/:eventId/views` | optional bearer | Record a detail view (powers Analytics funnel: views → saved → purchases → attendees). Returns `204`. Deduped per user/day. (Figma) |
| `GET /events/:eventId/attendees` | optional bearer | Public going/attended list (View all): `{ attendees: [{ id, name, avatarUrl }], goingCount }`. Size-capped. (Figma) |
| `POST /events/:eventId/ratings` | user (attended only) | Rate a past event. Body: `{ score 1-5 }`. Sources displayed `avgRating`/`ratingCount`. Returns `201`. (Figma; no rating-input screen found — confirm flow, §16) |

### 4a. Agenda (Event Details screen)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /events/:eventId/agenda` | optional bearer | Ordered agenda slots `{ time, title }`. (Figma) |
| `PUT /events/:eventId/agenda` | host (owner, editable states) | Replace agenda slots. Body: `{ slots: [{ time, title }] }`. (Figma) |

## 5. Event Management (Host) & Lifecycle

BRD lifecycle: `draft → review → published → on_sale → live → completed`, plus `cancelled`/`rescheduled`. Approved events progress Published → On Sale → Live. Host cannot self-approve. Cancel ≥3 events → account flagged for review.

| Method & Path | Auth | Description |
|---|---|---|
| `POST /events` | host | Create event in `draft` (Organizer Hub step 1 + media/price/location steps). Body: `{ title, description, language, category, eventType, mode, pricingModel, startAt, endAt, venue?, address?, city, latitude?, longitude?, onlineUrl?, targetAudience?, ageRestriction?, refundPolicy?, entryRules?, maxAttendees?, coverImage?, communityId? }`. Returns `201` event. |
| `POST /events/:eventId/rehost` | host (owner) | Clone a completed event into a new `draft` (Rehost Event button on Hosted Events). Returns `201`. (Figma) |
| `GET /hosts/:hostId` | optional bearer | Public host profile (About Host → View Profile; Show on Host Profile): `{ id, name, avatarUrl, bio, eventsHostedCount, avgRating, communities[] }`. (Figma) |
| `GET /hosts/me/events` | host | Host's own events, all statuses. Query `status, page, limit`. |
| `PATCH /events/:eventId` | host (owner, draft/reschedulable only) | Edit draft event fields. Errors: `EVENT_NOT_EDITABLE` (409) otherwise. |
| `POST /events/:eventId/submit-review` | host (owner) | Submit draft → `review`. Returns updated status. |
| `POST /events/:eventId/cancel` | host (owner) | Cancel event (permission-gated). Body: `{ reason }`. Triggers holder notifications + eligible refunds (§12, §8). Contributes to the ≥3-cancellation flag (§13). |
| `POST /events/:eventId/reschedule` | host (owner) | Reschedule. Body: `{ newStartAt, newEndAt }`. Status → `rescheduled`; notifies holders with refund options (§12). |
| `POST /events/:eventId/team` | host (owner) | Add team/staff member with scoped permissions. Body: `{ userId, permissions: ["manage_event"\|"scan_tickets"] }`. Returns `201`. |
| `GET /events/:eventId/team` | host (owner), staff (own event) | List team assignments. |
| `PATCH /events/:eventId/team/:memberId` | host (owner) | Change per-event permissions. |
| `DELETE /events/:eventId/team/:memberId` | host (owner) | Remove assignment. Staff token for that event stops working (`FORBIDDEN`, 403). |
| `GET /events/:eventId/checkins` | host (owner), staff (`scan_tickets`) | Attendee/check-in monitoring list. Query `status=checked_in|pending, page, limit`. |

Event-team tokens carry only the assigned event's permissions (BR-016); a `scan_tickets`-only member calling manage endpoints gets `FORBIDDEN`.

### 4b. Discovery field reference (per API)

**`GET /events`** — Query (all O except pagination defaults):

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| search | string | O | 1–100 |
| city | string | O | 1–100 |
| category | string | O | from `GET /meta/categories` |
| mode | enum | O | `online\|offline` |
| eventType | enum | O | `public\|private\|invite_only` |
| pricingModel | enum | O | `free\|paid\|vip\|hybrid` |
| dateFrom / dateTo | datetime | O | filter window |
| priceMin / priceMax | int | O | paise, ≥0 |
| lat / lng | number | O | −90..90 / −180..180 |
| radiusKm | number | O | 5..100 |
| page / limit | int | O | §1a defaults |

Card item (RO): `{ id: ULID, title: string(1–150), coverImage: url, category: string, city: string, venue: string, startAt/endAt: datetime, status: event-enum, minPrice: int(paise), soldCount: int, goingCount: int, avgRating: number(0..5), isSaved: bool }`.

**`GET /events/:eventId`** — Response `200`: card fields + `{ description: string(1–4000), agenda: slot[](Agenda table), address: string, latitude/longitude: number, tiers[] (§6a), policies { refundPolicy: string(≤2000), entryRules: string(≤2000), ageRestriction: string(≤100) }, host {id,name,avatarUrl,eventsHostedCount}, community {id,name,memberCount,membershipState?}, attendedCount: int }`.

**`POST /events/:eventId/views`** — No body. Response `204` (deduped per user/day).

**`GET /events/:eventId/attendees`** — Response `200`: `{ attendees: [{ id, name, username, avatarUrl }](RO), goingCount: int(RO) }`, size-capped.

**`POST /events/:eventId/ratings`** — Request `{ score: int(1..5) M }`. Response `201`: `{ score, eventId, userId }(RO)` + updated `avgRating/ratingCount`.

**`GET /events/:eventId/agenda`** — Response `200`: `{ slots: [{ time: string(1–20), title: string(1–200) }](RO) }`.

**`PUT /events/:eventId/agenda`** — Request `{ slots: array(≤50) M }` (slot rows as above). Response `200`: saved slots.

### 5a. Event management field reference (per API)

**`POST /events`** — Request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| title | string | M | 1–150 |
| description | string | M | 1–4000 |
| language | string | O | meta, default `en-IN` |
| category | string | O | meta |
| eventType | enum | O | `public\|private\|invite_only`, default `public` |
| mode | enum | O | `online\|offline`, default `offline` |
| pricingModel | enum | O | `free\|paid\|vip\|hybrid`, default `paid` |
| startAt / endAt | datetime | M | UTC; `endAt > startAt` |
| venue / address / city | string | O* | 1–200 each (*address+city M when offline) |
| latitude / longitude | number | O | −90..90 / −180..180 |
| onlineUrl | string(url) | O | max 2048 (required when online) |
| targetAudience | string | O | 1–200 |
| ageRestriction | string | O | 1–100 |
| refundPolicy / entryRules | string | O | max 2000 each |
| maxAttendees | int | O | 1..1000000 |
| coverImage | string(url) | O | max 2048 |
| communityId | ULID | O | linked community |

Response `201`: created Event (fields §4b, `status: draft`).

**`GET /hosts/me/events`** — Query `status?: event-enum O, page, limit`. Response: Event cards (§4b).

**`PATCH /events/:eventId`** — Request: same fields as create, all O. Error `EVENT_NOT_EDITABLE` (409) outside editable states.

**`POST /events/:eventId/submit-review`** — No body. Response `200`: `{ status: "review"(RO) }`.

**`POST /events/:eventId/cancel`** — Request `{ reason: string(1–500) M }`. Triggers §12 notifications + §8 refunds; counts toward the ≥3-cancellation flag.

**`POST /events/:eventId/reschedule`** — Request `{ newStartAt: datetime M, newEndAt: datetime M }`. Response `200`: `{ status: "rescheduled"(RO) }`.

**`POST /events/:eventId/rehost`** — No body. Response `201`: cloned Event in `draft`.

**`GET /hosts/:hostId`** — Response `200`: `{ id, name, avatarUrl, bio(max 500), eventsHostedCount: int, avgRating: number, communities[] }(RO)`.

**Event team** — `POST` body `{ userId: ULID M, permissions: enum[] M ⊆ {manage_event, scan_tickets} }` → `201` + `{ eventId, status }(RO)`; `PATCH` body `{ permissions: enum[] M }`; `DELETE` → `204`; `GET` → team list. `GET /events/:eventId/checkins` → attendee/check-in monitor list (query `status?, page, limit`).

## 6. Ticket Tiers, Pricing Quote, Holds & Coupons

BRD: multiple tiers with price + capacity; availability updates on successful transactions; ticket locked for 10 min on booking initiation, released on failure/timeout; tickets non-transferable. Pricing: `Host Price → +10% Pegwin fee → Display Price → −Discount → +18% GST → Final Payable`. Fee is included in display price, never a separate line item. Open: who bears coupon discount (§16) — APIs carry `discountBearer`.

| Method & Path | Auth | Description |
|---|---|---|
| `POST /events/:eventId/tiers` | host (owner) | Create tier. Body: `{ name, price (host price, paise), capacity }`. Returns `201`. |
| `GET /events/:eventId/tiers` | public | List tiers with live availability. |
| `PATCH /tiers/:tierId` | host (owner) | Edit tier (price/capacity) before sale constraints; capacity cuts below sold count → `TIER_CAPACITY_CONFLICT` (409). |
| `DELETE /tiers/:tierId` | host (owner) | Remove tier with no completed sales; else `TIER_HAS_SALES` (409). |
| `POST /checkout/quote` | user | Server-computed price preview (Price details card; fee is a separate line in Figma despite BRD text — client decides display). Body: `{ items: [{ tierId, qty }], couponCode? }`. Returns per-item + totals `{ hostPrice, platformFee (10%), displayPrice, discount, discountBearer, taxableAmount, gst (18%), finalPayable }`. Example: 50000 → fee 5000 → display 55000 → discount 10000 → taxable 45000 → GST 8100 → payable 53100 (paise). |
| `POST /checkout/holds` | user | Lock tickets for 10 min (Book Tickets steppers allow multiple tiers). Body: `{ items: [{ tierId, qty }] }`. Returns `201 { holdId, expiresAt }`. Insufficient inventory → `INSUFFICIENT_INVENTORY` (409). Expired/uncompleted holds auto-release. |
| `GET /checkout/holds/:holdId` | user (owner) | Hold status + remaining TTL. |
| `DELETE /checkout/holds/:holdId` | user (owner) | Release hold early. Returns `204`. |
| `POST /checkout/coupons/validate` | user | Validate coupon for tier/event. Body: `{ code, tierId, qty }`. Returns `{ valid, discount, reason? }` or `COUPON_INVALID` (422). |
| `POST /admin/coupons` | super_admin | Create coupon. Body: `{ code, discountType: "flat"\|"pct", value, eventId?, tierId?, maxUses?, validFrom?, validTo?, discountBearer: "host"\|"pegwin"\|"split" }`. |
| `GET /admin/coupons` | super_admin | List coupons. |
| `PATCH /admin/coupons/:couponId` | super_admin | Update/disable coupon. |

## 7. Orders & Digital Tickets

Ticket lifecycle: `pending → confirmed → qr_generated → checked_in → completed`, plus `cancelled/refunded/expired`.

| Method & Path | Auth | Description |
|---|---|---|
| `POST /orders` | user | Checkout from a valid hold (Join event CTA). Body: `{ holdId, attendees: [{ name, phone?, email? }], couponCode?, paymentMethodId? }` (Attendee details toggle; one contact set may cover all tickets). Idempotent. Success → payment intent (or direct confirm for free tiers). Returns `201 { orderId, status: "pending", payment }`. Errors: `HOLD_EXPIRED` (410), `COUPON_INVALID` (422). |
| `GET /orders/:orderId` | user (owner), host (own event), admin | Order detail with tiers, amounts breakdown, payment + refund state. |
| `GET /orders/:orderId/tickets` | user (owner), host, staff, admin | Digital tickets `{ ticketCode, qrPayload, attendee, tierName (pass type), verified, status }`. |
| `POST /orders/:orderId/cancel` | user (owner) | Cancel own booking (Cancel Event flow). Body: `{ reason? }`. Computes eligible refund per policy, issues refund. Returns `{ status: "cancelled", refundAmount, refundId }`. (Figma) |
| `GET /orders/:orderId/receipt` | user (owner) | Cancellation/payment receipt (Download Receipt). Returns `{ receiptUrl, transactionId, amount, paymentMethod }`. (Figma) |
| `GET /tickets/:ticketCode` | user (owner), host, staff, admin | Single ticket + QR payload + check-in state. Checked-in tickets show `checkedInAt` and are never re-accepted (§9). |

### 6a. Ticketing field reference (per API)

**Tiers** — `POST /events/:eventId/tiers` request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| name | string | M | 1–80 |
| price | int | M | paise, ≥0 (host price) |
| capacity | int | M | 1..1000000 |

Tier response `201`/`200` adds: `{ soldCount: int(RO), availableCount: int(RO) }`. `PATCH /tiers/:tierId` takes the same fields, all O. `DELETE` → `204`.

**Quote + hold** — `POST /checkout/quote`, `POST /checkout/holds` request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| items | array | M | 1–10 lines |
| tierId | ULID | M | per line |
| qty | int | M | 1..10, per line |
| couponCode | string | O | 1–50, uppercased |

Quote response `200` (all paise ints, RO): per-item `{ tierId, qty, hostPrice, platformFee, displayPrice }` + totals `{ hostPrice, platformFee, displayPrice, discount, discountBearer: enum(host\|pegwin\|split), taxableAmount, gst, finalPayable }`. Hold response `201`: `{ holdId: ULID(RO), expiresAt: datetime(RO) }` (10-min TTL). `GET /checkout/holds/:holdId` → hold status + TTL; `DELETE` → `204` release.

**Coupons** — `POST /admin/coupons` request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| code | string | M | 1–50, `[A-Z0-9_-]` |
| discountType | enum | M | `flat\|pct` |
| value | int | M | paise if flat, 1..100 if pct |
| eventId / tierId | ULID | O | scoping, either/both |
| maxUses | int | O | ≥1 |
| validFrom / validTo | datetime | O | validity window |
| discountBearer | enum | M | `host\|pegwin\|split` |
| enabled | bool | O | default true |

`GET /admin/coupons` → list; `PATCH /admin/coupons/:couponId` → same fields, all O. `POST /checkout/coupons/validate` request `{ code: string(1–50) M, tierId: ULID M, qty: int(1..10) M }` → `{ valid: bool(RO), discount: int(paise)(RO), reason?: string(RO) }`.

### 7a. Orders & tickets field reference (per API)

**`POST /orders`** — Request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| holdId | ULID | M | valid hold |
| attendees | array | M | 1 entry per ticket |
| name | string | M | 1–100, per attendee |
| phone | string | O | E.164, per attendee |
| email | string | O | 3–254, per attendee |
| couponCode | string | O | 1–50 |
| paymentMethodId | ULID | O | saved instrument |

Response `201`: `{ orderId: ULID(RO), status: "pending"(RO), payment: {paymentId,status}(RO) }`.

**`GET /orders/:orderId`** — Response `200`: `{ id, eventId, items: [{tierId,tierName,qty,unitPrice: int(paise)}](RO), amounts: quote-totals(RO), status: enum(pending\|confirmed\|cancelled\|refunded)(RO), payment: {paymentId,status}(RO), createdAt: datetime(RO) }`.

**`POST /orders/:orderId/cancel`** — Request `{ reason?: string(1–500) O }`. Response `200`: `{ status: "cancelled"(RO), refundAmount: int(paise)(RO), refundId: ULID(RO) }`.

**`GET /orders/:orderId/receipt`** — Response `200`: `{ receiptUrl: string(url ≤2048)(RO), transactionId: string(RO), amount: int(paise)(RO), paymentMethod: string(RO) }`.

**Tickets** (`GET /orders/:orderId/tickets`, `GET /tickets/:ticketCode`, `GET /users/me/tickets?status=`) — Item (RO):

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| ticketCode | string | RO | 12, `[A-Z0-9]` |
| qrPayload | string | RO | QR content |
| attendee | object | RO | `{name,phone?,email?}` |
| tierName | string | RO | pass type, e.g. VIP |
| verified | bool | RO | payment verified badge |
| status | enum | RO | `pending\|confirmed\|qr_generated\|checked_in\|completed\|cancelled\|refunded\|expired` |
| checkedInAt | datetime | RO | set on check-in |
| event | object | RO | `{id,title,startAt,venue,address}` |

## 8. Payments & Refunds — TBD

> **Status: TBD.** Endpoints below are a draft proposal only. Undecided: final gateway(s) and routing, checkout method set, refund rules/timelines, webhook reconciliation details (see §16).

BRD baseline (pre-decision): Cashfree and Razorpay with ~50/50 traffic distribution; routing may evolve without changing customer pricing. Covers failed payments, success-with-delayed-confirmation, duplicate attempts (idempotent), refunds on cancellation/reschedule.

| Method & Path | Auth | Description |
|---|---|---|
| `POST /payments/intents` | user | Create payment intent for an order (Payment method radio: UPI / Card; wallet skipped per decision). Body: `{ orderId, method: "upi"\|"card", gateway?: "auto"\|"cashfree"\|"razorpay" }` (`auto` = server-side 50/50 routing). Returns `{ paymentId, gateway, gatewayOrderId, checkoutPayload }`. Duplicate order pay → `PAYMENT_ALREADY_EXISTS` (409) unless prior failed. |
| `GET /users/me/payments` | user | Payment history (Payments screen, View All Payments). Query `page, limit`. (Figma) |
| `GET /users/me/payment-methods` | user | Saved tokenized instruments (Visa ••••4821, Default). Server stores gateway tokens only, never PANs. (Figma) |
| `POST /users/me/payment-methods` | user | Start add-method flow. Body: `{ type: "card"\|"upi" }`. Returns gateway tokenization payload; client confirms with gateway, server stores token. (Figma) |
| `DELETE /users/me/payment-methods/:methodId` | user (owner) | Remove instrument. Returns `204`. (Figma) |
| `PATCH /users/me/payment-methods/:methodId/default` | user (owner) | Set default method. Returns `200`. (Figma) |
| `GET /users/me/billing-info` | user | Billing details. (Figma) |
| `PATCH /users/me/billing-info` | user | Update billing details. (Figma) |
| `GET /payments/:paymentId` | user (owner), host (own event), admin | Payment status: `pending/success/failed/refunded/partially_refunded`, gateway, amounts, attempts. Poll-safe for delayed confirmations. |
| `POST /webhooks/cashfree` | gateway signature | Cashfree async callbacks. Verifies signature; transitions payment/order/ticket states; duplicate deliveries deduped. Returns `200` fast. |
| `POST /webhooks/razorpay` | gateway signature | Razorpay async callbacks. Same semantics. |
| `POST /payments/:paymentId/refunds` | super_admin (event-cancel/reschedule flows may trigger server-side) | Issue full/partial refund. Body: `{ amount?, reason }`. Returns `{ refundId, status }`. Eligible refunds per policy; failures → `REFUND_FAILED` (502) with retry. |
| `GET /payments/:paymentId/refunds` | user (owner), admin | Refund status list. |

### 8a. Payments field reference (per API) — draft, TBD per §8

**`POST /payments/intents`** — Request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| orderId | ULID | M | |
| method | enum | M | `upi\|card` |
| gateway | enum | O | `auto\|cashfree\|razorpay`, default `auto` |

Response `201`: `{ paymentId: ULID(RO), gateway: enum(cashfree\|razorpay)(RO), gatewayOrderId: string(RO), checkoutPayload: object(RO, gateway-specific) }`.

**`GET /payments/:paymentId`** — Response `200`: `{ id, orderId, amount: int(paise)(RO), gateway(RO), status: enum(pending\|success\|failed\|refunded\|partially_refunded)(RO), attempts: int(RO), createdAt: datetime(RO), confirmedAt?: datetime(RO) }`.

**Webhooks** (`POST /webhooks/cashfree`, `/razorpay`) — Gateway-signed bodies (opaque); server verifies signature, dedupes, transitions states. Response `200`.

**`POST /payments/:paymentId/refunds`** — Request `{ amount?: int(paise) O (default full), reason: string(1–500) M }`. Response `201`: `{ refundId: ULID(RO), status: enum(pending\|processed\|failed)(RO) }`.

**Instruments** — `POST /users/me/payment-methods` request `{ type: enum(card\|upi) M }` → gateway tokenization payload. Stored item (RO): `{ id, type, brand?: string (Visa/Mastercard/Rupay), last4?: string(4), upiId?: string, isDefault: bool }`. Set-default / delete → `200` / `204`.

**Billing** (`GET/PATCH /users/me/billing-info`) — All O, partial update:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| fullName | string | O | 1–100 |
| address | string | O | 1–500 |
| city / state | string | O | 1–100 each |
| pincode | string | O | 6 digits |

**`GET /users/me/payments`** — Standard list; items are Payment objects above.

## 9. Payouts — TBD

> **Status: TBD.** Endpoints below are a draft proposal only. Undecided: payout flow (request-based vs admin-initiated), timing/5–7-day rule, payout-account verification, tax-field set, invoice source (see §16).

BRD baseline (pre-decision): host payouts are manual, ~5–7 days after event completion.

| Method & Path | Auth | Description |
|---|---|---|
| `GET /hosts/me/payouts` | host | Own payouts: `{ id, eventId, netAmount, discountBearerShare, status: "pending"\|"processing"\|"paid"\|"failed", eta }`. |
| `POST /hosts/me/payout-requests` | host | Request a payout of the available balance (Finance → Request). Body: `{ amount? }` (default: full available). Returns `201 { payoutId, status: "pending" }`. (Figma) |
| `GET /hosts/me/payout-schedule` | host | Payout Schedule policy (manual, ~5–7 days post-event) + next ETA. (Figma) |
| `GET /hosts/me/transactions` | host | Finance ledger (Recent Transactions: sales, refunds, fees, payouts; Event Earnings per event). Query `type, eventId, page, limit`. (Figma) |
| `GET /admin/payouts` | super_admin | All payouts. Query `status, eventId, hostId, page, limit`. |
| `POST /admin/payouts` | super_admin | Initiate manual payout. Body: `{ eventId, hostId, amount }`. Returns `201`. |
| `PATCH /admin/payouts/:payoutId` | super_admin | Update status (`processing/paid/failed`). Body: `{ status, reference? }`. Background workflow sends host notification. |

### 9a. Payout accounts, tax, invoices, verification (Verifications + Payments screens) — draft, TBD per §9

| Method & Path | Auth | Description |
|---|---|---|
| `GET /hosts/me/verification` | host | Verification status card: `{ identity: { status, name?, verifiedAt? }, payoutAccount: { status, bankName?, last4?, holder? }, hosting: { freeEvents, paidEvents, communityHosting } }`. (Figma) |
| `GET /hosts/me/payout-accounts` | host | Connected payout accounts (bank name, last4, holder, method, status). (Figma) |
| `POST /hosts/me/payout-accounts` | host | Connect account (Manage Connected Account). Body: `{ bankName, accountNumber, ifsc, holder }`. Server stores last4 only. Returns `201 { status: "pending"\|"verified" }`. (Figma) |
| `PATCH /hosts/me/payout-accounts/:accountId` | host (owner) | Update account details. (Figma) |
| `POST /hosts/me/payout-accounts/:accountId/disconnect` | host (owner) | Disconnect account (payouts pause until a new account connects). (Figma) |
| `GET /hosts/me/tax-info` | host | Tax profile (Tax Information row). (Figma) |
| `PATCH /hosts/me/tax-info` | host | Update tax profile. Field set TBD — confirm whether PAN/GSTIN capture is wanted (BRD excludes PAN verification, §16). (Figma) |
| `GET /hosts/me/invoices` | host | Invoices & Receipts list. Query `page, limit`. (Figma) |
| `GET /hosts/me/invoices/:invoiceId` | host (owner) | Invoice detail + download URL. (Figma) |

### 9b. Payout field reference (per API) — draft, TBD per §9

Payout object (RO): `{ id, eventId, hostId, netAmount: int(paise), discountBearerShare: int(paise), status: enum(pending\|processing\|paid\|failed), eta?: datetime, reference?: string(1–100) }`.

**`POST /hosts/me/payout-requests`** — Request `{ amount?: int O (default full available, >0 and ≤ available) }`. Response `201`: payout object.

**`GET /hosts/me/payout-schedule`** — Response `200`: `{ policy: string(RO), nextEta?: datetime(RO) }`.

**`GET /hosts/me/transactions`** — Query `type?: enum(sale\|refund\|fee\|payout) O, eventId?: ULID O, page, limit`. Item (RO): `{ id, type, eventId?, amount: int(signed paise), label: string, createdAt }`.

**Payout accounts** — `POST /hosts/me/payout-accounts` request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| bankName | string | M | 1–100 |
| accountNumber | string | M | 9–18 digits, write-only, never returned |
| ifsc | string | M | 11, `[A-Z]{4}0[A-Z0-9]{6}` |
| holder | string | M | 1–100 |

Stored item (RO): `{ id, bankName, last4: string(4), holder, method: "Bank Account", status: enum(pending\|verified\|failed) }`. `PATCH` takes the same fields, all O. Disconnect (`POST .../disconnect`, no body) pauses payouts until a new account connects.

**Tax info** (`GET/PATCH /hosts/me/tax-info`) — Field set TBD (§16); all O.

**Invoices** — Item (RO): `{ id, eventId?, amount: int(paise), downloadUrl: string(url ≤2048), issuedAt: datetime }`.

**Verification** (`GET /hosts/me/verification`) — Response `200` (RO): `{ identity: { status: enum(unverified\|pending\|verified\|rejected), name?, verifiedAt?: datetime }, payoutAccount: { status, bankName?, last4?, holder? }, hosting: { freeEvents, paidEvents, communityHosting } = enum(available\|blocked) }`. Admin set (`POST /admin/hosts/:hostId/verification`): `{ identity: enum M, payoutAccount: enum M, note?: string(1–500) O }`.

## 10. QR Ticket Validation (Online + Offline Sync)

BRD: staff scan QR; required ticket data downloadable for offline validation; offline scans sync on reconnect; same ticket scanned offline on two devices may double-accept pre-sync — server sync must prevent duplicates where possible; checked-in ticket never accepted again (incl. concurrent scans).

| Method & Path | Auth | Description |
|---|---|---|
| `GET /events/:eventId/validation-data` | host (owner), staff (`scan_tickets`) | Offline bundle: valid ticket codes + QR hashes + tier + attendee + event window for the caller's event. Query `?since=` for deltas. Cacheable; re-fetch before gates open. |
| `POST /checkins` | host (owner), staff (`scan_tickets`) | Online single scan. Body: `{ ticketCode, scannedAt }` (+ `Idempotency-Key`). Returns `{ status: "checked_in" }` or `ALREADY_CHECKED_IN` (409) / `TICKET_INVALID_OR_EXPIRED` (422) / `EVENT_NOT_LIVE` (409). Atomic server-side: concurrent scans of one code yield exactly one success. |
| `POST /checkins/sync` | host (owner), staff (`scan_tickets`) | Offline batch sync. Body: `{ scans: [{ ticketCode, scannedAt, deviceId }] }`. Server applies first-wins ordering; returns per-item results `{ ticketCode, result: "checked_in"\|"duplicate"\|"invalid", checkedInAt? }`. Duplicates across devices resolved here. |
| `GET /events/:eventId/checkins` | host (owner), staff | Same as §5 attendee monitor (canonical list). |

### 10a. Validation field reference (per API)

**`GET /events/:eventId/validation-data`** — Query `?since?: datetime O` (deltas). Response `200` (RO): `{ eventId, generatedAt: datetime, tickets: [{ ticketCode: string(12), qrHash: string, tierId: ULID, attendee }], eventWindow: { startAt, endAt } }`.

**`POST /checkins`** — Request `{ ticketCode: string(12) M, scannedAt: datetime M }` (+ `Idempotency-Key`). Response `200`: `{ status: "checked_in"(RO), checkedInAt: datetime(RO) }`. Errors `ALREADY_CHECKED_IN` (409), `TICKET_INVALID_OR_EXPIRED` (422), `EVENT_NOT_LIVE` (409).

**`POST /checkins/sync`** — Request `{ scans: [{ ticketCode: string(12) M, scannedAt: datetime M, deviceId: string(1–100) M }] M (≤500/batch) }`. Response `200`: `{ results: [{ ticketCode, result: enum(checked_in\|duplicate\|invalid), checkedInAt? }](RO) }`.

## 11. Communities & Group Chat

BRD: users join permitted communities/groups; host/admins manage members, publish announcements/updates/offers, send text + images/videos/files; members send text only; host/admins can remove members and messages; moderation controls; NO direct user-to-user messaging (no such API); join shows abuse-warning (returned by join response for client display).

| Method & Path | Auth | Description |
|---|---|---|
| `POST /communities` | host | Create community (multi-step: Basic Details incl. city/radius/interests + ...). Body: `{ name, description?, category?, avatarUrl?, baseType: "city_based"\|"online_only", country?, state?, city?, latitude?, longitude?, discoveryRadiusKm? (5–100), interests[] (≤5), eventId? }`. Returns `201`. (Figma fields) |
| `GET /communities` | bearer | Discover permitted communities. Query `search, eventId, category, city, lat, lng, radiusKm, page, limit`. Blocked communities are excluded for the caller. |
| `GET /communities/:communityId` | bearer | Detail (profile screens): cover, category, stats `{ members, eventsHosted, avgRating }`, top members, upcoming events, activity feed (§11i), membership state, `isMuted`, `isBlocked`. |
| `PATCH /communities/:communityId` | host (owner) | Edit community (Community Information: name, description, category, avatar). |
| `POST /communities/:communityId/groups` | host (owner) | Create group. Body: `{ name, description? }`. Returns `201`. |
| `GET /communities/:communityId/groups` | bearer | List groups. |
| `POST /groups/:groupId/join` | user, host | Join group. Returns `200 { memberId, communityWarning: "Please do not use abusive, offensive, or inappropriate language. Respect all community members." }` — client must display. Closed groups → `JOIN_REQUIRES_APPROVAL` (403) unless approved. |
| `POST /groups/:groupId/leave` | member | Leave. Returns `204`. |
| `GET /groups/:groupId/members` | member, host | Member list. Query `page, limit`. |
| `DELETE /groups/:groupId/members/:memberId` | host (owner) | Remove member. |
| `GET /groups/:groupId/messages` | member | Message history (cursor pagination: `?before=&limit=`). Includes announcements, updates, offers. |
| `POST /groups/:groupId/messages` | member (text-only) / host (+media) | Send message. Member body: `{ type: "text", text }`. Host/admin additionally: `{ type: "image"\|"video"\|"file"\|"announcement", text?, mediaUrl?, title? }` (upload via §11a). Member media attempts → `MEDIA_NOT_ALLOWED_FOR_MEMBERS` (403). Near-real-time delivery over the agreed transport. |
| `DELETE /groups/:groupId/messages/:messageId` | host (owner) | Moderate: remove inappropriate message. |
| `POST /reports` | bearer | Report community content/user. Body: `{ targetType: "message"\|"member"\|"event", targetId, reason }`. Returns `201`. Feeds §13 moderation queue. |

### 11a. Media upload (avatars, event covers, community media)

| Method & Path | Auth | Description |
|---|---|---|
| `POST /uploads` | bearer | Request upload slot. Body: `{ contentType, byteSize, purpose: "avatar"\|"event_cover"\|"community_media"\|"message_media" }`. Returns `{ uploadUrl, mediaUrl, expiresAt }`. Client PUTs bytes to `uploadUrl`, then references `mediaUrl`. Members are text-only (decision): `message_media`/`community_media`/`event_cover` are host-team-only and member attempts get `MEDIA_NOT_ALLOWED_FOR_MEMBERS` (403); `avatar` is open to any authenticated user. |

### 11b. Visibility, access & member permissions (Visibility & Access, Member Permissions screens)

Stored on the community; edited via these PATCH endpoints (all host-owner; admins when `adminsCanModerate`).

| Method & Path | Auth | Description |
|---|---|---|
| `PATCH /communities/:communityId/visibility` | host (owner) | Body: `{ visibility: "public"\|"private", showInSearch, allowRecommendations, showOnHostProfile, joinPolicy: "open"\|"approval"\|"invite_only", allowMemberInvites }`. (Figma) |
| `PATCH /communities/:communityId/member-permissions` | host (owner) | Member capability matrix: `{ canCreatePosts, canComment, canCreatePolls, canCreateEvents, canSubmitEventRequest, canCreateGroups, canInviteMembers, canViewDirectory, requireApprovalBeforePublishing, allowExternalLinks }`. Members are text-only (decision): no `canShareMedia` flag exists and member media is always rejected. Server enforces the matrix for posts/messages. (Figma) |
| `PATCH /communities/:communityId/moderation-settings` | host (owner) | Body: `{ autoSpamDetection, holdFlaggedForReview, adminsCanModerate, moderatorsCanModerate, requirePostApproval, requireMemberApproval, guidelines?, prohibitedContent[]? }` (Moderation Settings + Community Guidelines screens). (Figma) |
| `PATCH /communities/:communityId/notification-settings` | host (owner) | Host-side toggles for community/event notification categories. (Figma) |

### 11c. Community team — admins & moderators (Admin & Moderators screen)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/team` | host (owner/admin) | Team roster grouped by role with counts. (Figma) |
| `POST /communities/:communityId/team` | host (owner) | Add team member (Add Team Member; transfer screen requires Admin for ownership). Body: `{ userId, role: "admin"\|"moderator" }`. Returns `201`. (Figma) |
| `DELETE /communities/:communityId/team/:memberId` | host (owner) | Remove admin/moderator (demotes to member). (Figma) |

Roles: `owner` (full control incl. transfer/delete), `admin` (full community control), `moderator` (limited tools gated by `moderatorsCanModerate`). Role permission views on the screen are static text.

### 11d. Join requests (Join Request screen)

Active only when `joinPolicy=approval`. The join endpoint (§11) creates a `pending` request instead of membership.

| Method & Path | Auth | Description |
|---|---|---|
| `PATCH /communities/:communityId/approval-settings` | host (owner) | Body: `{ requireApproval, adminsCanApprove, showOnHostProfile }`. (Figma) |
| `GET /communities/:communityId/join-requests?status=` | host (owner/admin if allowed) | Pending (default) / decided requests. (Figma) |
| `POST /communities/:communityId/join-requests/:requestId/approve` | host (owner/admin if allowed) | Approve → membership created + notification. (Figma) |
| `POST /communities/:communityId/join-requests/:requestId/deny` | host (owner/admin if allowed) | Deny + optional note. (Figma) |

### 11e. Host report queue & actions (Reported Content, Report Details screens)

Separate from the platform `POST /reports` intake and the super-admin queue (§13): community owners moderate their own community.

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/reports?status=` | host (owner/admin/moderator) | Community reports with reporter count, content preview, reason, reporters. (Figma) |
| `GET /communities/:communityId/reports/:reportId` | host (owner/admin/moderator) | Full detail (Report Details screen). (Figma) |
| `POST /communities/:communityId/reports/:reportId/actions` | host (owner/admin/moderator) | Body: `{ action: "remove_content"\|"warn"\|"block"\|"dismiss" }`. Warn notifies the member (host warn report screen); block adds to §11f; dismiss closes. (Figma) |

### 11f. Blocked members (Blocked Members screen)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/blocked` | host (owner/admin) | Blocked list. (Figma) |
| `POST /communities/:communityId/blocked` | host (owner/admin) | Block member. Body: `{ userId }`. Removes membership + content visibility; triggers notification controls. (Figma) |
| `DELETE /communities/:communityId/blocked/:userId` | host (owner/admin) | Unblock. (Figma) |

### 11g. Ownership & deletion (Transfer Ownership, Delete dialogs)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/members?search=` | member, host | Member directory with search (powers transfer member search + View Members + Top Members). Query `search, role, page, limit`. `canViewDirectory` gates member use. (Figma) |
| `POST /communities/:communityId/transfer-ownership` | host (owner only) | Body: `{ newOwnerId }` (must be an admin). Old owner becomes admin; full control transfers. (Figma) |
| `DELETE /communities/:communityId` | host (owner only) | Delete community (confirm dialog). Removes community, posts, events links, member activity. Query `?confirm=true`. (Figma) |

### 11h. Community data & exports (Community Data screen)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/data-summary` | host (owner) | `{ members, posts, events, lastUpdatedAt }`. (Figma) |
| `POST /communities/:communityId/exports` | host (owner) | Request async export. Body: `{ type: "members"\|"content"\|"events"\|"full" }`. Returns `202 { exportId, status }`; ready file served via download URL + notification. (Figma) |
| `GET /communities/:communityId/exports` | host (owner) | Export jobs + download URLs. (Figma) |

### 11i. Community posts & announcements (Community Activity sections)

Community Activity feed with Posts/Announcements tabs (text + likes + comments). Members are text-only (decision): member posts carry text only; `mediaUrls` are accepted on host-team posts/announcements and rejected for members with `MEDIA_NOT_ALLOWED_FOR_MEMBERS` (403).

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/posts?type=` | member | Feed (`post\|announcement`), cursor pagination. Item: `{ id, author, text, mediaUrls[], likesCount, commentsCount, likedByMe, createdAt, status }`. Honors `canCreatePosts`/approval settings. (Figma) |
| `POST /communities/:communityId/posts` | member/host | Create post, text-only for members (announcements host-only). Gated by member permissions; held for approval when configured. (Figma) |
| `POST /posts/:postId/likes` | member | Like. Returns `201`. Idempotent. (Figma) |
| `DELETE /posts/:postId/likes` | member | Unlike. Returns `204`. (Figma) |
| `GET /posts/:postId/comments` | member | Comments. Cursor pagination. (Figma) |
| `POST /posts/:postId/comments` | member | Comment (gated by `canComment`). (Figma) |

### 11j. Community events link

| Method & Path | Auth | Description |
|---|---|---|
| `GET /communities/:communityId/events` | bearer | Upcoming Big Events / Upcoming Events rows. Query `upcoming_only?, page, limit`. (Figma) |

### 11k. User-side community controls (Notification Settings, Mute, Leave, Block, Report screens)

| Method & Path | Auth | Description |
|---|---|---|
| `POST /communities/:communityId/mute` | member | Mute community (no notifications, content stays). Idempotent. (Figma) |
| `DELETE /communities/:communityId/mute` | member | Unmute. Returns `204`. (Figma) |
| `POST /users/me/blocked-communities` | user | Block community (content hidden, no notifications, excluded from discovery). Body: `{ communityId }`. (Figma) |
| `GET /users/me/blocked-communities` | user | Blocked list (unblock later from settings). (Figma) |
| `DELETE /users/me/blocked-communities/:communityId` | user | Unblock. Returns `204`. (Figma) |

### 11l. Community field reference (per API)

**`POST /communities` / `PATCH /communities/:communityId`** — Request (create: `name` M, rest O; PATCH: all O):

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| name | string | M* | 1–100 (*create only) |
| description | string | O | 1–2000 |
| category | string | O | from `GET /meta/categories` |
| avatarUrl | string(url) | O | max 2048 |
| baseType | enum | O | `city_based\|online_only` |
| country / state / city | string | O | 1–100 each |
| latitude / longitude | number | O | −90..90 / −180..180 |
| discoveryRadiusKm | number | O | 5..100 |
| interests | string[] | O | ≤5, from `GET /meta/interests` |
| eventId | ULID | O | linked event |

Detail response `200` adds (RO): `{ memberCount: int, eventsHosted: int, avgRating: number, topMembers: [{id,name,avatarUrl}], membershipState: enum(none\|member\|pending\|blocked), isMuted: bool, isBlocked: bool, myRole?: enum(owner\|admin\|moderator\|member) }`. `GET /communities` query adds `category?, city?, lat?, lng?, radiusKm?(5..100), eventId?, search?, page, limit`.

**Settings PATCHes** (`visibility`, `approval-settings`, `member-permissions`, `moderation-settings`, `notification-settings`) — All fields O:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| visibility | enum | O | `public\|private` |
| showInSearch | bool | O | discovery |
| allowRecommendations | bool | O | discovery |
| showOnHostProfile | bool | O | discovery |
| joinPolicy | enum | O | `open\|approval\|invite_only` |
| allowMemberInvites | bool | O | invitations |
| requireApproval | bool | O | approval settings |
| adminsCanApprove | bool | O | approval settings |
| canCreatePosts | bool | O | member matrix |
| canComment | bool | O | member matrix |
| canCreatePolls | bool | O | member matrix |
| canCreateEvents | bool | O | member matrix |
| canSubmitEventRequest | bool | O | member matrix |
| canCreateGroups | bool | O | member matrix |
| canInviteMembers | bool | O | member matrix |
| canViewDirectory | bool | O | member matrix |
| requireApprovalBeforePublishing | bool | O | member matrix |
| allowExternalLinks | bool | O | member matrix |
| autoSpamDetection | bool | O | moderation |
| holdFlaggedForReview | bool | O | moderation |
| adminsCanModerate | bool | O | moderation |
| moderatorsCanModerate | bool | O | moderation |
| requirePostApproval | bool | O | moderation |
| requireMemberApproval | bool | O | moderation |
| guidelines | string | O | 1–4000 |
| prohibitedContent | string[] | O | ≤100, each 1–200 |
| communityActivity | bool | O | notification settings |
| communityEvents | bool | O | notification settings |

No `canShareMedia` exists — member media is always rejected (403).

**Team / ownership** — `POST .../team` request `{ userId: ULID M, role: enum(admin\|moderator) M }` → `201` entry (RO) `{ memberId, user {id,name,avatarUrl}, role }`; `DELETE` demotes → `204`; `GET` → grouped roster. `POST .../transfer-ownership` request `{ newOwnerId: ULID M (must be admin) }` → `200`. `DELETE /communities/:communityId?confirm=true M` → `204`.

**Groups / join / members** — `POST .../groups` request `{ name: string(1–100) M, description?: string(1–500) O }` → `201`. Join response `200` (RO): `{ memberId: ULID, communityWarning: string }`. Members query: `{ search?: string(1–100) O, role?: enum O, page, limit }`. Leave → `204`.

**Messages** — Member send `{ type: "text" M, text: string(1–2000) M }`; host-team may send `{ type: enum(image\|video\|file\|announcement) M, text?: string(1–2000) O, mediaUrl?: string(url ≤2048) M (non-announcement), title?: string(1–200) O }`; member non-text → 403. Item (RO, cursor feed): `{ id, groupId, author {id,name,avatarUrl}, type, text?, mediaUrl?, createdAt }`. Host delete → `204`.

**Posts** — Member create `{ text: string(1–5000) M }` (media → 403); host-team may add `{ mediaUrls?: string(url)[] O (≤4), type?: enum(post\|announcement) O }`. Item (RO, cursor feed): `{ id, author {id,name,avatarUrl}, text, mediaUrls[], likesCount: int, commentsCount: int, likedByMe: bool, status: enum(published\|held\|removed), createdAt }`. Like → `201` (idempotent); unlike → `204`. Comment `{ text: string(1–1000) M }`.

**Reports** — Intake `POST /reports`: `{ targetType: enum(message\|member\|event\|community) M, targetId: ULID M, reason: string(1–500) M }` → `201`. Community report (RO): `{ id, type: string, status: enum(open\|actioned\|dismissed), reportCount: int, preview: {kind, text?, author?}, reason: string, reporters: [{id,name,username}], createdAt }`. Action: `{ action: enum(remove_content\|warn\|block\|dismiss) M }` → `200`. Block: `{ userId: ULID M }` → `201`.

**Join requests** — Item (RO): `{ id, user {id,name,avatarUrl}, status: enum(pending\|approved\|denied), createdAt }`. Deny body `{ note?: string(1–500) O }`. Approve/deny → `200` (+ membership + notification on approve).

**Data / exports** — Summary (RO): `{ members: int, posts: int, events: int, lastUpdatedAt: datetime }`. Export request `{ type: enum(members\|content\|events\|full) M }` → `202 { exportId: ULID(RO), status: enum(queued\|ready\|failed)(RO), downloadUrl?: string(url)(RO when ready) }`.

**Uploads** — `POST /uploads` request:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| contentType | string | M | MIME allowlist: `image/jpeg\|image/png\|image/webp\|video/mp4\|application/pdf` |
| byteSize | int | M | 1..50MB |
| purpose | enum | M | `avatar\|event_cover\|community_media\|message_media` |

Response `201` (RO): `{ uploadUrl: string(url), mediaUrl: string(url), expiresAt: datetime }`. Non-avatar purposes are host-team-only.

**User controls** — mute/unmute, block/unblock: bodies `{ communityId: ULID M }` for POST block; mute/unmute/blocked-list responses are status-only (`200`/`204`) except list items `{ communityId, name, avatarUrl, blockedAt/mutedAt }(RO). `GET /communities/:communityId/events` query `{ upcoming_only?: bool O, page, limit }` → Event cards (§4b).

## 12. Notifications & Devices

BRD: in-app/push + email + SMS/phone channels; triggers include ticket purchase, event changes, cancellation, refunds, community announcements. Exact providers TBD — server selects provider; no per-provider client API.

| Method & Path | Auth | Description |
|---|---|---|
| `GET /users/me/notifications` | bearer | In-app inbox. Query `unreadOnly?, page, limit`. Items: `{ id, type, title, body, refType?, refId?, readAt, createdAt }`. |
| `PATCH /users/me/notifications/:notificationId/read` | bearer | Mark one read. Returns `200`. |
| `POST /users/me/notifications/read-all` | bearer | Mark all read. Returns `200 { marked: n }`. |
| `POST /devices` | bearer | Register push token. Body: `{ platform: "ios"\|"android", pushToken }`. Returns `201`. Idempotent per token. |
| `DELETE /devices/:deviceId` | bearer (owner) | Deregister token (logout/uninstall). Returns `204`. |
| `GET /users/me/notification-preferences` | bearer | Full preference set (Notifications screens, all roles): `{ push, email, upcomingReminders, eventUpdates, ticketUpdates, savedActivity, communityActivity, communityEvents, mentionsReplies, recommendedEvents, nearbyEvents }`. (Figma) |
| `PATCH /users/me/notification-preferences` | bearer | Update toggles (partial body). Returns updated set. (Figma) |

### 12c. Notifications, saved & analytics field reference (per API)

**Notifications** — Item (RO): `{ id, type: string, title: string(1–150), body: string(1–500), refType?: string, refId?: ULID, readAt?: datetime, createdAt: datetime }`. List query `{ unreadOnly?: bool O, page, limit }`. Read-all response `200`: `{ marked: int(RO) }`.

**Preferences** (`GET/PATCH /users/me/notification-preferences`) — All O, partial update, response returns full set:

| Field | Type | Req | Constraints / Notes |
|---|---|---|---|
| push | bool | O | master push |
| email | bool | O | master email |
| upcomingReminders | bool | O | event reminders |
| eventUpdates | bool | O | date/time/location changes |
| ticketUpdates | bool | O | bookings, cancellations, refunds |
| savedActivity | bool | O | saved-event updates |
| communityActivity | bool | O | posts/activity |
| communityEvents | bool | O | new community events |
| mentionsReplies | bool | O | mentions |
| recommendedEvents | bool | O | recommendations |
| nearbyEvents | bool | O | nearby (geo) |

**Devices** — `POST /devices` request `{ platform: enum(ios\|android) M, pushToken: string(1–500) M }` → `201` (idempotent per token). `DELETE` → `204`.

**Saved** — `GET /users/me/saved-events` query `{ when?: enum(all\|upcoming\|this_week\|this_month) O, default all, page, limit }`; entries are Event cards (§4b) + `{ savedAt: datetime(RO) }`. Save: `{ eventId: ULID M }` / `{ communityId: ULID M }` → `201` (idempotent); unsave → `204`.

**Analytics** — Query `{ scope: enum(community\|event) M, scopeId: ULID M, range?: enum(7_days\|30_days\|3_months\|12_months) O, default 30_days }`. Overview response `200` (RO): `{ members: {total: int, new: int, deltaPct: number}, eventsHosted: int, funnel: {views: int, saved: int, purchases: int, attendees: int}, audience: {newMembers: int, returningPct: number, avgEventsPerAttendee: number, topInterests: string[]}, engagement: {activePct: number, posts: int, comments: int, discussions: int}, revenue: {total: int(paise), deltaPct: number, ticketsSold: int, avgTicketValue: int(paise)}, insights: [{title: string, text: string}] }`. Top events: `[{ eventId: ULID, title: string, attendees: int, capacityPct: number, revenue: int(paise) }](RO)`.

Server-side triggers (no client call): order confirm, payment success/fail, event cancel/reschedule, refund issued, announcement posted, host warning/suspension. Email/SMS dispatched by server per user contact + preferences.

## 12a. Saved items (Saved screen: Events/Communities tabs + All/Upcoming/This Week/This Month filters)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /users/me/saved-events?when=` | user | Saved events. `when=all\|upcoming\|this_week\|this_month`. Cards as §4 + `savedAt`. (Figma) |
| `POST /users/me/saved-events` | user | Save (heart toggle). Body: `{ eventId }`. Idempotent. Returns `201`. (Figma) |
| `DELETE /users/me/saved-events/:eventId` | user | Unsave. Returns `204`. (Figma) |
| `GET /users/me/saved-communities` | user | Saved communities. (Figma) |
| `POST /users/me/saved-communities` | user | Save community. Body: `{ communityId }`. Idempotent. (Figma) |
| `DELETE /users/me/saved-communities/:communityId` | user | Unsave. Returns `204`. (Figma) |

`isSaved` on cards/detail reflects these lists. Saved counts feed the Analytics funnel (§12b).

## 12b. Host analytics (Analytics Overview, Host/Event Analytics, Hosted Events metrics)

All metrics are server-computed over `range=7_days|30_days|3_months|12_months`.

| Method & Path | Auth | Description |
|---|---|---|
| `GET /hosts/me/analytics/overview?scope=&range=` | host | Performance Overview + Conversion funnel (views → saved/interested → purchases → attendees) + audience + engagement + revenue snapshot + insights list. `scope=community&scopeId=` or `scope=event&scopeId=` (selector header). (Figma) |
| `GET /hosts/me/analytics/top-events?range=` | host | Top Performing Events rows (attendees, capacity %, revenue). (Figma) |
| `GET /events/:eventId/analytics?range=` | host (owner) | Per-event analytics (Host Event Analytics screen; Analytics button on Hosted Events). (Figma) |

Insights ("Community Growth", "Event Performance", "Audience Timing") are server-generated strings from the same metrics; no separate endpoint.

## 13. Super Admin, Moderation & Audit

BRD: approve/reject events; suspend/remove events; review flagged hosts (≥3 cancellations); warn/suspend/remove hosts for fraud/fake events/misuse/payment issues; platform controls; business audit records for approval/rejection, cancellation, suspension/removal, payments/refunds, payouts, check-ins, moderation, permission changes.

| Method & Path | Auth | Description |
|---|---|---|
| `GET /admin/events/review-queue` | super_admin | Events in `review`. Query `page, limit`. |
| `POST /admin/events/:eventId/approve` | super_admin | Approve → `published` (then on-sale/live progression). Body: `{ note? }`. Host self-approval impossible (no host route exists). |
| `POST /admin/events/:eventId/reject` | super_admin | Reject. Body: `{ reason }`. |
| `POST /admin/events/:eventId/suspend` | super_admin | Suspend live/on-sale event. Body: `{ reason }`. |
| `POST /admin/events/:eventId/remove` | super_admin | Remove for policy violation. Body: `{ reason }`. |
| `GET /admin/hosts/flagged` | super_admin | Hosts with ≥3 cancelled events + violation history. |
| `POST /admin/hosts/:hostId/verification` | super_admin | Set host verification (sources Verifications screen badges). Body: `{ identity: "verified"\|"rejected", payoutAccount: "verified"\|"rejected", note? }`. (Figma; verification intake flow itself is TBD, §16) |
| `POST /admin/hosts/:hostId/warn` | super_admin | Warn host. Body: `{ reason }`. Notifies host. |
| `POST /admin/hosts/:hostId/suspend` | super_admin | Suspend host (warning first unless serious fraud/safety case). Body: `{ reason }`. |
| `POST /admin/hosts/:hostId/remove` | super_admin | Permanent removal. Body: `{ reason }`. |
| `GET /admin/reports` | super_admin | Moderation queue from `POST /reports`. Query `status, page, limit`. |
| `PATCH /admin/reports/:reportId` | super_admin | Resolve. Body: `{ status: "actioned"\|"dismissed", actionNote? }`. |
| `GET /admin/audit-logs` | super_admin | Business audit records. Query `action, actorId, entityType, entityId, from, to, page, limit`. Covers every action in the BRD audit list. |

## 13a. Support, help articles & content pages (Help & Support, Chat with Support, policy screens)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /support/topics` | bearer | Chat topic chips (Event & Tickets, Payments & Refunds, Account & Profile, Community Issues, Something Else). (Figma) |
| `GET /support/conversations` | bearer | Own support threads. (Figma) |
| `POST /support/conversations` | bearer | Open thread. Body: `{ topic }`. Returns `201`. (Figma) |
| `GET /support/conversations/:conversationId/messages` | bearer (owner) | Thread messages (cursor pagination). (Figma) |
| `POST /support/conversations/:conversationId/messages` | bearer (owner) | Send message. Body: `{ text }`. (Figma) |
| `GET /help/articles?search=&category=` | optional bearer | Help article search/list (Refunds & Cancellations, Events, Safety & Guidelines). (Figma) |
| `GET /help/articles/:articleId` | optional bearer | Article body. (Figma) |
| `GET /content/:slug` | optional bearer | Static policy/guideline pages: `refund-policy`, `privacy-policy`, `safety-guidelines`, `child-safety`, `moderation-guidelines` (host Contact/Help screens link these). (Figma) |

Email Support (`support@pegwin.circle`) is a `mailto:` link — no API.

## 13b. Meta / reference data (dropdowns and chips across create/edit/discovery screens)

| Method & Path | Auth | Description |
|---|---|---|
| `GET /meta/categories` | optional bearer | Event + community categories (Music, Fitness, Tech, Travel, Design, …). (Figma) |
| `GET /meta/interests` | optional bearer | Interest chips (≤5 selectable for profiles/communities). (Figma) |
| `GET /meta/languages` | optional bearer | Primary Language + app locale options (host language screen). (Figma) |
| `GET /meta/cities?state=` | optional bearer | Country/State/City pickers + Select City. (Figma) |

### 13c. Admin, support & meta field reference (per API)

**Event moderation** — Approve body `{ note?: string(1–500) O }`; reject/suspend/remove body `{ reason: string(1–500) M }`. Review queue query `{ page, limit }`.

**Host moderation** — Warn/suspend/remove body `{ reason: string(1–500) M }` (warning first unless serious fraud/safety case). Verification set: `{ identity: enum(unverified\|pending\|verified\|rejected) M, payoutAccount: enum M, note?: string(1–500) O }`. Flagged query `{ page, limit }`.

**Reports** — Admin queue query `{ status?: enum(open\|actioned\|dismissed) O, page, limit }`. Resolve `{ status: enum(actioned\|dismissed) M, actionNote?: string(1–500) O }`.

**Audit logs** — Query `{ action?: string O, actorId?: ULID O, entityType?: string O, entityId?: ULID O, from?: datetime O, to?: datetime O, page, limit }`. Entry (RO): `{ id, action: string, actorId: ULID, entityType: string, entityId: ULID, createdAt: datetime }`.

**Support** — Topics (RO): `string[]`. Open thread `{ topic: string(1–100) M }` → `201` conversation (RO) `{ id, topic, status: enum(open\|closed), updatedAt }`. Message `{ text: string(1–2000) M }` → `201`. History is a cursor feed (§1a).

**Help & content** — Articles query `{ search?: string(1–100) O, category?: string O }`. Article (RO): `{ id, title: string, category: string, body: string, updatedAt }`. Content page (RO): `{ slug: string, title: string, body: string, updatedAt }`; slugs `refund-policy|privacy-policy|safety-guidelines|child-safety|moderation-guidelines`.

**Meta** — Lists (RO): `string[]` (categories, interests, languages as BCP-47, cities). Cities query `{ state?: string(1–100) O }`.

## 14. Error Catalog (codes) & Status Map

`400` `VALIDATION_ERROR`, `HOLD_EXPIRED` is `410`. `401` `UNAUTHENTICATED`. `403`: `FORBIDDEN`, `ACCOUNT_DELETED_OR_SUSPENDED`, `JOIN_REQUIRES_APPROVAL`, `MEDIA_NOT_ALLOWED_FOR_MEMBERS`. `404`: `EVENT_NOT_FOUND`, `NOT_FOUND`. `409`: `ALREADY_CHECKED_IN`, `EVENT_NOT_EDITABLE`, `EVENT_NOT_LIVE`, `INSUFFICIENT_INVENTORY`, `PAYMENT_ALREADY_EXISTS`, `TIER_CAPACITY_CONFLICT`, `TIER_HAS_SALES`. `422`: `COUPON_INVALID`, `TICKET_INVALID_OR_EXPIRED`. `429`: `OTP_COOLDOWN`, `RATE_LIMITED`. `410`: `INVALID_OR_EXPIRED_OTP`, `HOLD_EXPIRED`. `502`: `REFUND_FAILED`, `GATEWAY_ERROR` (retry-safe; webhooks reconcile). User-facing messages must include recovery guidance per BRD §14.

## 15. Explicitly Excluded (no endpoints in MVP)

No APIs for: wallet in any form (skipped per decision), ticket transfer, 1:1 direct messaging (support threads in §13a are user↔support-team, not user↔user), member media sending (members text-only per decision; attempts get `MEDIA_NOT_ALLOWED_FOR_MEMBERS`), desktop host portal. Map-tile rendering/navigation stays client-side; server handles coordinates only. If any excluded item is needed, add a versioned section rather than overloading MVP paths.

## 16. Open Questions (need client decision)

Decided: wallet skipped, members text-only, Figma maps adopted (coordinates + radius/city search in scope, tiles client-side).

Parked as TBD: §8 Payments (gateway finalization, method set, refund rules, webhook reconciliation) and §9 Payouts (flow, timing, account verification, tax fields, invoices). Endpoint tables there are draft proposals only.

1. Coupon discount bearer (Pegwin or Host?): open in BRD; `discountBearer` carried end-to-end so either decision needs no API change.
2. Rating source: ratings display (4.8/4.9) but no rating-input screen found; `POST /events/:eventId/ratings` assumes post-attendance rating — confirm flow.
3. Member event creation (`canCreateEvents`, `canSubmitEventRequest`, "User Hosted Events" for non-hosts): no member→host upgrade/approval flow found — confirm whether members can publish or only propose (proposed: reuse `POST /events` with `communityId`, held in `draft` until host submits).
4. Verification intake: Verifications screen shows verified identity + payout account, but no ID-capture/verification-request screens found; admin can only set status (§13). Confirm intake flow (or admin-only onboarding).
5. Tax profile fields: confirm whether PAN/GSTIN capture is wanted (BRD excludes PAN verification).
6. Refund policy specifics (user-cancel eligibility/timelines) beyond `POST /orders/:orderId/cancel` — confirm rules.
7. Push/email/SMS providers, supported OS versions, performance/availability targets remain TBD — no API impact.

## 17. Traceability (figma/ flows → spec)

Flow diagrams (`*flow.png`, `onboarding process`) carry no API surface and are excluded below. The `user profile/` folder duplicates `user flow profile community/` pixel-for-pixel and is excluded. `-1`/`-2` suffixed files are near-duplicate variants covered by the same endpoints.

- onboarding/: Splash/Sign In/Sign Up/OTP/verified → §2; Forget/New Password/password updated → §2 password reset.
- user app flow/: Home/Explore → §4; Saved → §12a; Communities → §11; community profile → §11 + §11i/§11j; community settings → §11k; chat section → §11 messages; notifications → §12; user Profile → §3; Edit user Profile → §3 + `POST /uploads`; event/music → §4 detail.
- user book and cancel event/: Event Details → §4 + §4a + §5 host card + §11 community card; Book Tickets → §6 + §7 + §8 intents; Ticket confirm details → §7; payment checkout → §8 + webhooks; Event ticket → §7 tickets; Cancel screens + receipt → §7 cancel + receipt + §8 refunds.
- user flow profile community/: profile/attended/joined/hosted/past → §3 `GET /users/me/events`; notification/mute → §12 prefs + §11k mute; block/leave/delete/report community → §11k + §11 reports intake; privacy/account → §3; payment → §8 methods/billing/history; help/support/chat → §13a; policies → §13a content.
- host flow and create event flow/: dashboard/live/upcoming/drafts/lists → §5 + §12b; upcoming/hosts details → §5 + §9 payouts link; Create Event*/media/price/location → §5 + §4a + §6 tiers + `POST /uploads`; welcome/reminder popups → none; Host Communities → §11; Host chats/chat section → §11 messages; qr scanner + live-card QR Check-in → §10; finance → §9 + §9a; Host ID Verified → §9a verification; Analytics Overview/Event Analytics → §12b + §4 views.
- host communities setting flow/: settings hub + info/visibility/join/approval → §11b + §11d; Admin & Moderators → §11c; Member Permissions → §11b matrix; Moderation Settings/guidelines → §11b; reports/warn/dismiss/remove/block/blocked → §11e + §11f; transfer ownership → §11g; delete → §11g; Community Data → §11h; community notification → §12 prefs; profiles → §11 + §11i/§11j.
- host profile/: profile/edit/account/privacy/language → §3 + `GET /meta/languages`; notifications → §12; payment account/details → §9a; help/contact/chat → §13a; policies → §13a content; finance rows → §9.
