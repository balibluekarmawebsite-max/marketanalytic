/**
 * Incremental arrival importer — add the months in a new arrival workbook to the
 * committed SQL dumps WITHOUT rebuilding the whole dataset. Unlike
 * import-arrival.ts (which wipes and rebuilds ReservationFact from one workbook),
 * this touches only the (property, month) pairs present in the given file:
 *
 *   - ReservationFact: aggregates property × month × nationality × segment ×
 *     agent × roomType (combine rules applied), same as the full importer.
 *   - BookingWindowFact: when a sheet carries a Created Date column, aggregates
 *     the booking window (arrival − created, in days) per property × month ×
 *     agent, same shape as import-booking-window.ts.
 *
 * It rewrites prisma/data/reservationfact.sql and bookingwindowfact.sql by
 * dropping any rows for the touched months and appending the fresh ones before
 * COMMIT — so existing months stay byte-identical and the diff is just the new
 * data. Idempotent: re-running replaces the same months.
 *
 * Usage:  npx tsx scripts/import-arrival-append.ts <arrival.xlsx>
 */
import * as fs from "fs";
import * as XLSX from "xlsx";
import { parseReservationSheet, cleanNum } from "../src/lib/ingest/parse";
import { normalizeSegment, cleanAgent } from "../src/lib/ingest/segment";
import { normalizeRoomType, combinedNameFor } from "../src/lib/ingest/roomtype";

const RF_DUMP = "prisma/data/reservationfact.sql";
const BW_DUMP = "prisma/data/bookingwindowfact.sql";
const LEAD_CAP = 365;

const lc = (v: unknown) => String(v ?? "").toLowerCase().trim();
const isSep = (v: unknown) => /^=+$/.test(String(v ?? "").replace(/\s/g, ""));

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
function parseDMY(s: string): Date | null {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return isNaN(d.getTime()) ? null : d;
}
// Read a date cell robustly. The exports mix real date cells with DD/MM/YYYY
// text; the formatted value (.w) is DD/MM/YYYY for both, so prefer it.
function cellDate(ws: XLSX.WorkSheet, r: number, c: number): Date | null {
  if (c < 0) return null;
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return null;
  if (typeof cell.w === "string") { const d = parseDMY(cell.w); if (d) return d; }
  if (cell.v instanceof Date) return isNaN(cell.v.getTime()) ? null : new Date(Date.UTC(cell.v.getFullYear(), cell.v.getMonth(), cell.v.getDate()));
  if (typeof cell.v === "string") return parseDMY(cell.v);
  return null;
}
function nightsFromDates(ws: XLSX.WorkSheet, r: number, arrCol: number, depCol: number): number | null {
  const a = cellDate(ws, r, arrCol), d = cellDate(ws, r, depCol);
  if (a && d) { const n = Math.round((d.getTime() - a.getTime()) / 86_400_000); if (n >= 1 && n <= 120) return n; }
  return null;
}

type Fact = {
  propertyCode: string; month: string; nationality: string | null;
  marketSegment: string | null; agent: string | null; roomType: string | null;
  reservations: number; roomNights: number; revenue: number;
};
type Rec = { resId: string; base: string; roomName: string; nat: string | null; segment: string; agent: string; stay: number; revenue: number };
type BW = { propertyCode: string; month: string; agent: string | null; reservations: number; leadDaysSum: number; b0_7: number; b8_30: number; b31_60: number; b61_90: number; b91plus: number };

const bwEmpty = (propertyCode: string, month: string, agent: string | null): BW =>
  ({ propertyCode, month, agent, reservations: 0, leadDaysSum: 0, b0_7: 0, b8_30: 0, b31_60: 0, b61_90: 0, b91plus: 0 });
