# Pilbridge API

NestJS 12 · PostgreSQL · Prisma 7 · TypeScript (ES modules)

The backend for the Pilbridge platform: phone sign-in, catalogue, pharmacy inventory, orders and pharmacist prescription review, delivery, pharmacy onboarding and compliance, stock transfers between pharmacies and pharmacy settlements — with an audit trail on every regulated action.

## Getting started

Requires Node 22+ and PostgreSQL 16 running locally.

```bash
cd backend
npm install                 # also generates the Prisma client
cp .env.example .env        # then set DATABASE_URL and JWT_SECRET
createdb pilbridge
npm run db:migrate          # apply migrations
npm run db:seed             # sample catalogue, 3 pharmacies, staff accounts
npm run start:dev           # http://localhost:4000/v1 · API docs at http://localhost:4000/docs
```

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | Run with reload on change |
| `npm run build` / `npm run start:prod` | Compile to `dist/` and run it |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests against `pilbridge_test` (see `.env.test`) — never against the dev database |
| `npm run db:migrate` | Create/apply a migration after editing `prisma/schema.prisma` |
| `npm run db:seed` | Re-seed sample data (safe to re-run) |
| `npm run db:studio` | Browse the database |
| `npm run lint` | Lint with oxlint |

## Seeded accounts

Sign in with OTP — in development (`NODE_ENV=development` and `OTP_DEV_ECHO=true`) the code is returned as `devCode` and logged, not sent by SMS. Pharmacists and the admin then set up an authenticator app at their first sign-in (Google Authenticator, Microsoft Authenticator…) and enter its code each time after that.

| Phone | Role | Pharmacy |
|---|---|---|
| 0803 000 0001 | Pharmacist (Adaeze Okafor) | Oakfield Pharmacy |
| 0803 000 0002 | Pharmacy staff (Sola Lawal) | Oakfield Pharmacy |
| 0803 000 0003 | Pharmacist (Tunde Bakare) | Unity Pharmacy |
| 0803 000 0009 | Platform admin | — |

Any other Nigerian mobile number signs up as a new patient.

## Endpoints (all under `/v1`)

