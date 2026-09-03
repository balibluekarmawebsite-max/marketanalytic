/**
 * Shared ingest helpers: property detection, month parsing, numeric cleaning,
 * and reservation sheet-name parsing. Used by the import scripts (and, later,
 * the in-app upload pipeline).
 */

export type PropertyCode = "BKDS" | "BKDU" | "BKV";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Month name/abbreviation → 1..12 (handles "Sept", "June", "APRIL", etc.). */
export function monthNumber(token: string | null | undefined): number | null {
  if (!token) return null;
  const key = String(token).trim().toLowerCase().slice(0, 3);
  return MONTHS[key] ?? null;
}

/** Detect BKDS / BKDU / BKV from any string (filename, sheet name, column). */
export function detectProperty(text: string | null | undefined): PropertyCode | null {
  if (!text) return null;
  const t = String(text).toUpperCase();
  if (/\bBKDS\b/.test(t) || t.includes("BKDS")) return "BKDS";
  if (/\bBKDU\b/.test(t) || t.includes("BKDU")) return "BKDU";
  if (t.includes("BKV") || t.includes("VILLAGE")) return "BKV";
  if (t.includes("UBUD")) return "BKDU";
  return null;
}

/**
 * Coerce a cell to a finite number. Accepts numbers and numeric strings
 * (stripping thousands separators); rejects Dates, blanks, and junk — so a
 * date accidentally sitting in a numeric column becomes null rather than a
 * bogus value.
 */
export function cleanNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  if (typeof v === "string") {
    const s = v.replace(/[, ]/g, "").replace(/[^\d.\-]/g, "");
    if (s === "" || s === "-" || s === ".") return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parse a reservation workbook sheet name into (property, year, month).
 * Handles the messy real-world variants:
 *   "2025 Jan BKV", "2026 BKDS JAN", "BKV  APR ,2026", "bkdu may 2026",
 *   "BKDS JUN,26 ", "BKDU JUL 2026 ".
 * Returns null for junk sheets (e.g. "Sheet1") so they can be skipped.
 */
export function parseReservationSheet(
  sheetName: string,
): { property: PropertyCode; year: number; month: number } | null {
  const property = detectProperty(sheetName);
  if (!property) return null;

  const tokens = sheetName.match(/[A-Za-z]{3,9}/g) || [];
  let month: number | null = null;
  for (const tok of tokens) {
    const m = monthNumber(tok);
    if (m) { month = m; break; }
  }
  if (!month) return null;

  let year: number | null = null;
  const y4 = sheetName.match(/20\d{2}/);
  if (y4) year = parseInt(y4[0], 10);
  else {
    const y2 = sheetName.match(/[,'’]\s*(\d{2})\b/) || sheetName.match(/\b(\d{2})\b/);
    if (y2) year = 2000 + parseInt(y2[1], 10);
  }
  // 2025 sheets are always explicitly labeled "2025"; an undated sheet is 2026.
  if (!year) year = 2026;

  return { property, year, month };
}
