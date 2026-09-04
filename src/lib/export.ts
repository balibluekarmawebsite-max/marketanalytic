import { getOverview, getPropertyComparison, getBudgetVsActual, getPickupDetail } from "@/lib/analytics";
import { getPropertyAnalytics, type Dim } from "@/lib/property-analytics";
import { countryName } from "@/lib/countries";

// Builders that turn dashboard data into spreadsheet-ready sheets. Each sheet is
// an array-of-arrays (first row = headers); numbers stay numbers so Excel can do
// maths on them. The API route renders these to CSV (first sheet) or XLSX (all).

export type Cell = string | number | null;
export type Sheet = { name: string; aoa: Cell[][] };
export type Workbook = { filename: string; sheets: Sheet[] };

const PROPS = ["BKDS", "BKDU", "BKV"];
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
const stamp = () => new Date().toISOString().slice(0, 10);

async function overviewSheet(): Promise<Sheet> {
  const o = await getOverview();
  const aoa: Cell[][] = [["Property", "Month", "Room nights", "Room revenue (IDR)", "ADR (IDR)", "Occupancy %"]];
  for (const p of o.properties) {
    for (const m of p.months) {
      if (m.days === 0) continue;
      aoa.push([p.code, m.month, m.roomNights, Math.round(m.revenue), m.adr == null ? null : Math.round(m.adr), r2(m.occupancyPct)]);
    }
  }
  return { name: "Group monthly", aoa };
}

async function comparisonSheet(period: string): Promise<Sheet> {
  const c = await getPropertyComparison(period);
  const aoa: Cell[][] = [["Property", "Name", "City", "Room revenue (IDR)", "Room nights", "ADR (IDR)", "Occupancy %", "RevPAR (IDR)", "Pace vs LY (pts)", "Pace month", "Top segment", "Top nationality"]];
  for (const r of c.rows) {
    aoa.push([
      r.code, r.name, r.city, Math.round(r.revenue), r.roomNights,
      r.adr == null ? null : Math.round(r.adr), r2(r.occupancyPct),
      r.revpar == null ? null : Math.round(r.revpar), r2(r.paceDelta), r.paceMonth,
      r.topSegment?.key ?? null, r.topNationality ? countryName(r.topNationality.key) : null,
    ]);
  }
  return { name: `Comparison ${c.periodLabel}`.slice(0, 31), aoa };
}

async function budgetSheet(code: string, period: string): Promise<Sheet> {
  const b = await getBudgetVsActual(code, period);
  const aoa: Cell[][] = [["Segment", "Budget rooms", "Actual rooms", "Variance", "Achieved %", "Rev budget (IDR)"]];
  if (b) {
    for (const s of b.segments) aoa.push([s.segment, s.budgetRooms, s.actualRooms, s.varianceRooms, r2(s.achievedPct), s.revBudget == null ? null : Math.round(s.revBudget)]);
    aoa.push(["TOTAL", b.totals.budgetRooms, b.totals.actualRooms, b.totals.varianceRooms, r2(b.totals.achievedPct), Math.round(b.totals.revBudget)]);
  }
  return { name: `Budget ${code}`, aoa };
}

async function paceSheet(code: string): Promise<Sheet> {
  const d = await getPickupDetail(code);
  const aoa: Cell[][] = [["Month", "On the books %", "Pickup 7d (pts)", "Pickup 30d (pts)", "Last year %", "Pace (pts)"]];
  if (d) for (const m of d.months) aoa.push([m.month, r2(m.otbNow), r2(m.pickup7), r2(m.pickup30), r2(m.stly), r2(m.paceDelta)]);
  return { name: `Pace ${code}`, aoa };
}

function dimSheet(name: string, dims: Dim[], nameFn?: (k: string) => string): Sheet {
  const aoa: Cell[][] = [[name, "Bookings", "Room nights", "Revenue (IDR)"]];
  for (const d of dims) aoa.push([nameFn ? nameFn(d.key) : d.key, d.reservations, Math.round(d.roomNights), Math.round(d.revenue)]);
  return { name: name.slice(0, 31), aoa };
}

async function guestSheets(code: string, period: string): Promise<Sheet[]> {
  const a = await getPropertyAnalytics(code, period);
  if (!a) return [];
  return [
    dimSheet("Nationality", a.nationalities, countryName),
    dimSheet("Market segment", a.segments),
    dimSheet("Agent", a.agents),
    dimSheet("Room type", a.roomTypes),
  ];
}

/** Build the sheets for a requested dataset. */
export async function buildExport(dataset: string, params: { p?: string; period?: string }): Promise<Workbook | null> {
  const period = params.period || "2026";
  const code = (params.p || "BKDS").toUpperCase();
  const valid = PROPS.includes(code);

  switch (dataset) {
    case "overview":
      return { filename: `blue-karma-group-monthly-${stamp()}`, sheets: [await overviewSheet()] };
    case "comparison":
      return { filename: `blue-karma-comparison-${period}-${stamp()}`, sheets: [await comparisonSheet(period)] };
    case "budget":
      if (!valid) return null;
      return { filename: `blue-karma-${code}-budget-${period}-${stamp()}`, sheets: [await budgetSheet(code, period)] };
    case "pace":
      if (!valid) return null;
      return { filename: `blue-karma-${code}-pace-${stamp()}`, sheets: [await paceSheet(code)] };
    case "guest":
      if (!valid) return null;
      return { filename: `blue-karma-${code}-guest-analytics-${period}-${stamp()}`, sheets: await guestSheets(code, period) };
    case "workbook": {
      const sheets: Sheet[] = [await overviewSheet(), await comparisonSheet(period)];
      for (const c of PROPS) sheets.push(await budgetSheet(c, period));
      for (const c of PROPS) sheets.push(await paceSheet(c));
      return { filename: `blue-karma-market-analytics-${stamp()}`, sheets };
    }
    default:
      return null;
  }
}

/** Render one sheet to CSV text (RFC-4180-ish). */
export function sheetToCsv(sheet: Sheet): string {
  const cell = (v: Cell) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return sheet.aoa.map((row) => row.map(cell).join(",")).join("\r\n");
}
