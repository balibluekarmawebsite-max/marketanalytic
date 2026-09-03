# Deployment — Blue Karma VPS (AlmaLinux 9 + cPanel/WHM)

Native deployment guide for **server.bluekarmasecrets.com**, tailored to the
setup we detected. No Docker — this runs the same way your existing sites do:
a Node app under **PM2**, reverse-proxied by **Apache** via a subdomain
`.htaccess`, using your existing **PostgreSQL 16**.

## Why this is safe — isolation guarantees

This deployment is **additive only**. It never edits a file, port, database, or
config belonging to your existing sites.

| Resource | ads / dashboard (existing) | This app (new) |
| --- | --- | --- |
| App port | `127.0.0.1:3000` / `:3001` | `127.0.0.1:3100` |
| PM2 process | `ads-dashboard` | `market-analytics` |
| Database (in PG16 @ 5432) | `adsdashboard`, `bkdash` | `marketanalytic` (own role, connection-capped) |
| Subdomain | ads.* / dashboard.* | analytics.* (new `.htaccess`) |
| Code | their dirs | `/opt/marketanalytic` |

Detected and already installed: Node v20, npm, PM2, git, PostgreSQL 16 on
`:5432` (admin as `postgres`), Apache with mod_proxy/mod_rewrite. Nothing new to
install at the system level.

> Note: at survey time the existing `ads-dashboard` PM2 app was `errored`
> (crash-looping, with an orphan process holding :3000). That is a pre-existing
> issue unrelated to this deployment and is not touched here.

---

## Step 1 — Create the isolated database (PostgreSQL 16)

Generate a strong, URL-safe password and create a dedicated role + database.
Run as root:

```bash
DBPASS="$(openssl rand -hex 24)"
echo ">>> SAVE THIS DB PASSWORD: $DBPASS"

cd /tmp
sudo -u postgres psql -p 5432 -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE marketanalytic LOGIN PASSWORD '${DBPASS}' CONNECTION LIMIT 20;
CREATE DATABASE marketanalytic OWNER marketanalytic;
\connect marketanalytic
ALTER SCHEMA public OWNER TO marketanalytic;
GRANT ALL ON SCHEMA public TO marketanalytic;
SQL

echo ">>> DATABASE_URL for your .env:"
echo "DATABASE_URL=\"postgresql://marketanalytic:${DBPASS}@127.0.0.1:5432/marketanalytic?schema=public\""
```

- `CONNECTION LIMIT 20` caps this app's connections so it can never starve the
  shared PostgreSQL server.
- `ALTER SCHEMA public OWNER` handles the PostgreSQL 15+ rule that non-owners
  can't create tables in `public` — required for Prisma to build the schema.
- Copy the printed `DATABASE_URL` line; you'll paste it into `.env` in step 2.

---

## Step 2 — Get the code, configure, build, seed

```bash
# Clone the repo (private — authenticate with a GitHub token or deploy key).
sudo mkdir -p /opt && cd /opt
git clone -b claude/blue-karma-market-dashboard-f1fz1y \
  https://github.com/balibluekarmawebsite-max/marketanalytic.git
cd /opt/marketanalytic

# Env file
cp .env.example .env
nano .env    # paste the DATABASE_URL from step 1 (replace the placeholder line)

# Install, build, create schema, seed reference data
npm ci
npm run build
npx prisma db push     # creates tables in the marketanalytic database
npx prisma db seed     # seeds properties, segment aliases, column aliases
```

`npm ci` needs the committed `package-lock.json` (it's in the repo). `npx prisma`
commands load `.env` automatically.

---

## Step 3 — Run under PM2 (private port 3100)

```bash
cd /opt/marketanalytic
pm2 start ecosystem.config.js
pm2 save                 # persist across reboots (updates PM2's saved list)
pm2 status market-analytics
```

---

## Step 4 — Verify locally (still private, not public yet)

```bash
curl -s http://127.0.0.1:3100/api/health ; echo
```

Expect: `{"status":"ok","database":"connected","properties":3, ...}`.

If that's good, the app is fully working — it's just not exposed to the internet
yet. Everything up to here is invisible to the world and to your other sites.

---

## Step 5 — Go live: subdomain + Apache proxy + SSL

1. **Create the subdomain in cPanel** (as the `ethnicet` account):
   WHM → *List Accounts* → log in to `ethnicet` → **Domains → Create a New Domain**
   → `analytics.bluekarmasecrets.com`. Let it use the default document root
   `/home/ethnicet/public_html/analytics.bluekarmasecrets.com`.

2. **Add the reverse-proxy `.htaccess`** (mirrors your dashboard/ads setup),
   as root:

   ```bash
   DOCROOT=/home/ethnicet/public_html/analytics.bluekarmasecrets.com
   cat > "$DOCROOT/.htaccess" <<'EOF'
   DirectoryIndex disabled
   RewriteEngine On
   RewriteRule ^ http://127.0.0.1:3100%{REQUEST_URI} [P,L]
   EOF
   chown ethnicet:ethnicet "$DOCROOT/.htaccess"
   ```

   > `DirectoryIndex disabled` is **required**. Without it, a request to the bare
   > `/` makes Apache's `mod_dir` look for an index file and it never reaches the
   > proxy — so the homepage returns 404 while sub-paths like `/api/health` work.
   > `%{REQUEST_URI}` preserves the exact path (same form the ads.* site uses).

3. **SSL — via Cloudflare** (DNS for `bluekarmasecrets.com` is on Cloudflare):
   set the new **`analytics`** DNS record to **Proxied (orange cloud)**, matching
   the existing `dashboard` record. With the zone's **Flexible** SSL mode,
   Cloudflare serves a valid certificate to visitors and forwards to the origin
   over HTTP `:80` — so **no certificate is needed on the server itself**. A
   grey-clouded record makes browsers hit the origin directly and show
   `ERR_CERT_DATE_INVALID` / "Not Secure". (If the zone were Full / Full-strict,
   the origin would additionally need a cert via cPanel AutoSSL or a Cloudflare
   Origin Certificate.)

4. **Verify live**:
   ```bash
   curl -sI https://analytics.bluekarmasecrets.com/ | head -1
   curl -s  https://analytics.bluekarmasecrets.com/api/health ; echo
   ```

Done — the dashboard is live at **https://analytics.bluekarmasecrets.com**.

---

## Updating the app later

```bash
cd /opt/marketanalytic
git pull
npm ci
npm run build
npx prisma db push      # only if the schema changed
pm2 restart market-analytics
```

## Rolling back / removing (does not affect other sites)

```bash
pm2 delete market-analytics && pm2 save          # stop the app
rm -f /home/ethnicet/public_html/analytics.bluekarmasecrets.com/.htaccess  # unproxy
# Optionally drop the database:
cd /tmp && sudo -u postgres psql -p 5432 -c "DROP DATABASE marketanalytic;" \
  -c "DROP ROLE marketanalytic;"
```

## Firewall note

The app binds to `127.0.0.1` only, so ports 3100 are never reachable from
outside the server regardless of firewall rules — only Apache (via the
`.htaccess` proxy) can reach it. Public traffic stays on 80/443 through Apache.
