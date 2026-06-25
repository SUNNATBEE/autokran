# CLAUDE.md — Backend (AUTOKRAN.UZ API)

Project context for Claude Code / any agent working in this repo. Read this
**first**, then [`WORKFLOW.md`](./WORKFLOW.md) and [`RAILWAY.md`](./RAILWAY.md).

---

## 1. What this is

REST API for **AUTOKRAN.UZ** — a crane-rental (avtokran ijara) marketing site
for Uzbekistan. This repo is the **backend only**. Express + TypeScript, data in
MongoDB via Prisma. It serves public lead forms (order / contact, with Telegram
notifications) and a role-based admin panel API.

### Two-repo architecture (CRITICAL)

| Part         | Repo                                            | Folder      | Host    |
| ------------ | ----------------------------------------------- | ----------- | ------- |
| **Backend**  | https://github.com/SUNNATBEE/autokran (this)    | `backend/`  | Railway |
| **Frontend** | https://github.com/SUNNATBEE/autokranFrontend   | `frontend/` | Vercel  |

> **Push rule:** backend changes → `autokran` (this repo); frontend changes →
> `autokranFrontend`. Never mix. The two folders sit side by side locally but are
> independent git repos with separate remotes.

---

## 2. Status

- ✅ Deployed on **Railway**, healthcheck (`/health`) passing.
- ✅ **MongoDB Atlas** connected (`crane_rental` db), schema synced.
- The frontend proxies `/api/*` and `/uploads/*` here via its `BACKEND_URL`.

---

## 3. Tech stack

- Node ≥ 20, Express 4, TypeScript 5 (compiled to `dist/` with `tsc`).
- **Prisma 6 + MongoDB** (`@db.ObjectId` ids). No SQL migrations — schema is
  synced with `prisma db push`.
- `jsonwebtoken` (admin JWT), `cookie-parser`, `cors`, `multer` (uploads).
- Telegram Bot API for lead notifications.

---

## 4. File map

```
src/
  server.ts                 # app bootstrap: CORS, security headers, routes, error handler, graceful shutdown
  lib/
    prisma.ts               # PrismaClient singleton
    admin-auth.ts           # JWT sign/verify, env-based accounts, constant-time compare
    admin-auth-config.ts    # AdminRole, route-access rules  (MIRRORED in frontend repo)
    orders-store.ts         # rental orders: Prisma when DATABASE_URL set, else JSON file fallback
    contacts-store.ts       # contact requests: same dual store
    telegram.ts             # HTML-escaped Telegram send (timeout, fail-soft)
    validate.ts             # input validation/sanitisation for public forms
  middleware/
    auth.ts                 # requireRole(), getAdminFromRequest()
    rateLimit.ts            # in-memory IP rate limiter (no dep)
  routes/
    contacts.ts             # POST /api/contacts        (public, rate-limited)
    sendTelegram.ts         # POST /api/send-telegram   (public, rate-limited)
    siteSettings.ts         # GET  /api/site-settings   (public)
    admin.ts                # /api/admin/*              (auth, role-based)
prisma/schema.prisma        # MongoDB models
railway.json                # Railway build/start/healthcheck config
```

---

## 5. Data model & storage

- Database: **Prisma + MongoDB** (Atlas replica set required by Prisma).
- Models: `Admin`, `Sponsor`, `Crane`, `GlobalSettings`, `RentalOrder`,
  `ContactRequest` — all with `id String @id @default(auto()) @map("_id") @db.ObjectId`.
- **Schema changes:** edit `prisma/schema.prisma` → run `npm run prisma:push`
  (`prisma db push`). There are **no migration files**; do not run `migrate`.
- **File fallback:** orders & contacts fall back to `data/*.json` when
  `DATABASE_URL` is empty (dev convenience). Cranes / sponsors / settings are
  Prisma-only (need the DB). `data/*.json` is git-ignored.

---

## 6. Auth

- Accounts come from the **`ADMIN_ACCOUNTS`** env var (JSON array). Required in
  production; a placeholder dev fallback (`admin` / `manager`, password
  `devpassword`) is used only when unset and not in production.
- Roles: `super_admin` (full), `order_manager` (orders + contacts only). Route
  access rules live in `admin-auth-config.ts`.
