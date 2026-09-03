/**
 * Archetype B importer — daily "Room Rev" sheets.
 *
 * Reads a per-property daily workbook (e.g. Daily_Reservation_Report_BKDS_2026.xlsx),
 * finds every "… Room Rev …" sheet, and loads the daily
 *   Date | Room Nights | Revenue | ADR
 * grid into the DailyStat table (authoritative revenue / occupancy source).
 *
 * Usage:
 *   npx tsx scripts/import-roomrev.ts <file.xlsx> [PROPERTY_CODE]
 * PROPERTY_CODE is inferred from the filename when omitted (BKDS/BKDU/BKV).
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { detectProperty, monthNumber, cleanNum } from "../src/lib/ingest/parse";

// Load DATABASE_URL from .env (tsx doesn't do this automatically).
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

type DailyRow = { date: Date; roomNights: number; revenue: number; adr: number | null };

function parseSheetMonthYear(sheetName: string, headerText: string): { y: number; m: number } | null {
  // Prefer the header cell, e.g. "Date of Jan 2026"; fall back to the sheet name.
  for (const src of [headerText, sheetName]) {
    if (!src) continue;
    const mo = src.match(/([A-Za-z]{3,9})/g);
    const yr = src.match(/(20\d{2})|['’](\d{2})|\b(\d{2})\b/);
    let month: number | null = null;
    if (mo) for (const tok of mo) { const n = monthNumber(tok); if (n) { month = n; break; } }
    let year: number | null = null;
    const y4 = src.match(/20\d{2}/);
    if (y4) year = parseInt(y4[0], 10);
    else { const y2 = src.match(/['’](\d{2})/); if (y2) year = 2000 + parseInt(y2[1], 10); }
    if (month && year) return { y: year, m: month };
    if (month && !year) return { y: 2026, m: month }; // these workbooks are 2026
  }
  return null;
}

function findHeaderRow(rows: unknown[][]): { idx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const cells = (rows[i] || []).map((c) => String(c ?? "").toLowerCase());
    const dateCol = cells.findIndex((c) => c.includes("date"));
    const rnCol = cells.findIndex((c) => c.includes("room night") || c === "room nights");
    const revCol = cells.findIndex((c) => c.includes("revenue"));
    const adrCol = cells.findIndex((c) => c.trim() === "adr" || c.includes("adr"));
    if (dateCol >= 0 && rnCol >= 0 && revCol >= 0) {
      return { idx: i, cols: { date: dateCol, rn: rnCol, rev: revCol, adr: adrCol } };
    }
  }
  return null;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/import-roomrev.ts <file.xlsx> [PROPERTY]");
  const property = (process.argv[3] || detectProperty(file) || "").toUpperCase();
  if (!["BKDS", "BKDU", "BKV"].includes(property))
    throw new Error(`Could not determine property from "${file}". Pass it explicitly: … ${file} BKDS`);

  const prop = await prisma.property.findUnique({ where: { code: property } });
  const roomsAvailable = prop?.roomsAvailable ?? null;

  const wb = XLSX.readFile(file, { cellDates: true });
  const revSheets = wb.SheetNames.filter((n) => /room\s*rev/i.test(n));
  console.log(`\n${property}: ${revSheets.length} "Room Rev" sheets in ${file}`);

  let inserted = 0;
  const collected: DailyRow[] = [];
  for (const sn of revSheets) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });
    const header = findHeaderRow(rows);
    if (!header) { console.log(`  ⚠ ${sn}: no Date/Room Nights/Revenue header — skipped`); continue; }
    const my = parseSheetMonthYear(sn, String((rows[header.idx] || [])[header.cols.date] ?? ""));
    if (!my) { console.log(`  ⚠ ${sn}: could not read month/year — skipped`); continue; }

    let count = 0;
    for (let i = header.idx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const day = Math.round(cleanNum(r[header.cols.date]) ?? NaN);
      if (!(day >= 1 && day <= 31)) continue; // skips totals / blank rows
      const roomNights = cleanNum(r[header.cols.rn]);
      const revenue = cleanNum(r[header.cols.rev]);
      if (roomNights === null || revenue === null) continue;
      const adr = header.cols.adr >= 0 ? cleanNum(r[header.cols.adr]) : null;
      collected.push({
        date: new Date(Date.UTC(my.y, my.m - 1, day)),
        roomNights,
        revenue,
        adr: adr ?? (roomNights > 0 ? revenue / roomNights : null),
      });
      count++;
    }
    console.log(`  • ${sn} → ${String(my.y)}-${String(my.m).padStart(2, "0")}: ${count} days`);
  }

  for (const d of collected) {
    const occ = roomsAvailable ? (d.roomNights / roomsAvailable) * 100 : null;
    const revpar = roomsAvailable ? d.revenue / roomsAvailable : null;
    await prisma.dailyStat.upsert({
      where: { propertyCode_date: { propertyCode: property, date: d.date } },
      update: { roomNights: d.roomNights, revenue: d.revenue, adr: d.adr, roomsAvailable, occupancyPct: occ, revpar },
      create: {
        propertyCode: property, date: d.date, roomNights: d.roomNights, revenue: d.revenue,
        adr: d.adr, roomsAvailable, occupancyPct: occ, revpar, sourceFileId: `roomrev:${file.split("/").pop()}`,
      },
    });
    inserted++;
  }
  console.log(`  ✓ ${property}: ${inserted} daily rows upserted` + (roomsAvailable ? ` (occupancy on ${roomsAvailable} rooms)` : " (no room count yet → occupancy pending)"));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
