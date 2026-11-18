/**
 * Forward on-the-books importer — extends the "On the books" cards to a longer
 * horizon. The latest PU sheet's "Occ on Hand" summary block carries Occ / Room
 * Sold / ADR / Revenue Nett for every forward month (the PU month onward, rolling
 * into next year). import-monthly only records the planning year (2026), so the
 * cards stop at December. This reads that block and upserts MonthlyStat.otb* for
 * the next MONTHS months, creating the next-year rows as OTB-only (actual/budget
 * stay null, which every other page already ignores).
 *
 * Usage:  npx tsx scripts/import-forward-otb.ts <file.xlsx> <PROPERTY> [MONTHS]
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { detectProperty, monthNumber, cleanNum } from "../src/lib/ingest/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const lc = (v: unknown) => String(v ?? "").toLowerCase().trim();

async function main() {
  const file = process.argv[2];
  const property = (process.argv[3] || detectProperty(file) || "").toUpperCase();
  const MONTHS = Math.max(1, Math.min(12, parseInt(process.argv[4] || "6", 10)));
  if (!file || !property) throw new Error("Usage: tsx scripts/import-forward-otb.ts <file.xlsx> <PROPERTY> [MONTHS]");

  const wb = XLSX.readFile(file, { cellDates: true });
  // Latest "<Month> PU <year>" sheet (not a Room Rev sheet). Prefer the newest year, then month.
  const puSheets = wb.SheetNames
    .map((n) => ({ n, mo: monthNumber(n), yr: (n.match(/20\d{2}/) || [])[0] ? parseInt((n.match(/20\d{2}/) as RegExpMatchArray)[0], 10) : null }))
    .filter((s) => s.mo && s.yr && /\bpu\b/i.test(s.n) && !/room\s*rev/i.test(s.n));
  if (!puSheets.length) throw new Error("No PU sheet found");
  puSheets.sort((a, b) => (b.yr! - a.yr!) || (b.mo! - a.mo!));
  const latest = puSheets[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[latest.n], { header: 1, raw: false, defval: null });

  // Find the main "Occ on Hand" summary block, then the Room Sold / ADR / Revenue rows under it.
  const occRow = rows.findIndex((r) => lc((r || [])[0]).includes("occ on hand"));
  if (occRow < 0) throw new Error(`No "Occ on Hand" row in ${latest.n}`);
  const findNear = (sub: string) => { for (let i = occRow + 1; i < Math.min(occRow + 6, rows.length); i++) if (lc((rows[i] || [])[0]).includes(sub)) return i; return -1; };
  const roomsRow = findNear("room sold"), adrRow = findNear("adr"), revRow = findNear("revenue");

  const occCells = rows[occRow] || [];
  const roomsCells = roomsRow >= 0 ? rows[roomsRow] || [] : [];
  const adrCells = adrRow >= 0 ? rows[adrRow] || [] : [];
  const revCells = revRow >= 0 ? rows[revRow] || [] : [];

  const src = `forward:${file.split("/").pop()}`;
  const out: { month: Date; occ: number | null; rooms: number | null; adr: number | null; rev: number | null }[] = [];
  for (let j = 0; j < MONTHS; j++) {
    const col = j + 1; // col 0 is the row label; month columns start at 1
    const mIdx = latest.mo! - 1 + j;
    const month = new Date(Date.UTC(latest.yr! + Math.floor(mIdx / 12), mIdx % 12, 1));
    out.push({
      month,
      occ: cleanNum(occCells[col]),
      rooms: cleanNum(roomsCells[col]) != null ? Math.round(cleanNum(roomsCells[col])!) : null,
      adr: cleanNum(adrCells[col]),
      rev: cleanNum(revCells[col]),
    });
  }

  for (const r of out) {
    if (r.occ == null) continue;
    await prisma.monthlyStat.upsert({
      where: { propertyCode_month: { propertyCode: property, month: r.month } },
      update: { otbOcc: r.occ, otbRooms: r.rooms, otbAdr: r.adr, otbRevenue: r.rev },
      create: { propertyCode: property, month: r.month, otbOcc: r.occ, otbRooms: r.rooms, otbAdr: r.adr, otbRevenue: r.rev, sourceFileId: src },
    });
  }
  const tag = (d: Date) => d.toISOString().slice(0, 7);
  console.log(`  ✓ ${property} (${latest.n.trim()}): forward OTB for ${out.map((r) => `${tag(r.month)}=${r.occ == null ? "—" : r.occ + "%"}`).join("  ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
