/**
 * Archetype A importer — reservation / arrival list.
 *
 * Reads the multi-sheet arrival workbook (one sheet per property × month),
 * parses each sheet name into (property, year, month), robustly locates the
 * header row and maps the (widely varying) columns, normalizes Company/Agent →
 * canonical segment + clean agent, and writes PII-free aggregates into
 * ReservationFact (property × month × nationality × segment × agent →
 * reservations, room-nights, revenue).
 *
 * Handles real-world variants seen in the data:
 *   - header in row 1 OR row 2 (row 1 = a title like "Seminyak"/"Umalas")
 *   - column names: Reservation Number/ResNo, Guest Name/GuestName,
 *     Company / Agent / Company/TA, Nationality/Nat/Region, Room Rate/RoomRate
 *   - missing "Stay" column → room-nights computed from Arrival→Departure
 * Room Rate is per-night, so revenue = rate × nights.
 *
 * Usage:  npx tsx scripts/import-arrival.ts <arrival.xlsx>
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { parseReservationSheet, cleanNum } from "../src/lib/ingest/parse";
import { normalizeSegment, cleanAgent } from "../src/lib/ingest/segment";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

type Fact = {
  propertyCode: string; month: Date; nationality: string | null;
  marketSegment: string | null; agent: string | null;
  reservations: number; roomNights: number; revenue: number;
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

  for (const sn of wb.SheetNames) {
    const meta = parseReservationSheet(sn);
    if (!meta) { skipped.push(sn); continue; }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });

    // locate header row (0..4)
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
    };
    // nationality: prefer Nationality/Nat, else Region, else Co/Country
    let natCol = find((h) => h.startsWith("nat"));
    if (natCol < 0) natCol = find((h) => h === "region");
    if (natCol < 0) natCol = find((h) => h === "co" || h === "country");
    // rate: prefer RoomRate, else a rate col that isn't "ratecode"/"rate plan"
    let rateCol = find((h) => noSpace(h).includes("roomrate"));
    if (rateCol < 0) rateCol = find((h) => h.includes("rate") && !h.includes("plan") && !h.includes("code"));

    const month = new Date(Date.UTC(meta.year, meta.month - 1, 1));
    let used = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const resId = ci.resId >= 0 ? r[ci.resId] : null;
      const guest = ci.guest >= 0 ? r[ci.guest] : null;
      if ((resId == null || resId === "") && (guest == null || guest === "")) continue;

      const nat = natCol >= 0 && r[natCol] ? String(r[natCol]).trim().toUpperCase().slice(0, 3) : null;
      const agentRaw = ci.agent >= 0 && r[ci.agent] ? String(r[ci.agent]) : null;
      const segment = normalizeSegment(agentRaw);
      const agent = cleanAgent(agentRaw);

      let stay = cleanNum(ci.stay >= 0 ? r[ci.stay] : null);
      if (stay == null || stay < 1 || stay > 120) {
        stay = nightsFromDates(ci.arr >= 0 ? r[ci.arr] : null, ci.dep >= 0 ? r[ci.dep] : null) ?? 1;
      }
      const rate = cleanNum(rateCol >= 0 ? r[rateCol] : null);
      const revenue = rate ? rate * stay : 0;

      const key = `${meta.property}|${month.toISOString()}|${nat ?? ""}|${segment}|${agent}`;
      const f = facts.get(key);
      if (f) { f.reservations++; f.roomNights += stay; f.revenue += revenue; }
      else facts.set(key, { propertyCode: meta.property, month, nationality: nat, marketSegment: segment, agent, reservations: 1, roomNights: stay, revenue });
      used++; totRes++; totNights += stay; totRev += revenue;
    }
    sheetsUsed++;
    console.log(`  • ${sn} → ${meta.property} ${meta.year}-${String(meta.month).padStart(2, "0")} (hdr r${hi + 1}): ${used}`);
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
