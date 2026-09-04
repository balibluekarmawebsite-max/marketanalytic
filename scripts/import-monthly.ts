/**
 * Monthly actuals / budget / on-the-books importer — reads the authoritative
 * per-month figures straight from each "<Month> PU 2026" sheet:
 *
 *   • Actuals  → the month's OWN sheet, own-month column of: Occ on Hand,
 *     Room Sold, ADR, Revenue Nett.
 *   • Budget   → the "Budget" block of the sheet (Occ % / ADR / Revenue / Room
 *     sold), own-month column.
 *   • On-the-books (forward) → the LATEST PU sheet's forward columns (Occ on
 *     Hand / ADR / Revenue Nett / Room Sold), for each month from that month on.
 *
 * Loads MonthlyStat (property, month, actual*, budget*, otb*). Same basis on
 * both sides, so budget-vs-actual lines up.
 *
 * Usage:  npx tsx scripts/import-monthly.ts <file.xlsx> [PROPERTY]
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { detectProperty, cleanNum } from "../src/lib/ingest/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

// Robust month parser for headers and sheet names ("Aug", "SEPT", "June"…).
function monthOf(raw: unknown): number | null {
  const s = String(raw ?? "").trim().toLowerCase();
  const keys: [string, number][] = [
    ["sept", 9], ["sep", 9], ["june", 6], ["jun", 6], ["july", 7], ["jul", 7],
    ["jan", 1], ["feb", 2], ["mar", 3], ["apr", 4], ["may", 5], ["aug", 8],
    ["oct", 10], ["nov", 11], ["dec", 12],
  ];
  for (const [k, v] of keys) if (s.startsWith(k)) return v;
  return null;
}

const label = (row: unknown[]): string => String(row?.[0] ?? "").trim().toLowerCase();

// month number → first column carrying it in a header row.
function monthCols(row: unknown[]): Map<number, number> {
  const m = new Map<number, number>();
  row.forEach((v, j) => {
    if (j === 0 || v == null) return;
    const mo = monthOf(v);
    if (mo && !m.has(mo)) m.set(mo, j);
  });
  return m;
}

// Occupancy comes as a fraction (0.92) — store as percent. Guard values already
// in percent form.
const asPct = (v: number | null): number | null => (v == null ? null : v <= 2 ? v * 100 : v);

type Fig = { occ: number | null; rooms: number | null; adr: number | null; rev: number | null };
const emptyFig = (): Fig => ({ occ: null, rooms: null, adr: null, rev: null });

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/import-monthly.ts <file.xlsx> [PROPERTY] [YEARS]");
  const property = (process.argv[3] || detectProperty(file) || "").toUpperCase();
  if (!["BKDS", "BKDU", "BKV"].includes(property)) throw new Error(`Could not determine property from "${file}". Pass it explicitly.`);
  // Optional comma-separated year filter (e.g. "2024") — import only those years'
  // PU sheets. Without it, every year present in the file is imported.
  const yearsArg = (process.argv[4] || "").trim();
  const yearFilter = yearsArg ? new Set(yearsArg.split(",").map((y) => parseInt(y, 10))) : null;

  const wb = XLSX.readFile(file, { cellDates: false });
  // All PU sheets, keyed by (year, month). Skip "(1)" duplicate copies; keep the
  // first sheet seen for a given year+month.
  const puAll: { year: number; month: number; name: string }[] = [];
  const seen = new Set<string>();
  for (const n of wb.SheetNames) {
    const low = n.toLowerCase();
    if (!low.includes("pu") || low.includes("(1)")) continue;
    const ym = low.match(/20\d\d/);
    if (!ym) continue;
    const y = parseInt(ym[0], 10);
    if (yearFilter && !yearFilter.has(y)) continue;
    const mo = monthOf(low.split("pu")[0]) ?? monthOf(low.replace(/20\d\d|pu/g, " "));
    if (!mo) continue;
    const key = `${y}-${mo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    puAll.push({ year: y, month: mo, name: n });
  }
  puAll.sort((a, b) => a.year - b.year || a.month - b.month);
  if (puAll.length === 0) throw new Error("No matching 'PU' sheets found.");
  const pu2026 = puAll.filter((p) => p.year === 2026);
  const latest2026 = pu2026.length ? pu2026[pu2026.length - 1] : null;

  // Parse one PU sheet into: header cols + a value lookup by (row-predicate, month).
  const parseSheet = (name: string) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    let hi = -1;
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      if (label(rows[i]).startsWith("date") && monthCols(rows[i]).size >= 6) { hi = i; break; }
    }
    const cols = hi >= 0 ? monthCols(rows[hi]) : new Map<number, number>();
    // Budget block header (col0 starts "budget"), with its own month columns.
    let bi = -1;
    for (let i = 0; i < rows.length; i++) if (label(rows[i]).startsWith("budget")) { bi = i; break; }
    const bcols = bi >= 0 ? monthCols(rows[bi]) : new Map<number, number>();

    const pick = (rowPred: (l: string) => boolean, colMap: Map<number, number>, mo: number, from = 0, to = rows.length): number | null => {
      for (let i = from; i < Math.min(to, rows.length); i++) {
        if (rowPred(label(rows[i]))) {
          const c = colMap.get(mo);
          return c != null ? cleanNum((rows[i] || [])[c]) : null;
        }
      }
      return null;
    };
    return { rows, cols, bcols, bi, pick, hdr: hi >= 0 ? (rows[hi] as unknown[]) : [] };
  };

  const actualFor = (s: ReturnType<typeof parseSheet>, mo: number, colMap: Map<number, number> = s.cols): Fig => ({
    occ: asPct(s.pick((l) => l === "occ on hand", colMap, mo)),
    rooms: (() => { const r = s.pick((l) => l.startsWith("room sold"), colMap, mo); return r == null ? null : Math.round(r); })(),
    adr: s.pick((l) => l === "adr", colMap, mo),
    rev: s.pick((l) => l.includes("revenue nett") || l === "revenue net", colMap, mo),
  });
  const budgetFor = (s: ReturnType<typeof parseSheet>, mo: number): Fig => ({
    occ: asPct(s.pick((l) => l.startsWith("occ"), s.bcols, mo, s.bi + 1, s.bi + 6)),
    rooms: (() => { const r = s.pick((l) => l.startsWith("room sold"), s.bcols, mo, s.bi + 1, s.bi + 6); return r == null ? null : Math.round(r); })(),
    adr: s.pick((l) => l === "adr", s.bcols, mo, s.bi + 1, s.bi + 6),
    rev: s.pick((l) => l.startsWith("revenue"), s.bcols, mo, s.bi + 1, s.bi + 6),
  });

  // Actuals for every (year, month); budget only for 2026 (the planning year).
  const rowMap = new Map<string, { year: number; month: number; actual: Fig; budget: Fig; otb: Fig }>();
  for (const { year: y, month, name } of puAll) {
    const s = parseSheet(name);
    rowMap.set(`${y}-${month}`, {
      year: y, month,
      actual: actualFor(s, month),
      budget: y === 2026 ? budgetFor(s, month) : emptyFig(),
      otb: emptyFig(),
    });
  }

  // On-the-books for 2026 forward months from the latest 2026 sheet. A FORWARD
  // column map (columns at/after the sheet's own month) keeps a header that
  // repeats the prior month at the far end from being read as a forward month.
  if (latest2026) {
    const ls = parseSheet(latest2026.name);
    const ownCol = ls.cols.get(latest2026.month) ?? 1;
    const fwdCols = new Map<number, number>();
    ls.hdr.forEach((v, j) => { if (j === 0 || v == null || j < ownCol) return; const mo = monthOf(v); if (mo && !fwdCols.has(mo)) fwdCols.set(mo, j); });
    for (let mo = latest2026.month; mo <= 12; mo++) {
      const key = `2026-${mo}`;
      const r = rowMap.get(key) ?? { year: 2026, month: mo, actual: emptyFig(), budget: emptyFig(), otb: emptyFig() };
      r.otb = actualFor(ls, mo, fwdCols);
      rowMap.set(key, r);
    }
  }

  const src = `monthly:${file.split("/").pop()}`;
  const rows = Array.from(rowMap.values()).map((d) => ({
    propertyCode: property,
    month: new Date(Date.UTC(d.year, d.month - 1, 1)),
    actualOcc: d.actual.occ, actualRooms: d.actual.rooms, actualAdr: d.actual.adr, actualRevenue: d.actual.rev,
    budgetOcc: d.budget.occ, budgetRooms: d.budget.rooms, budgetAdr: d.budget.adr, budgetRevenue: d.budget.rev,
    otbOcc: d.otb.occ, otbRooms: d.otb.rooms, otbAdr: d.otb.adr, otbRevenue: d.otb.rev,
    sourceFileId: src,
  }));

  const months = rows.map((r) => r.month);
  const years = Array.from(new Set(rows.map((r) => r.month.getUTCFullYear()))).sort();
  // Delete only the months we're (re)importing, so other years stay intact.
  return prisma.monthlyStat.deleteMany({ where: { propertyCode: property, month: { in: months } } })
    .then(() => prisma.monthlyStat.createMany({ data: rows, skipDuplicates: true }))
    .then(() => console.log(`  ✓ ${property}: ${rows.length} monthly rows for ${years.join(", ")}${latest2026 ? ` (2026 budget/OTB from ${latest2026.name.trim()})` : ""}`));
}

Promise.resolve().then(main).catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
