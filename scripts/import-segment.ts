/**
 * Archetype C importer — "Market segment" budget-vs-actual matrix.
 *
 * Layout: row with month headers (each month spans 3 columns Budget · Actual ·
 * Rev Budget), a sub-header row, then one segment per row. Loads into
 * SegmentActual (property, month, segment, budgetRooms, actualRooms, revBudget).
 *
 * These are the planning segments as written on the budget sheet (WALK IN,
 * DIRECT BOOKING, WEBSITE, OTA, Local TA, Overseas TA, B2B, …) — kept as-is so
 * budget lines up with how it was planned.
 *
 * Usage:  npx tsx scripts/import-segment.ts <file.xlsx> [PROPERTY] [YEAR]
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { detectProperty, monthNumber, cleanNum } from "../src/lib/ingest/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function cleanSegment(raw: string): string {
  // Keep the plan's own label verbatim (just tidy whitespace). We do NOT strip
  // the parenthetical: some properties split a channel into distinct budget
  // lines — e.g. BKDU has both "OTA (Online Travel Agent)" and "OTA (Wellness)"
  // — and collapsing them to "OTA" would merge two different segments and lose
  // a row to the (property, month, segment) unique key.
  return raw.replace(/\s+/g, " ").trim();
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/import-segment.ts <file.xlsx> [PROPERTY] [YEAR]");
  const property = (process.argv[3] || detectProperty(file) || "").toUpperCase();
  if (!["BKDS", "BKDU", "BKV"].includes(property)) throw new Error(`Could not determine property from "${file}". Pass it explicitly.`);
  const year = parseInt(process.argv[4] || "2026", 10);

  const wb = XLSX.readFile(file, { cellDates: true });
  const sheetName = wb.SheetNames.find((n) => /market\s*segment/i.test(n));
  if (!sheetName) throw new Error("No 'Market segment' sheet found.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });

  // month header row: the one with the most month names
  let mrow = -1, best = 0;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const cnt = (rows[i] || []).filter((c) => monthNumber(String(c ?? ""))).length;
    if (cnt > best) { best = cnt; mrow = i; }
  }
  if (mrow < 0 || best < 6) throw new Error("Could not locate the month header row.");

  const monthCols: { col: number; month: number }[] = [];
  (rows[mrow] || []).forEach((c, idx) => { const m = monthNumber(String(c ?? "")); if (m && idx > 0) monthCols.push({ col: idx, month: m }); });

  // The sheet stacks TWO tables: block 1 (BUDGET · ACTUAL · REV BUDGET, i.e.
  // rooms & revenue budget) and, below it, a second block keyed by the same
  // segment names holding a rate/ADR view (BUDGET · ACTUAL only). We ingest ONLY
  // block 1: read from the header down to its TOTAL row and stop there, so a
  // second "Market Segment" header or the ADR block can never leak in.
  const data: { propertyCode: string; month: Date; segment: string; budgetRooms: number | null; actualRooms: number | null; revBudget: number | null }[] = [];
  for (let i = mrow + 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const segRaw = r[0] ? String(r[0]) : "";
    if (!segRaw.trim()) continue;
    const segment = cleanSegment(segRaw);
    if (/^market\s*segment/i.test(segment)) break; // start of the 2nd (ADR) block
    if (/^(grand\s*total|total|gt)$/i.test(segment)) break; // TOTAL ends block 1
    if (/^(budget|actual|rev)/i.test(segment)) continue; // stray sub-header
    for (const mc of monthCols) {
      const budgetRooms = cleanNum(r[mc.col]);
      const actualRooms = cleanNum(r[mc.col + 1]);
      const revBudget = cleanNum(r[mc.col + 2]);
      if (budgetRooms == null && actualRooms == null && revBudget == null) continue;
      data.push({ propertyCode: property, month: new Date(Date.UTC(year, mc.month - 1, 1)), segment, budgetRooms, actualRooms, revBudget });
    }
  }

  await prisma.segmentActual.deleteMany({ where: { propertyCode: property } });
  for (let i = 0; i < data.length; i += 500) {
    await prisma.segmentActual.createMany({
      data: data.slice(i, i + 500).map((d) => ({ ...d, budgetRooms: d.budgetRooms == null ? null : Math.round(d.budgetRooms), actualRooms: d.actualRooms == null ? null : Math.round(d.actualRooms) })),
      skipDuplicates: true,
    });
  }
  const segs = new Set(data.map((d) => d.segment));
  console.log(`  ✓ ${property} ${year}: ${data.length} segment-month rows (${segs.size} segments) from "${sheetName.trim()}"`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
