import { getOverview, getPropertyComparison, getBudgetVsActualMonthly, getBusinessOverview, getPickupDetail } from "@/lib/analytics";
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
  const b = await getBudgetVsActualMonthly(code, period);
  const aoa: Cell[][] = [["Month", "Budget occ %", "Actual occ %", "Budget rooms", "Actual rooms", "Rooms achieved %", "Budget ADR", "Actual ADR", "Budget revenue", "Actual revenue", "Revenue achieved %"]];
  if (b) {
    for (const r of b.months) {
      aoa.push([
        r.month, r2(r.budgetOcc), r2(r.actualOcc), r.budgetRooms, r.actualRooms, r2(r.roomsAchieved),
        r.budgetAdr == null ? null : Math.round(r.budgetAdr), r.actualAdr == null ? null : Math.round(r.actualAdr),
        r.budgetRevenue == null ? null : Math.round(r.budgetRevenue), r.actualRevenue == null ? null : Math.round(r.actualRevenue), r2(r.revAchieved),
      ]);
    }
    const t = b.totals;
    aoa.push(["TOTAL", r2(t.avgBudgetOcc), r2(t.avgActualOcc), t.budgetRooms, t.actualRooms, r2(t.roomsAchieved), null, null, Math.round(t.budgetRevenue), Math.round(t.actualRevenue), r2(t.revAchieved)]);
  }
  return { name: `Budget ${code}`, aoa };
}

async function businessOverviewSheet(code: string): Promise<Sheet> {
  const bo = await getBusinessOverview(code);
  const aoa: Cell[][] = [["Month", "Occ 2026 %", "Occ 2025 %", "ADR 2026", "ADR 2025", "Revenue 2026", "Revenue 2025"]];
  if (bo) {
    for (const r of bo.months) {
      aoa.push([
        `2026-${String(r.month).padStart(2, "0")}`, r2(r.occ2026), r2(r.occ2025),
        r.adr2026 == null ? null : Math.round(r.adr2026), r.adr2025 == null ? null : Math.round(r.adr2025),
        r.rev2026 == null ? null : Math.round(r.rev2026), r.rev2025 == null ? null : Math.round(r.rev2025),
      ]);
    }
  }
  return { name: `Overview ${code}`, aoa };
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
      return { filename: `blue-karma-${code}-budget-${period}-${stamp()}`, sheets: [await budgetSheet(code, period), await businessOverviewSheet(code)] };
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