| Area | Endpoints | Who |
|---|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/social`, `POST /auth/mfa/setup`, `POST /auth/mfa/verify` | Public |
| Sessions | `POST /auth/logout`, `POST /auth/logout-all`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/mfa/recovery-codes` | Signed in |
| Profile | `GET /me`, `PATCH /me` (name + consent), `POST /me/phone` (patients) | Signed in |
| Admin · accounts | `GET /admin/users?q=&role=`, `POST …/:id/disable`, `…/:id/enable`, `…/:id/sessions/revoke`, `…/:id/mfa/reset`, `PUT …/:id/phone` | Platform admin |
| Catalogue | `GET /products?q=&category=`, `GET /products/:slug`, `GET /pharmacies` | Public |
| Prescriptions | `POST /prescriptions` (multipart `image`), `GET /prescriptions` | Patient |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:code`, `POST /orders/:code/cancel` | Patient |
| Pharmacy orders | `GET /pharmacy/orders`, `POST /pharmacy/orders/:code/status` | Pharmacy staff |
| Pharmacy prescriptions | `GET /pharmacy/prescriptions`, `GET …/:code/image`, `POST …/:code/review` | List: staff · image & review: pharmacist |
| Inventory | `GET /pharmacy/inventory`, `POST …/batches`, `…/:id/adjust`, `…/:id/quarantine`, `…/:id/release` | Staff · release: pharmacist |
| Transfers | `GET /pharmacy/transfers`, `POST /pharmacy/transfers`, `POST …/:code/publish`, `…/accept`, `…/decline`, `…/dispatch`, `…/receive`, `…/cancel` | Staff · publish, accept, decline, receive: pharmacist |
| Compliance | `GET /pharmacy/compliance`, `POST /pharmacy/compliance/documents` (multipart `file`), `GET …/documents/:id/file` | Pharmacy staff |
| Settlements | `GET /pharmacy/settlements`, `GET /pharmacy/settlements/:code` (`unsettled` for orders not in a payout) | Pharmacist |
| Portal | `GET/PATCH /pharmacy/settings`, `PUT /pharmacy/settings/bank`, `GET /pharmacy/team`, `GET /pharmacy/activity`, `GET /pharmacy/notifications`, `POST /pharmacy/notifications/read` | Staff · changes: pharmacist |
| Partner applications | `POST /partners/applications` (rate-limited) | Public |
| Admin · onboarding | `POST /admin/pharmacies`, `GET/PATCH /admin/pharmacies/:id`, `POST …/:id/verify`, `…/:id/suspend`, `…/:id/bank/verify`, `GET/POST …/:id/staff`, `DELETE …/:id/staff/:userId`, `GET /admin/applications`, `POST /admin/applications/:id/review` | Platform admin |
| Admin · compliance | `GET /admin/compliance/documents`, `GET …/:id/file`, `POST …/:id/review`, `POST /admin/compliance/check` | Platform admin |
| Admin · payouts | `GET /admin/payouts`, `GET /admin/payouts/preview?before=`, `POST /admin/payouts`, `POST …/:id/paid`, `POST …/:id/void` | Platform admin |
| Admin · other | riders, couriers, pharmacy locations and phones, delivery eligibility, deliveries, incidents, reports, courier invoices, `GET /admin/transfers` | Platform admin |
| Health | `GET /health` | Public |

Full request/response schemas are in the interactive docs at `/docs`.

## Rules the API enforces

- **Controlled medicines** are never listed, ordered or stocked.
- **Prescription-only items** need an uploaded prescription; the order waits in `PHARMACIST_REVIEW` until a **pharmacist** (not counter staff) approves it with all three professional checks.
- **Stock is allocated first-expiry-first-out** when an order moves to `PREPARING`, splitting across batches if needed; cancelling a prepared order returns the stock.
- **Order status** can only move forward along the dispensing workflow; staff can't skip review.
- **Pharmacies only see their own** orders, prescriptions and stock.
- **Quarantined stock** returns to sale only after a pharmacist confirms a quality assessment; expired batches can't be received or released.
- **Uploads** are checked by file content, not the claimed type; prescription images are pharmacist-only and every view is audited.
- **OTP codes** are stored as HMACs, expire in 5 minutes, allow 5 attempts, and are rate-limited per number and per IP.
- **Sessions are server-side**: every access token names a session, checked on every request, so signing out (one device, every device, or by an admin) works at once. Staff and admin sessions last 12 hours (`STAFF_SESSION_TTL`), others 7 days (`JWT_TTL`). Disabled accounts can't sign in or use any session.
- **Admins and pharmacists confirm every sign-in with an authenticator app** (`MFA_REQUIRED_ROLES`): secrets encrypted with `MFA_ENCRYPTION_KEY`, each code works once, five wrong codes lock the step for 15 minutes, and ten one-time recovery codes are issued at set-up (using one texts the owner). An admin can reset someone else's authenticator after confirming who they are.
- **Phone numbers**: patients change their own only within 10 minutes of signing in; the old number is texted and every other session is signed out. Staff, rider and admin numbers are changed only by an admin (both numbers texted). A Google/Apple account is never merged into a staff, rider or admin account.
- **Development shortcuts fail closed**: anything other than `NODE_ENV=development` or `test` (including no `NODE_ENV`) is production — `OTP_DEV_ECHO` and `THROTTLE_DISABLED` are refused, and Termii, Flutterwave and `MFA_ENCRYPTION_KEY` are required. API docs only show locally or with `DOCS_ENABLED=true`.
- **Money** is stored in kobo (integers).
- **New pharmacies** start pending and aren't listed or sold from until an admin verifies them, which needs an in-date premises licence, at least one pharmacist on the account and a note of what was checked. A live pharmacy can't lose its last pharmacist.
- **Licences are enforced**: a pharmacy whose premises licence expires is suspended automatically (it leaves the catalogue, quotes and checkout), and pharmacists are texted 60, 30 and 7 days before their licence or a verified certificate expires (`COMPLIANCE_CHECK_MS`, default hourly).
- **Transfers** need a pharmacist's approval at both ends. Stock is reserved out of the sending batch when the receiver accepts, and goes back if it's cancelled. Controlled, cold-chain, recalled, quarantined, expired or nearly expired (under 30 days) stock can't be transferred; stock that went on hold while in transit is checked in to quarantine.
- **Settlements**: each delivered, paid order is settled once (goods subtotal less a 7% commission — `PHARMACY_COMMISSION_BPS` in `src/common/fees.ts`, placeholder until finance confirms). A payout can only be marked paid to a verified bank account that hasn't changed in the last 48 hours; every bank change texts the pharmacy's pharmacists and the admins.
- **Delivery areas**: a pharmacy that lists the areas it covers isn't offered, quoted or ordered from outside them (no areas listed = every area).
- **Compliance documents** are checked by file content, stored apart from prescriptions, and only served to the pharmacy's own staff and admins; every view is audited.

## Recovering a locked-out admin

An admin who loses their phone *and* their recovery codes is recovered by another admin under **Admin › Accounts & security › Reset authenticator**. If no other admin can sign in, run this on a server that has the production environment — access to that server is the proof of identity:

```bash
npm run admin:recover -- --phone "0803 000 0009" --reason "Lost phone and codes; identity confirmed in person by …"
#   --enable   also re-enable the account if it was disabled
#   --force    run even though another admin could do it from the admin page
#   --yes      skip typing the number again (for scripted use)
```

It clears their authenticator (they set it up again at next sign-in), signs them out everywhere, texts them, and writes an audit entry recording the server user who ran it. It only works on platform admin accounts. In development, use `npm run admin:recover:dev -- …` (runs from source).

## Not done yet

- SMS delivery is wired to Termii but needs a live account: set `TERMII_*` in `.env`, register the sender ID and ask Termii to activate the DND route.
- S3-compatible encrypted storage for prescription images (local disk in development).
- Automatic refunds: cancelled paid orders are marked `REFUND_DUE` but refunded by hand on the Flutterwave dashboard.
- Delivery, Stage 2 follow-ups with Chowdeck at onboarding: the live base URL, the `item_type` for pharmacy parcels, whether Relay deliveries send webhooks (status is also polled every minute), and how to pass our own 4-digit delivery PIN. Adding a second courier API means another adapter in `src/delivery/couriers/`.
- Delivery, still to do: live GPS tracking; rider payouts (Pilbridge riders' cost isn't in the reports until then); charging customers for failed attempts they caused (the cause and cost bearer are recorded — `src/reports/cost.ts`); tuning `src/delivery/eta.ts` from the reports' real times.
- Hospitals as customers (the `/hospitals` page takes applications, but there's no hospital account or ordering yet).
- Transfer pricing and payment between pharmacies (transfers move stock; any money between the two pharmacies is settled outside Pilbridge), and cold-chain transfers (blocked until a cold-chain logistics partner is set up).
- Settlement adjustments: failed-delivery costs borne by the pharmacy (recorded per attempt) aren't deducted from payouts yet, and payouts are paid by hand (no bank-transfer API).
- Delivery hours are stored and shown but not enforced at checkout.
- Pharmacists can't add their own team members yet — admins add and remove staff.