- A JWT is signed (`JWT_SECRET`) and stored in the `admin_token` httpOnly cookie.
  The frontend's `src/proxy.ts` verifies the same token, so **`JWT_SECRET` must
  be identical on both apps.**
- `authenticateAdmin` uses constant-time comparison.

---

## 7. API endpoints

Public:
- `POST /api/contacts` — `{ name, phone }` → save + Telegram. Rate-limited 5/min.
- `POST /api/send-telegram` — `{ name, phone, location, craneModel? }` → save +
  Telegram. Rate-limited 5/min.
- `GET /api/site-settings` — public contact/SEO settings.
- `GET /health` — healthcheck.

Admin (cookie auth, role-gated):
- `POST /api/admin/auth` (login, rate-limited 10/15min), `GET /api/admin/me`,
  `POST /api/admin/logout`
- `/api/admin/{cranes,sponsors,orders,contacts,settings,upload}`

Uploads served from `/uploads/*`.

---

## 8. Security (already hardened)

- Rate limiting on all public + login endpoints (`middleware/rateLimit.ts`).
- Input validation & sanitisation (`lib/validate.ts`); Telegram messages are
  HTML-escaped (no Markdown injection).
- Upload filter: image mime types only, 5 MB max, sanitised filenames.
- Security headers in `server.ts` (nosniff, frame DENY, Referrer-Policy,
  Permissions-Policy, HSTS in prod). JSON body limit 100 kb.
- Constant-time password compare; **app refuses to start in production** if
  `JWT_SECRET` or `ADMIN_ACCOUNTS` is missing/placeholder.
- No secrets in source. `.env` and `data/*.json` are git-ignored.

> History note: an early commit once contained real admin passwords; `main` was
> force-pushed to clean history. Do **not** reuse `Otash0987654321` / `23042012`.

---

## 9. Environment variables

| Variable             | Required (prod) | Notes                                              |
| -------------------- | --------------- | -------------------------------------------------- |
| `NODE_ENV`           | yes             | `production`                                       |
| `JWT_SECRET`         | yes             | strong; **must match the frontend**                |
| `ADMIN_ACCOUNTS`     | yes             | JSON array `[{username,password,role,displayName}]`|
| `DATABASE_URL`       | yes             | MongoDB Atlas `mongodb+srv://…/crane_rental?…`     |
| `CORS_ORIGIN`        | yes             | frontend origin(s), comma-separated                |
| `TELEGRAM_BOT_TOKEN` | for notifs      | bot token                                          |
| `TELEGRAM_CHAT_ID`   | for notifs      | chat id                                            |
| `PORT`               | no              | injected by Railway — never set manually           |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

---

## 10. Local development

```bash
npm install
cp .env.example .env     # fill values (use Atlas DATABASE_URL for full features)
npm run prisma:push      # sync schema to MongoDB (if DATABASE_URL set)
npm run dev              # tsx watch → http://localhost:4000
```

Scripts: `dev` (tsx watch), `build` (`prisma generate && tsc`), `start`
(`node dist/server.js`), `start:prod` (`prisma db push` + start),
`prisma:push`, `prisma:generate`.

---

## 11. Deployment (Railway) — and a key gotcha

- `railway.json`: Nixpacks build `npm run build`, start `npm run start:prod`,
  healthcheck `/health`. Repo root **is** the backend → Railway Root Directory `/`.
- **GOTCHA (already fixed):** with `NODE_ENV=production`, `npm ci` skips
  `devDependencies`. The `tsc` build needs `@types/*` + `typescript`, and
  `start:prod` needs the `prisma` CLI. These are therefore kept in
  **`dependencies`** (not devDependencies). Only `tsx` stays dev-only. **Do not
  move them back to devDependencies** or the Railway build breaks.
- MongoDB Atlas **Network Access** must allow `0.0.0.0/0` (Railway egress IPs are
  dynamic) — permanent, not a temporary entry.

Full guide: [`RAILWAY.md`](./RAILWAY.md).

---

## 12. Cross-repo contract (keep in sync with the frontend)

- **`JWT_SECRET`** — identical value on both apps.
- **`admin-auth-config.ts`** — exists in both repos; change here → mirror there.
- **API shapes** of `/api/*` — change here → update the frontend caller.
- Frontend **`BACKEND_URL`** points at this service's public URL; this backend's
  **`CORS_ORIGIN`** lists the frontend origin.
