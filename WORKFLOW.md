# Project workflow & repo map (READ FIRST)

This product ("AUTOKRAN.UZ" crane-rental site) is split across **two separate
GitHub repositories**. This file exists so context is never lost between work
sessions — always read it before making changes.

| Part         | Repository                                            | Local folder | Deploy   |
| ------------ | ----------------------------------------------------- | ------------ | -------- |
| **Backend**  | https://github.com/SUNNATBEE/autokran                 | `backend/`   | Railway  |
| **Frontend** | https://github.com/SUNNATBEE/autokranFrontend         | `frontend/`  | Vercel   |

> **This repo is the BACKEND** (Express + TypeScript + Prisma/MongoDB API).

## Golden rule for pushing

- **Backend changes** (anything under `backend/`) → push to **`autokran`** (this repo).
- **Frontend changes** (anything under `frontend/`) → push to **`autokranFrontend`**.
- Never mix: one change set goes to exactly one repo.

The two folders live side by side locally at `…/crane-rental-app/`, but each is
its own independent git repo with its own remote.

## Shared contract (keep in sync across both repos)

Because the apps are separate, a few things MUST stay aligned manually:

- **`JWT_SECRET`** — must be the **same value** in the backend and the frontend.
  The frontend's `src/proxy.ts` verifies the admin JWT this backend signs.
- **`admin-auth-config.ts`** — exists in **both** repos (roles + path rules). If
  you change it here, mirror the change in the frontend repo.
- **API contract** — request/response shapes of `/api/*` endpoints. If you change
  a route here, update the frontend caller.
- **`BACKEND_URL`** (frontend) must point at this backend's public URL; this
  backend's **`CORS_ORIGIN`** must list the frontend origin.

## This backend at a glance

- Stack: Express + TypeScript, Prisma + **MongoDB Atlas** (replica set required).
- Deploy: `railway.json` → build `npm run build`, start `npm run start:prod`
  (`prisma db push` then `node dist/server.js`). See [`RAILWAY.md`](./RAILWAY.md).
- Secrets are env-only (`.env`, git-ignored). Required in production:
  `JWT_SECRET`, `ADMIN_ACCOUNTS`, `DATABASE_URL`, `CORS_ORIGIN`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Local dev admin (only when `ADMIN_ACCOUNTS` is unset): `admin` / `manager`,
  password `devpassword`. Real accounts come from `ADMIN_ACCOUNTS`.

See [`README.md`](./README.md) for endpoints and [`RAILWAY.md`](./RAILWAY.md) for
deployment.
