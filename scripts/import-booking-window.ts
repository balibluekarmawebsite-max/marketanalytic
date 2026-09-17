/**
 * Booking-window (lead time) importer.
 *
 * Reads the newer arrival-list CSV exports — the ones that carry a "Created
 * Date" column — and aggregates the booking window (arrival date − created
 * date, in days) into BookingWindowFact at property × arrival-month × agent
 * grain. No guest PII is stored; only counts, a lead-day sum, and a bucketed
 * distribution.
 *
 * Property comes from the file name (BKDS / BKDU / BKV); the arrival month comes
 * from the data itself (the dominant arrival YYYY-MM), so a mislabeled file
 * still lands in the right month.
 *
 * Incremental: each (property, month) present in the input replaces just those
 * rows, so you can add one month at a time. After writing, the full table is
 * dumped to prisma/data/bookingwindowfact.sql for committing + deploy.
 *
 * Usage:  npx tsx scripts/import-booking-window.ts <file-or-dir> [more…]
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { detectProperty } from "../src/lib/ingest/parse";
import { normalizeSegment, cleanAgent } from "../src/lib/ingest/segment";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const LEAD_CAP = 365; // a booking made >1 year out is treated as 365d for the average
const DUMP = "prisma/data/bookingwindowfact.sql";

// Minimal RFC-4180-ish CSV parser (quoted fields may contain commas/newlines).
function parseCsv(t: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Parse a d/m/yyyy or dd/mm/yyyy date (the PMS export format). UTC to avoid TZ drift.
function parseDMY(s: unknown): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(dt.getTime()) ? null : dt;
}

const lc = (v: unknown) => String(v ?? "").toLowerCase().trim();
const ymOf = (d: Date) => d.toISOString().slice(0, 7);
const bucketField = (lead: number) =>
  lead <= 7 ? "lead0_7" : lead <= 30 ? "lead8_30" : lead <= 60 ? "lead31_60" : lead <= 90 ? "lead61_90" : "lead91plus";

type Agg = {
  propertyCode: string; month: Date; agent: string | null;
  reservations: number; leadDaysSum: number;
  lead0_7: number; lead8_30: number; lead31_60: number; lead61_90: number; lead91plus: number;
};
const emptyAgg = (propertyCode: string, month: Date, agent: string | null): Agg => ({
  propertyCode, month, agent, reservations: 0, leadDaysSum: 0,
  lead0_7: 0, lead8_30: 0, lead31_60: 0, lead61_90: 0, lead91plus: 0,
});

function listCsvFiles(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const f of fs.readdirSync(p)) { if (f.toLowerCase().endsWith(".csv")) out.push(path.join(p, f)); }
    else if (p.toLowerCase().endsWith(".csv")) out.push(p);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) throw new Error("Usage: tsx scripts/import-booking-window.ts <file-or-dir> [more…]");
  const files = listCsvFiles(args);
  if (!files.length) throw new Error("No .csv files found in: " + args.join(", "));

  // key "PROP|YYYY-MM" → (agent → Agg)
  const byPm = new Map<string, Map<string, Agg>>();
  const touched = new Set<string>(); // "PROP|YYYY-MM-01" pairs to refresh
  let filesUsed = 0, rowsSeen = 0, rowsUsed = 0, skippedNoDate = 0, negatives = 0, capped = 0;

  for (const file of files) {
    const base = path.basename(file);
    const property = detectProperty(base);
    if (!property) { console.log(`  ✗ ${base}: cannot detect property (BKDS/BKDU/BKV) from name — skipped`); continue; }
    const rows = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    if (rows.length < 2) { console.log(`  ✗ ${base}: no data rows`); continue; }
    const H = rows[0].map(lc);
    const ci = {
      arr: H.findIndex((h) => h.includes("arrival")),
      created: H.findIndex((h) => h.includes("created")),
      agent: H.findIndex((h) => h.includes("company") || h.includes("agent")),
      res: H.findIndex((h) => h.includes("reservation number") || h === "reservation no"),
      guest: H.findIndex((h) => h.includes("guest name")),
    };
    if (ci.arr < 0 || ci.created < 0) { console.log(`  ✗ ${base}: missing Arrival or Created Date column — skipped`); continue; }

    // Month = dominant arrival YYYY-MM in the file.
    const monthVotes = new Map<string, number>();
    const parsed: { arr: Date; cre: Date | null; agent: string | null }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const resId = ci.res >= 0 ? r[ci.res] : null;
      const guest = ci.guest >= 0 ? r[ci.guest] : null;
      if ((resId == null || resId === "") && (guest == null || guest === "")) continue; // blank row
      const arr = parseDMY(r[ci.arr]);
      if (!arr) continue;
      rowsSeen++;
      monthVotes.set(ymOf(arr), (monthVotes.get(ymOf(arr)) ?? 0) + 1);
      parsed.push({ arr, cre: parseDMY(r[ci.created]), agent: ci.agent >= 0 ? (r[ci.agent] || null) : null });
    }
    if (!parsed.length) { console.log(`  ✗ ${base}: no parseable arrivals`); continue; }
    const ym = Array.from(monthVotes).sort((a, b) => b[1] - a[1])[0][0];
    const month = new Date(`${ym}-01T00:00:00.000Z`);
    const pmKey = `${property}|${ym}`;
    const agg = byPm.get(pmKey) ?? new Map<string, Agg>();
    byPm.set(pmKey, agg);
    touched.add(`${property}|${ym}-01`);

    let fileUsed = 0;
    for (const p of parsed) {
      if (ymOf(p.arr) !== ym) continue; // ignore stray rows from an adjacent month
      const agent = cleanAgent(p.agent);
      const a = agg.get(agent) ?? emptyAgg(property, month, agent);
      agg.set(agent, a);
      if (!p.cre) { skippedNoDate++; continue; }
      let lead = Math.round((p.arr.getTime() - p.cre.getTime()) / 86400000);
      if (lead < 0) { negatives++; lead = 0; }
      if (lead > LEAD_CAP) { capped++; lead = LEAD_CAP; }
      a.reservations++; a.leadDaysSum += lead;
      const bf = bucketField(lead);
      if (bf === "lead0_7") a.lead0_7++;
      else if (bf === "lead8_30") a.lead8_30++;
      else if (bf === "lead31_60") a.lead31_60++;
      else if (bf === "lead61_90") a.lead61_90++;
      else a.lead91plus++;
      fileUsed++; rowsUsed++;
    }
    filesUsed++;
    console.log(`  • ${base} → ${property} ${ym}: ${fileUsed} bookings`);
  }

  const rowsToWrite: Agg[] = [];
  for (const agg of Array.from(byPm.values())) for (const a of Array.from(agg.values())) if (a.reservations > 0) rowsToWrite.push(a);

  console.log(`\nParsed ${filesUsed} file(s), ${rowsSeen} rows seen, ${rowsUsed} with a usable booking window` +
    ` (skipped ${skippedNoDate} missing created date; ${negatives} negative→0; ${capped} capped at ${LEAD_CAP}d).`);
  console.log(`Aggregated into ${rowsToWrite.length} BookingWindowFact rows across ${touched.size} property-month(s).`);

  // Incremental refresh: replace only the (property, month) pairs we touched.
  for (const key of Array.from(touched)) {
    const [propertyCode, dateStr] = key.split("|");
    await prisma.bookingWindowFact.deleteMany({ where: { propertyCode, month: new Date(`${dateStr}T00:00:00.000Z`) } });
  }
  for (let i = 0; i < rowsToWrite.length; i += 500) await prisma.bookingWindowFact.createMany({ data: rowsToWrite.slice(i, i + 500) });

  // Sanity summary by segment (derived live, as the app does).
  const seg = new Map<string, { n: number; sum: number }>();
  for (const a of rowsToWrite) {
    const s = normalizeSegment(a.agent);
    const e = seg.get(s) ?? { n: 0, sum: 0 }; e.n += a.reservations; e.sum += a.leadDaysSum; seg.set(s, e);
  }
  console.log("\nBy segment (avg lead days):");
  for (const [k, e] of Array.from(seg).sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${k.padEnd(22)} n=${String(e.n).padStart(4)}  avg=${(e.sum / e.n).toFixed(1)}d`);

  await dumpTable();
  console.log(`\n  ✓ Wrote ${DUMP}`);
}

// Regenerate the committed SQL dump from the full table (deterministic order).
async function dumpTable() {
  const all = await prisma.bookingWindowFact.findMany({
    orderBy: [{ propertyCode: "asc" }, { month: "asc" }, { agent: "asc" }],
  });
  const q = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
  const ts = (d: Date) => `'${d.toISOString().slice(0, 10)} 00:00:00'`;
  const lines: string[] = [
    "-- Blue Karma — BookingWindowFact (lead-time aggregates, no PII).",
    '-- Requires the BookingWindowFact table (run: npx prisma db push).',
    `-- Load:  sudo -u postgres psql -p 5432 -d marketanalytic -f ${DUMP}`,
    "BEGIN;",
    'TRUNCATE "BookingWindowFact";',
  ];
  for (const r of all) {
    lines.push(
      `INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES (` +
      `'${r.id}', '${r.propertyCode}', ${ts(r.month)}, ${q(r.agent)}, ${r.reservations}, ${r.leadDaysSum}, ${r.lead0_7}, ${r.lead8_30}, ${r.lead31_60}, ${r.lead61_90}, ${r.lead91plus});`,
    );
  }
  lines.push("COMMIT;", "");
  fs.writeFileSync(DUMP, lines.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