const addLead = (a: BW, lead: number) => {
  a.reservations++; a.leadDaysSum += lead;
  if (lead <= 7) a.b0_7++; else if (lead <= 30) a.b8_30++; else if (lead <= 60) a.b31_60++; else if (lead <= 90) a.b61_90++; else a.b91plus++;
};

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/import-arrival-append.ts <arrival.xlsx>");
  const wb = XLSX.readFile(file, { cellDates: true });

  const facts = new Map<string, Fact>();
  const bw = new Map<string, BW>(); // key: PROP|YYYY-MM|agent
  const touched = new Set<string>(); // "PROP|YYYY-MM-01 00:00:00"
  const perMonth: { key: string; res: number; nights: number; rev: number; bwN: number; bwLead: number }[] = [];

  const addFact = (propertyCode: string, month: string, r: Rec, roomType: string) => {
    const key = `${propertyCode}|${month}|${r.nat ?? ""}|${r.segment}|${r.agent}|${roomType}`;
    const f = facts.get(key);
    if (f) { f.reservations++; f.roomNights += r.stay; f.revenue += r.revenue; }
    else facts.set(key, { propertyCode, month, nationality: r.nat, marketSegment: r.segment, agent: r.agent, roomType, reservations: 1, roomNights: r.stay, revenue: r.revenue });
  };

  for (const sn of wb.SheetNames) {
    const meta = parseReservationSheet(sn);
    if (!meta) { console.log(`  ✗ ${sn}: not a property-month sheet — skipped`); continue; }
    const ym = `${meta.year}-${String(meta.month).padStart(2, "0")}`;
    const monthSql = `${ym}-01 00:00:00`;
    touched.add(`${meta.property}|${monthSql}`);

    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    let hi = 0, hiScore = -1;
    for (let i = 0; i < Math.min(12, rows.length); i++) { const sc = scoreHeader(rows[i] || []); if (sc > hiScore) { hiScore = sc; hi = i; } }
    if (hiScore < 3) { console.log(`  ✗ ${sn}: no header row found — skipped`); continue; }

    const H = (rows[hi] || []).map(lc);
    const noSpace = (h: string) => h.replace(/[^a-z]/g, "");
    const find = (test: (h: string) => boolean) => H.findIndex(test);
    const ci = {
      resId: (() => { let c = find((h) => noSpace(h).includes("reservationnumber") || noSpace(h).includes("resno")); if (c < 0) c = find((h) => h.includes("reservation") && !h.includes("name")); return c; })(),
      guest: find((h) => h.includes("guest")),
      agent: (() => { let c = find((h) => h.includes("company") || h.includes("agent") || h.includes("/ta")); if (c < 0) c = find((h) => h.includes("reservation name")); return c; })(),
      stay: find((h) => h === "stay" || h.startsWith("stay")),
      arr: find((h) => h.includes("arrival")),
      dep: find((h) => h.includes("departure")),
      created: find((h) => h.includes("created")),
      rt: find((h) => h.includes("room type") || h.includes("rmcat") || h === "roomtype" || h.includes("room cat")),
    };
    let natCol = find((h) => h.startsWith("nat"));
    if (natCol < 0) natCol = find((h) => h === "region");
    let rateCol = find((h) => noSpace(h).includes("roomrate") && !h.includes("total") && !h.includes("usd"));
    if (rateCol < 0) rateCol = find((h) => h.includes("rate") && !h.includes("plan") && !h.includes("code") && !h.includes("total") && !h.includes("usd"));

    const groups = new Map<string, Rec[]>();
    let res = 0, nights = 0, rev = 0, bwN = 0, bwLead = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const resIdRaw = ci.resId >= 0 ? r[ci.resId] : null;
      const guest = ci.guest >= 0 ? r[ci.guest] : null;
      if ((resIdRaw == null || resIdRaw === "") && (guest == null || guest === "")) continue;
      if (isSep(resIdRaw) || isSep(guest)) continue;

      const nat = natCol >= 0 && r[natCol] ? String(r[natCol]).trim().toUpperCase().slice(0, 3) : null;
      const agentRaw = ci.agent >= 0 && r[ci.agent] ? String(r[ci.agent]) : null;
      let stay = cleanNum(ci.stay >= 0 ? r[ci.stay] : null);
      if (stay == null || stay < 1 || stay > 120) stay = nightsFromDates(ws, i, ci.arr, ci.dep) ?? 1;
      const rate = cleanNum(rateCol >= 0 ? r[rateCol] : null);
      const rtRaw = ci.rt >= 0 ? r[ci.rt] : null;
      const rtValue = rtRaw != null && String(rtRaw).trim() && !isSep(rtRaw) ? rtRaw : null;
      const { base, name } = normalizeRoomType(meta.property, rtValue);
      const agent = cleanAgent(agentRaw);

      const resId = resIdRaw != null && resIdRaw !== "" ? String(resIdRaw) : `__r${i}`;
      const g = groups.get(resId) ?? [];
      g.push({ resId, base, roomName: name, nat, segment: normalizeSegment(agentRaw), agent, stay, revenue: rate ? rate * stay : 0 });
      groups.set(resId, g);

      // Booking window — per room row, when both dates are present.
      const arr = cellDate(ws, i, ci.arr);
      const cre = cellDate(ws, i, ci.created);
      if (arr && cre) {
        let lead = Math.round((arr.getTime() - cre.getTime()) / 86_400_000);
        if (lead < 0) lead = 0; if (lead > LEAD_CAP) lead = LEAD_CAP;
        const bkey = `${meta.property}|${ym}|${agent}`;
        const a = bw.get(bkey) ?? bwEmpty(meta.property, monthSql, agent);
        addLead(a, lead); bw.set(bkey, a);
        bwN++; bwLead += lead;
      }
    }

    const month = monthSql;
    for (const recs of Array.from(groups.values())) {
      const bases = new Set(recs.map((x) => x.base));
      const combo = combinedNameFor(meta.property, bases);
      for (const rec of recs) {
        const roomType = combo && (rec.base === combo.a || rec.base === combo.b) ? combo.name : rec.roomName;
        addFact(meta.property, month, rec, roomType);
        res++; nights += rec.stay; rev += rec.revenue;
      }
    }
    perMonth.push({ key: `${meta.property} ${ym}`, res, nights, rev, bwN, bwLead });
    console.log(`  • ${sn} → ${meta.property} ${ym}: ${res} bookings, ${nights} nights, ${bwN} with booking window`);
  }

  // ----- write the dumps (replace touched months, keep the rest byte-identical) -----
  let idc = 0;
  const genId = (p: string) => `${p}${Date.now().toString(36)}${(idc++).toString(36).padStart(5, "0")}`;
  const q = (v: string | null) => (v == null || v === "" ? "NULL" : `'${v.replace(/'/g, "''")}'`);

  const rfLines = Array.from(facts.values())
    .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode) || a.month.localeCompare(b.month))
    .map((f) => `INSERT INTO public."ReservationFact" (id, "propertyCode", month, nationality, "marketSegment", agent, reservations, "roomNights", revenue, "roomType") VALUES (` +
      `'${genId("rfa")}', '${f.propertyCode}', '${f.month}', ${q(f.nationality)}, ${q(f.marketSegment)}, ${q(f.agent)}, ${f.reservations}, ${Math.round(f.roomNights)}, ${f.revenue.toFixed(2)}, ${q(f.roomType)});`);

  const bwLines = Array.from(bw.values())
    .filter((a) => a.reservations > 0)
    .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode) || a.month.localeCompare(b.month) || String(a.agent).localeCompare(String(b.agent)))
    .map((a) => `INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES (` +
      `'${genId("bwa")}', '${a.propertyCode}', '${a.month}', ${q(a.agent)}, ${a.reservations}, ${a.leadDaysSum}, ${a.b0_7}, ${a.b8_30}, ${a.b31_60}, ${a.b61_90}, ${a.b91plus});`);

  const fragments = Array.from(touched).map((t) => { const [p, m] = t.split("|"); return `'${p}', '${m}'`; });
  const spliceInto = (path: string, newLines: string[]) => {
    const lines = fs.readFileSync(path, "utf8").split("\n");
    const kept = lines.filter((ln) => !(ln.startsWith("INSERT INTO") && fragments.some((fr) => ln.includes(fr))));
    const ci = kept.findIndex((ln) => ln.trim() === "COMMIT;");
    const at = ci >= 0 ? ci : kept.length;
    kept.splice(at, 0, ...newLines);
    fs.writeFileSync(path, kept.join("\n"));
  };
  spliceInto(RF_DUMP, rfLines);
  spliceInto(BW_DUMP, bwLines);

  console.log(`\nTouched months: ${Array.from(touched).map((t) => t.replace("|", " ").replace("-01 00:00:00", "")).sort().join(", ")}`);
  console.log(`ReservationFact: +${rfLines.length} rows → ${RF_DUMP}`);
  console.log(`BookingWindowFact: +${bwLines.length} rows → ${BW_DUMP}`);
  console.log("\nPer month:");
  for (const m of perMonth) console.log(`  ${m.key.padEnd(12)} ${String(m.res).padStart(4)} bookings · ${String(m.nights).padStart(5)} nights · Rp ${Math.round(m.rev).toLocaleString("en-US").padStart(14)} · avg lead ${m.bwN ? (m.bwLead / m.bwN).toFixed(1) : "—"}d`);
}

main();
