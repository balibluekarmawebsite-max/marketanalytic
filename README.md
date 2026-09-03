# Blue Karma · Market Analytics Dashboard

Internal revenue-management dashboard for **Blue Karma Dijiwa Group** —
**BKDS** (Seminyak), **BKDU** (Ubud), and **BKV** (Village).

It ingests reservation and daily-report exports from any PMS or template,
auto-detects the file shape, and turns them into the KPIs a revenue manager
acts on: on-the-books occupancy, pickup, pace vs STLY, channel mix, segment
budget-vs-actual, RevPAR, ADR, and nationality analysis.

> Full product spec: [`market-analytics-dashboard-project.md`](./market-analytics-dashboard-project.md)

---

## Status — Milestone 1 (Setup) ✅

This repo currently contains the **project foundation** only. No data ingestion
or dashboards yet — those arrive milestone by milestone (see the roadmap on the
landing page and Section 14 of the spec).

What's in place:

- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Prisma schema for all four data archetypes (A/B/C/D) + learning dictionaries
- PostgreSQL via Docker
- Seed data: 3 properties, the Blue Karma segment taxonomy, and the Archetype A
  column dictionary
- A landing page that reads the seeded data (proves the stack works end to end)
- `/api/health` endpoint (app + database check)
- Dockerfile + docker-compose for local dev and VPS deploy

---

## Do we need Supabase? — Short answer: no, not for this.

**Recommendation: self-hosted PostgreSQL on your existing VPS** (what this repo
is set up for). Reasoning:

- Your spec already standardises on Postgres + Prisma, self-hosted, "same stack
  as the ads dashboard." Keeping one way of doing things is worth a lot for a
  small team.
- This is an **internal** tool holding sensitive revenue data. Keeping it on
  your own VPS means the data never leaves infrastructure you control.
- Prisma + Next.js API routes already provide everything Supabase would add here
  (schema, migrations, a typed data layer). Supabase's auto-generated APIs and
  row-level security would be **redundant** with the API routes we're building.
- Uploaded workbooks are parsed server-side and the *results* stored in
  Postgres; the raw files sit on the VPS disk. No object-storage service needed.
- Cost is predictable — it runs on the VPS you already pay for.

**The decision is not locked in.** Prisma talks to any Postgres through one
`DATABASE_URL`. If you later want managed backups/auth without running the DB
yourself, switching to Supabase (or Neon, RDS, etc.) is a connection-string
change — no code rewrite. If you do, use their pooled connection string for the
app and set `DIRECT_URL` for migrations (already stubbed in `.env.example` and
`schema.prisma`).

Consider Supabase later **only if**: you drop the VPS, you want managed
backups/point-in-time-restore without ops work, or you outgrow a single server.
Until then, self-hosted is simpler and cheaper.

---

## Prerequisites

- **Node.js 20+** and npm
- **Docker** + Docker Compose (for Postgres, and for the production image)

---

## Quick start (local development)

Recommended for day-to-day work: run Postgres in Docker, run the app on your
host for fast hot-reload.

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env

# 3. Start Postgres
docker compose up -d db

# 4. Create the schema and seed reference data
npm run db:push
npm run db:seed

# 5. Run the app
npm run dev
```

Open <http://localhost:3000>. You should see the dashboard shell with the three
seeded properties, and a green "Setup verified" banner.

Check the API directly: <http://localhost:3000/api/health>

### Alternative: run the whole stack in Docker

```bash
cp .env.example .env
docker compose up --build
```

This starts Postgres, runs a one-off `db-init` service (schema push + seed),
then starts the app on <http://localhost:3100> (the full-stack Docker app is
published on **3100**, not 3000 — see "Deploying alongside your existing sites").

---

## Environment variables

Copy `.env.example` to `.env` and adjust. The important one:

| Variable       | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string. **The only thing to change if you ever switch DB providers.** |

`GROQ_API_KEY`, `NEXTAUTH_SECRET`, etc. are listed for reference but unused
until their milestones.

---

## Useful commands

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Start the dev server (hot reload)                   |
| `npm run build`      | Generate Prisma client + production build           |
| `npm start`          | Run the production build                            |
| `npm run db:push`    | Sync the Prisma schema to the database (dev)        |
| `npm run db:migrate` | Create a versioned migration (when we adopt them)   |
| `npm run db:seed`    | Seed properties, segment aliases, column aliases    |
| `npm run db:studio`  | Open Prisma Studio to browse/edit data              |
| `npm run lint`       | Run ESLint                                          |

---

## Project structure

```
.
├── market-analytics-dashboard-project.md   # the product spec (source of truth)
├── prisma/
│   ├── schema.prisma            # all archetypes + learning dictionaries
│   └── seed.ts                  # properties, segment & column aliases
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # dashboard shell (reads seeded properties)
│   │   ├── globals.css
│   │   └── api/health/route.ts  # app + DB health check
│   ├── components/ui/           # shadcn/ui primitives (button, card, badge)
│   └── lib/
│       ├── prisma.ts            # Prisma client singleton
│       └── utils.ts             # cn(), IDR / percent formatters
├── Dockerfile                   # multi-stage: deps -> builder -> runner
└── docker-compose.yml           # db + db-init + app
```

---

## ⚠️ Needs your input before later milestones

- **Room counts** for occupancy math. Only **BKDU = 38** is known. `BKDS` and
  `BKV` are seeded as "unknown" (null) — fill them into `prisma/seed.ts` and
  re-run `npm run db:seed`. Occupancy/RevPAR for those two stay disabled until
  then.
- A few **open decisions** from Section 17 of the spec (auth scope, historical
  backfill, currency for owner reports, comp-set data). None block Milestone 1.

---

## Deploying alongside your existing sites (ads.* / dashboard.*)

**This stack is fully isolated from your existing projects and cannot interfere
with them.** Concretely:

- **Separate database.** It runs its own Postgres container with its own volume
  (`blue-karma-market-analytics_pgdata`). It never connects to the database
  behind ads.* or dashboard.*.
- **Namespaced containers/networks/volumes.** The Compose project is named
  `blue-karma-market-analytics`, so nothing shares a name with another project.
- **Non-default, localhost-only ports.** The app publishes on `127.0.0.1:3100`
  and Postgres on `127.0.0.1:55432` — different from the usual `3000` / `5432`,
  and bound to localhost so they're never exposed publicly. Change them in
  `.env` (`APP_PORT_BIND`, `DB_PORT_BIND`) if those happen to be taken.

### Pre-flight check (run on the VPS before deploying)

```bash
# Are ports 3100 / 55432 free? (no output = free)
sudo ss -tlnp | grep -E ':3100|:55432' || echo "3100 and 55432 are free"

# What's already running, for reference:
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

If either port is taken, set a different one in `.env` and re-run.

### Deploy

```bash
cp .env.example .env          # then edit: set a strong POSTGRES_PASSWORD
docker compose up --build -d  # db -> schema+seed -> app, on 127.0.0.1:3100
```

### Add a subdomain in Nginx

Pick a new hostname (e.g. `analytics.bluekarmasecrets.com`) and add a **new,
separate** server block — do not touch the existing ads/dashboard configs:

```nginx
server {
    server_name analytics.bluekarmasecrets.com;
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # then: sudo certbot --nginx -d analytics.bluekarmasecrets.com
}
```

`sudo nginx -t && sudo systemctl reload nginx` to apply. Because it's a new file
and a new upstream port, your existing sites are unaffected.

---

_Built with Claude Code. One milestone per session — review before moving on._
