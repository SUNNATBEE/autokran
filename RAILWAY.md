# Deploying the backend to Railway (MongoDB)

The backend is a standalone Express + TypeScript API. It uses **Prisma +
MongoDB**. There is also a JSON-file fallback (`data/*.json`) for orders and
contacts, but **do not rely on it in production** — Railway's filesystem is
ephemeral and is wiped on every redeploy. A real database is required for the
admin panel (Fleet / Sponsors / Settings) and for persistent order history.

> The `supabase/` folder in this repo is legacy and unrelated — ignore it.
> Prisma (`prisma/schema.prisma`) is the source of truth.

## Why MongoDB Atlas (not Railway's MongoDB)

Prisma's MongoDB connector **requires a replica set**. Railway's plain MongoDB
container is a standalone node (not a replica set) and Prisma will refuse to
connect. Use **MongoDB Atlas** — its free **M0** cluster is a replica set out of
the box. (Atlas is free, managed, and works perfectly with Railway.)

## 1. Create the MongoDB Atlas database

1. Sign up at <https://www.mongodb.com/cloud/atlas> → create a free **M0** cluster.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add IP `0.0.0.0/0` (allow from anywhere — Railway IPs are
   dynamic). Tighten later if you use a static egress.
4. **Connect → Drivers** → copy the connection string. It looks like:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

   Insert the database name before the `?`, e.g. `.../crane_rental?retryWrites=...`.

## 2. Create the Railway service

1. Push this repo to GitHub (`autokran`).
2. In Railway: **New Project → Deploy from GitHub repo** → pick `autokran`.
3. The backend is the repo root, so **Root Directory** stays `/` (default) — no
   subdirectory needed.

Railway auto-detects Node via Nixpacks and reads `railway.json`:
- Build: `npm run build` (`prisma generate && tsc`)
- Start: `npm run start:prod` (`prisma db push` → creates collections/indexes,
  then `node dist/server.js`)
- Health check: `GET /health`

## 3. Set environment variables

On the backend service (**Variables**):

| Variable             | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| `NODE_ENV`           | `production`                                                    |
| `DATABASE_URL`       | the Atlas `mongodb+srv://...` string (with the db name)         |
| `JWT_SECRET`         | strong unique secret — **must match the frontend's** JWT_SECRET |
| `ADMIN_ACCOUNTS`     | JSON array (see below) — **required in production**             |
| `CORS_ORIGIN`        | your frontend URL, e.g. `https://autokran.uz`                   |
| `TELEGRAM_BOT_TOKEN` | your bot token (rotate the old exposed one!)                    |
| `TELEGRAM_CHAT_ID`   | your chat id                                                    |
| `PORT`               | leave unset — Railway injects it automatically                  |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`ADMIN_ACCOUNTS` example (one line):

```json
[{"username":"shah","password":"STRONG_PASSWORD","role":"super_admin","displayName":"Shah"},{"username":"otabek","password":"STRONG_PASSWORD","role":"order_manager","displayName":"Otabek"}]
```

On the first deploy, `prisma db push` syncs the schema to MongoDB (creates the
collections and the unique index on `Admin.username`). No migration files are
used — MongoDB + Prisma uses `db push`, not `migrate`.

## 4. Uploaded files (admin media) — persistent volume

Admin image uploads are written to `public/uploads`, which is **also ephemeral**.
To keep them across deploys, add a Railway **Volume**:

- Backend service → **Settings → Volumes → New Volume**
- Mount path: `/app/public/uploads`

(For larger scale, use external storage such as Cloudinary / S3 / R2 instead.)

## 5. Point the frontend at this backend

Deploy the frontend (Vercel or another Railway service) and set:

- `BACKEND_URL` = the backend's Railway public URL (e.g. `https://<svc>.up.railway.app`)
- `JWT_SECRET` = the **same** value as the backend
- `NEXT_PUBLIC_SITE_URL` = your public domain

The frontend proxies `/api/*` and `/uploads/*` to `BACKEND_URL`, so the browser
only talks to the frontend origin (cookies stay first-party). Make sure
`CORS_ORIGIN` on the backend lists the frontend origin.

## Local development with MongoDB

`prisma db push` and the Prisma MongoDB connector need a replica set. The easiest
local option is to point `DATABASE_URL` at the same Atlas cluster (or a separate
free cluster). Then:

```bash
cd backend
npm install
npm run prisma:push   # sync schema to MongoDB
npm run dev
```

If `DATABASE_URL` is left empty, the API still runs and falls back to the JSON
file store for orders/contacts (but admin Fleet/Sponsors/Settings need the DB).

## Troubleshooting

- **`Server selection timeout` / `replica set` error** — you're pointing at a
  standalone MongoDB. Use an Atlas cluster (replica set).
- **`db push` hangs or fails** — confirm `DATABASE_URL` is correct, the db user
  password is URL-encoded, and Network Access allows `0.0.0.0/0`.
- **401 / redirected to login in admin** — `JWT_SECRET` differs between frontend
  and backend.
- **CORS errors** — add the exact frontend origin to `CORS_ORIGIN`
  (comma-separate multiple origins).
