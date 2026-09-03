/**
 * Archetype D importer — "PU" (pickup) sheets.
 *
 * Each PU sheet is named for the SNAPSHOT month (e.g. "JAN 2026 PU"). Rows are
 * snapshot days (1..31); columns JAN..DEC are target months; each cell is the
 * on-the-books (OTB) occupancy for that target month as known on that snapshot
 * day. We load every cell into PickupSnapshot
 *   (property, snapshotDate, targetMonth, otbOccupancy %)
 * which powers on-the-books curves and pace-vs-STLY.
 *
 * Usage:  npx tsx scripts/import-pickup.ts <file.xlsx> [PROPERTY]
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { detectProperty, monthNumber, cleanNum } from "../src/lib/ingest/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

type Snap = { snapshotDate: Date; targetMonth: Date; otb: number };

function sheetMonthYear(name: string): { y: number; m: number } | null {
  const toks = name.match(/[A-Za-z]{3,9}/g) || [];
  let m: number | null = null;
  for (const t of toks) { const n = monthNumber(t); if (n) { m = n; break; } }
  const y4 = name.match(/20\d{2}/);
  const y = y4 ? parseInt(y4[0], 10) : null;
  return m && y ? { y, m } : null;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/import-pickup.ts <file.xlsx> [PROPERTY]");
  const property = (process.argv[3] || detectProperty(file) || "").toUpperCase();
  if (!["BKDS", "BKDU", "BKV"].includes(property))
    throw new Error(`Could not determine property from "${file}". Pass it: … ${file} BKDS`);

  const wb = XLSX.readFile(file, { cellDates: true });
  const puSheets = wb.SheetNames.filter((n) => /\bPU\b/i.test(n));
  console.log(`\n${property}: ${puSheets.length} PU sheets in ${file.split("/").pop()}`);

  const snaps: Snap[] = [];
  for (const sn of puSheets) {
    const my = sheetMonthYear(sn);
    if (!my) { console.log(`  ⚠ ${sn}: no month/year — skipped`); continue; }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });

    // header row: has "date" + several month names
    let hi = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const cells = (rows[i] || []).map((c) => String(c ?? "").toLowerCase());
      const months = cells.filter((c) => monthNumber(c)).length;
      if (cells.some((c) => c.includes("date")) && months >= 6) { hi = i; break; }
    }
    if (hi < 0) { console.log(`  ⚠ ${sn}: no header — skipped`); continue; }

    const header = (rows[hi] || []).map((c) => String(c ?? "").toLowerCase());
    const dayCol = header.findIndex((c) => c.includes("date"));
    const monthCols: { col: number; month: number }[] = [];
    header.forEach((c, idx) => { const m = monthNumber(c); if (m && idx !== dayCol) monthCols.push({ col: idx, month: m }); });

    let count = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const day = Math.round(cleanNum(r[dayCol]) ?? NaN);
      if (!(day >= 1 && day <= 31)) continue; // skip "Average Pickup" etc.
      const snapshotDate = new Date(Date.UTC(my.y, my.m - 1, day));
      for (const mc of monthCols) {
        const v = cleanNum(r[mc.col]);
        if (v == null || v < 0) continue;
        const otb = v <= 1.5 ? v * 100 : v; // fractions → percent; some sheets already store percent
        if (otb > 200) continue; // skip stray non-occupancy values
        snaps.push({ snapshotDate, targetMonth: new Date(Date.UTC(my.y, mc.month - 1, 1)), otb });
        count++;
      }
    }
    console.log(`  • ${sn} → snap ${my.y}-${String(my.m).padStart(2, "0")}: ${count} cells`);
  }

  await prisma.pickupSnapshot.deleteMany({ where: { propertyCode: property } });
  const data = snaps.map((s) => ({ propertyCode: property, snapshotDate: s.snapshotDate, targetMonth: s.targetMonth, otbOccupancy: Math.round(s.otb * 1000) / 1000 }));
  for (let i = 0; i < data.length; i += 1000) await prisma.pickupSnapshot.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
  console.log(`  ✓ ${property}: ${data.length} pickup snapshots written.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
