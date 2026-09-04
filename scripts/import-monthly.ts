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
  if (!file) throw new Error("Usage: tsx scripts/import-monthly.ts <file.xlsx> [PROPERTY]");
  const property = (process.argv[3] || detectProperty(file) || "").toUpperCase();
  if (!["BKDS", "BKDU", "BKV"].includes(property)) throw new Error(`Could not determine property from "${file}". Pass it explicitly.`);

  const wb = XLSX.readFile(file, { cellDates: false });
  // PU sheets for 2026 (this year), keyed by their own month.
  const puSheets: { month: number; name: string }[] = [];
  for (const n of wb.SheetNames) {
    const low = n.toLowerCase();
    if (low.includes("pu") && low.includes("2026") && !low.includes("2025")) {
      const mo = monthOf(low.split("pu")[0]) ?? monthOf(low.replace(/2026|pu/g, " "));
      if (mo) puSheets.push({ month: mo, name: n });
    }
  }
  puSheets.sort((a, b) => a.month - b.month);
  if (puSheets.length === 0) throw new Error("No 'PU 2026' sheets found.");
  const latest = puSheets[puSheets.length - 1];
  const year = 2026;

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
    return { rows, cols, bcols, bi, pick };
  };

  const actualFor = (s: ReturnType<typeof parseSheet>, mo: number): Fig => ({
    occ: asPct(s.pick((l) => l === "occ on hand", s.cols, mo)),
    rooms: (() => { const r = s.pick((l) => l.startsWith("room sold"), s.cols, mo); return r == null ? null : Math.round(r); })(),
    adr: s.pick((l) => l === "adr", s.cols, mo),
    rev: s.pick((l) => l.includes("revenue nett") || l === "revenue net", s.cols, mo),
  });
  const budgetFor = (s: ReturnType<typeof parseSheet>, mo: number): Fig => ({
    occ: asPct(s.pick((l) => l.startsWith("occ"), s.bcols, mo, s.bi + 1, s.bi + 6)),
    rooms: (() => { const r = s.pick((l) => l.startsWith("room sold"), s.bcols, mo, s.bi + 1, s.bi + 6); return r == null ? null : Math.round(r); })(),
    adr: s.pick((l) => l === "adr", s.bcols, mo, s.bi + 1, s.bi + 6),
    rev: s.pick((l) => l.startsWith("revenue"), s.bcols, mo, s.bi + 1, s.bi + 6),
  });

  const data = new Map<number, { actual: Fig; budget: Fig; otb: Fig }>();
  const get = (mo: number) => {
    if (!data.has(mo)) data.set(mo, { actual: emptyFig(), budget: emptyFig(), otb: emptyFig() });
    return data.get(mo)!;
  };

  // Each sheet contributes its own month's actual + budget.
  for (const { month, name } of puSheets) {
    const s = parseSheet(name);
    get(month).actual = actualFor(s, month);
    get(month).budget = budgetFor(s, month);
  }
  // The latest sheet contributes on-the-books for every month from itself onward.
  const ls = parseSheet(latest.name);
  for (let mo = latest.month; mo <= 12; mo++) get(mo).otb = actualFor(ls, mo);

  const rows = Array.from(data.entries()).map(([mo, d]) => ({
    propertyCode: property,
    month: new Date(Date.UTC(year, mo - 1, 1)),
    actualOcc: d.actual.occ, actualRooms: d.actual.rooms, actualAdr: d.actual.adr, actualRevenue: d.actual.rev,
    budgetOcc: d.budget.occ, budgetRooms: d.budget.rooms, budgetAdr: d.budget.adr, budgetRevenue: d.budget.rev,
    otbOcc: d.otb.occ, otbRooms: d.otb.rooms, otbAdr: d.otb.adr, otbRevenue: d.otb.rev,
    sourceFileId: `monthly:${file.split("/").pop()}`,
  }));

  return prisma.monthlyStat.deleteMany({ where: { propertyCode: property } })
    .then(() => prisma.monthlyStat.createMany({ data: rows, skipDuplicates: true }))
    .then(() => console.log(`  ✓ ${property}: ${rows.length} monthly rows (latest PU: ${latest.name.trim()}) — actual, budget & on-the-books`));
}

Promise.resolve().then(main).catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
