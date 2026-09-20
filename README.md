# URL Shortener

A self-hosted link shortener with a dashboard, Supabase auth, and click analytics.
Node + Express on the backend, vanilla HTML/CSS/JS on the frontend, SQLite storage.

## Features

- Submit a long URL and get a short code back
- Redirect visitors from `/CODE` to the original URL
- SQLite persistence (links survive restarts)
- Dashboard with a shorten form and a link list
- Supabase email/password auth — users only see their own links
- Per-link click counts with a simple 14-day bar chart (zero dependencies, inline SVG)
- Falls back to a **public anonymous mode** if Supabase isn't configured

## Run locally

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # auto-reload on changes
npm test         # smoke test suite (boots a temp server + DB)
```

## Auth (optional)

Copy `.env.example` to `.env` and fill in your Supabase project values:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

- Without `.env` values the app runs in anonymous dev mode (auth is bypassed).
- With them, the dashboard requires login and links are scoped per user.
- Auth tokens are verified server-side on every request (`auth.js`).

## API

| Method | Path                          | Auth | Description                        |
| ------ | ----------------------------- | ---- | ---------------------------------- |
| POST   | `/api/links`                  | yes* | Shorten a URL                       |
| GET    | `/api/links`                  | yes* | List the user's links               |
| GET    | `/api/links/:code/analytics`  | yes* | Clicks per day for one link         |
| POST   | `/api/auth/signup`            | —    | Create an account                   |
| POST   | `/api/auth/login`             | —    | Log in, returns a session           |
| POST   | `/api/auth/logout`            | yes  | Invalidate the session              |
| GET    | `/api/config`                 | —    | Reveals whether auth is enabled     |
| GET    | `/:code`                      | no   | Redirect to the original URL        |

`*` auth is applied automatically once Supabase is configured.

## Project layout

- `server.js` — Express app, routes
- `auth.js` — Supabase client + `requireAuth` middleware
- `db.js` — SQLite schema and queries (`links`, `clicks_log`)
- `public/` — static dashboard (index, login, app/auth JS, styles)
- `test.mjs` — smoke tests; the auth suite runs when Supabase env vars are set

## Deploy on Railway

1. Push this repo to GitHub (see below) and create a new Railway project from it.
2. Railway auto-detects Node and runs `npm start` (`railway.json`).
3. Set the env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. For durable storage on Railway, add a **Volume** mounted at `/data` and set
   `DB_PATH=/data/links.db` so short links survive deploys.
5. Add a custom domain or use Railway's generated `*.up.railway.app` URL.

> Note: Railway restarts wipe the default volume-less SQLite file. Use the volume
> above, or migrate to Postgres (Supabase provides one), for production data.

## Deploy on Vercel

Express on Vercel needs the serverless adapter (`@vercel/node`); Railway is the
simpler path for this app since it needs a long-running server for redirects.