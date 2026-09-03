/**
 * Archetype A importer — reservation / arrival list.
 *
 * Reads the multi-sheet arrival workbook (one sheet per property × month),
 * parses each sheet name into (property, year, month), robustly locates the
 * header row and maps the (widely varying) columns, normalizes Company/Agent →
 * canonical segment + clean agent and Room Type → property taxonomy (applying
 * the combine rules at reservation level), and writes PII-free aggregates into
 * ReservationFact (property × month × nationality × segment × agent × roomType
 * → reservations, room-nights, revenue).
 *
 * Room Rate is per-night, so revenue = rate × nights.
 *
 * Usage:  npx tsx scripts/import-arrival.ts <arrival.xlsx>
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { parseReservationSheet, cleanNum } from "../src/lib/ingest/parse";
import { normalizeSegment, cleanAgent } from "../src/lib/ingest/segment";
import { normalizeRoomType, combinedNameFor } from "../src/lib/ingest/roomtype";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

type Fact = {
  propertyCode: string; month: Date; nationality: string | null;
  marketSegment: string | null; agent: string | null; roomType: string | null;
  reservations: number; roomNights: number; revenue: number;
};
type Rec = {
  resId: string; base: string; roomName: string;
  nat: string | null; segment: string; agent: string; stay: number; revenue: number;
};

const lc = (v: unknown) => String(v ?? "").toLowerCase().trim();

function scoreHeader(cells: unknown[]): number {
  const h = cells.map(lc);
  const has = (...subs: string[]) => h.some((x) => subs.some((s) => x.includes(s)));
  let s = 0;
  if (has("guest")) s++;
  if (has("arrival")) s++;
  if (has("departure")) s++;
  if (has("reservation", "resno", "res no")) s++;
  if (has("company", "agent", "/ta")) s++;
  if (has("roomrate", "room rate")) s++;
  if (has("nationality", "nat", "region")) s++;
  return s;
}

function nightsFromDates(arr: unknown, dep: unknown): number | null {
  if (arr instanceof Date && dep instanceof Date) {
    const d = Math.round((dep.getTime() - arr.getTime()) / 86_400_000);
    if (d >= 1 && d <= 120) return d;
  }
  return null;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/import-arrival.ts <arrival.xlsx>");

  const wb = XLSX.readFile(file, { cellDates: true });
  const facts = new Map<string, Fact>();
  const skipped: string[] = [];
  let sheetsUsed = 0, totRes = 0, totNights = 0, totRev = 0;

  const addFact = (propertyCode: string, month: Date, r: Rec, roomType: string) => {
    const key = `${propertyCode}|${month.toISOString()}|${r.nat ?? ""}|${r.segment}|${r.agent}|${roomType}`;
    const f = facts.get(key);
    if (f) { f.reservations++; f.roomNights += r.stay; f.revenue += r.revenue; }
    else facts.set(key, { propertyCode, month, nationality: r.nat, marketSegment: r.segment, agent: r.agent, roomType, reservations: 1, roomNights: r.stay, revenue: r.revenue });
  };

  for (const sn of wb.SheetNames) {
    const meta = parseReservationSheet(sn);
    if (!meta) { skipped.push(sn); continue; }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });

    let hi = 0, hiScore = -1;
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      const sc = scoreHeader(rows[i] || []);
      if (sc > hiScore) { hiScore = sc; hi = i; }
    }
    if (hiScore < 3) { skipped.push(sn); continue; }

    const H = (rows[hi] || []).map(lc);
    const find = (test: (h: string) => boolean) => H.findIndex(test);
    const noSpace = (h: string) => h.replace(/[^a-z]/g, "");
    const ci = {
      resId: find((h) => h.includes("reservation") || noSpace(h).includes("resno")),
      guest: find((h) => h.includes("guest")),
      agent: find((h) => h.includes("company") || h.includes("agent") || h.includes("/ta")),
      stay: find((h) => h === "stay" || h.startsWith("stay")),
      arr: find((h) => h.includes("arrival")),
      dep: find((h) => h.includes("departure")),
      rt: find((h) => h.includes("room type") || h === "rmcat" || h === "roomtype" || h.includes("room cat")),
    };
    let natCol = find((h) => h.startsWith("nat"));
    if (natCol < 0) natCol = find((h) => h === "region");
    if (natCol < 0) natCol = find((h) => h === "co" || h === "country");
    let rateCol = find((h) => noSpace(h).includes("roomrate"));
    if (rateCol < 0) rateCol = find((h) => h.includes("rate") && !h.includes("plan") && !h.includes("code"));

    // Pass 1: collect per-room records, grouped by reservation id.
    const groups = new Map<string, Rec[]>();
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const resIdRaw = ci.resId >= 0 ? r[ci.resId] : null;
      const guest = ci.guest >= 0 ? r[ci.guest] : null;
      if ((resIdRaw == null || resIdRaw === "") && (guest == null || guest === "")) continue;

      const nat = natCol >= 0 && r[natCol] ? String(r[natCol]).trim().toUpperCase().slice(0, 3) : null;
      const agentRaw = ci.agent >= 0 && r[ci.agent] ? String(r[ci.agent]) : null;
      let stay = cleanNum(ci.stay >= 0 ? r[ci.stay] : null);
      if (stay == null || stay < 1 || stay > 120) stay = nightsFromDates(ci.arr >= 0 ? r[ci.arr] : null, ci.dep >= 0 ? r[ci.dep] : null) ?? 1;
      const rate = cleanNum(rateCol >= 0 ? r[rateCol] : null);
      const { base, name } = normalizeRoomType(meta.property, ci.rt >= 0 ? r[ci.rt] : null);

      const resId = resIdRaw != null && resIdRaw !== "" ? String(resIdRaw) : `__r${i}`;
      const rec: Rec = { resId, base, roomName: name, nat, segment: normalizeSegment(agentRaw), agent: cleanAgent(agentRaw), stay, revenue: rate ? rate * stay : 0 };
      const g = groups.get(resId) ?? [];
      g.push(rec);
      groups.set(resId, g);
    }

    // Pass 2: apply combine rule per reservation, then aggregate.
    const month = new Date(Date.UTC(meta.year, meta.month - 1, 1));
    let used = 0;
    for (const recs of Array.from(groups.values())) {
      const bases = new Set(recs.map((r) => r.base));
      const combo = combinedNameFor(meta.property, bases);
      for (const rec of recs) {
        const roomType = combo && (rec.base === combo.a || rec.base === combo.b) ? combo.name : rec.roomName;
        addFact(meta.property, month, rec, roomType);
        used++; totRes++; totNights += rec.stay; totRev += rec.revenue;
      }
    }
    sheetsUsed++;
    console.log(`  • ${sn} → ${meta.property} ${meta.year}-${String(meta.month).padStart(2, "0")}: ${used}`);
  }

  const out = Array.from(facts.values());
  console.log(`\nParsed ${sheetsUsed} sheets (${skipped.length} skipped: ${skipped.join(", ") || "none"})`);
  console.log(`Reservations: ${totRes} · room nights: ${totNights} · revenue: ${Math.round(totRev).toLocaleString("en-US")}`);
  console.log(`Aggregated into ${out.length} fact rows. Writing…`);

  await prisma.reservationFact.deleteMany({});
  for (let i = 0; i < out.length; i += 500) await prisma.reservationFact.createMany({ data: out.slice(i, i + 500) });
  console.log(`  ✓ ${out.length} ReservationFact rows written.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
