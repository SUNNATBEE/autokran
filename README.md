# AUTOKRAN.UZ — Backend (Express + TypeScript)

Standalone REST API server for the AUTOKRAN.UZ crane-rental site.

> **Two-repo project.** This is the **backend**. The frontend (Next.js) lives in
> a separate repo: <https://github.com/SUNNATBEE/autokranFrontend>.
> Read [`WORKFLOW.md`](./WORKFLOW.md) first — it documents the repo map and the
> push rules.

## Setup

```bash
npm install
cp .env.example .env   # then fill in values
npm run dev            # tsx watch, http://localhost:4000
```

`JWT_SECRET` **must match** the frontend's `JWT_SECRET` — the frontend proxy
(`src/proxy.ts`) verifies the admin token that this server signs.

## Deploy

Railway — see [`RAILWAY.md`](./RAILWAY.md). The repo root is the backend, so the
Railway service Root Directory is `/` (no subdirectory needed).

## Scripts

- `npm run dev` — start in watch mode (tsx)
- `npm run build` — `prisma generate` + `tsc` → `dist/`
- `npm start` — run the compiled server from `dist/`

## Data storage

- Database: **Prisma + MongoDB** (use a MongoDB Atlas replica set). Schema is
  synced with `prisma db push` — there are no migration files. See
  [`RAILWAY.md`](./RAILWAY.md) for deployment.
- Rental orders and contact requests use the database when `DATABASE_URL` is set,
  otherwise they fall back to JSON files in `data/` (dev only).
- Cranes, sponsors and global settings require the database (no file fallback).

## Auth

Role-based admin system. Accounts come from the `ADMIN_ACCOUNTS` env var (JSON);
roles `super_admin` / `order_manager`. A JWT is stored in the `admin_token`
cookie. `JWT_SECRET` must match the frontend.

## Endpoints

Public: `POST /api/contacts`, `POST /api/send-telegram`, `GET /api/site-settings`.

Admin (cookie auth):
`POST /api/admin/auth`, `GET /api/admin/me`, `POST /api/admin/logout`,
`/api/admin/{cranes,sponsors,orders,contacts,settings,upload}`.

Uploaded files are served from `/uploads/*`.
