import { getOverview, getPropertyComparison, getBudgetVsActualMonthly, getBusinessOverview, getPickupDetail, getRoomCategoryOccupancy } from "@/lib/analytics";
import { getPropertyAnalytics, type Dim, type PropertyAnalytics } from "@/lib/property-analytics";
import { countryName } from "@/lib/countries";
import { monthShort } from "@/lib/utils";

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
  const years = bo?.years ?? [];
  const header: Cell[] = ["Month", ...years.map((y) => `Occ ${y} %`), ...years.map((y) => `ADR ${y}`), ...years.map((y) => `Revenue ${y}`)];
  const aoa: Cell[][] = [header];
  if (bo) {
    for (const r of bo.months) {
      aoa.push([
        `${String(r.month).padStart(2, "0")}`,
        ...years.map((y) => r2(r.byYear[y]?.occ ?? null)),
        ...years.map((y) => { const v = r.byYear[y]?.adr; return v == null ? null : Math.round(v); }),
        ...years.map((y) => { const v = r.byYear[y]?.rev; return v == null ? null : Math.round(v); }),
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

async function roomCategorySheet(code: string, period: string): Promise<Sheet> {
  const rc = await getRoomCategoryOccupancy(code, period);
  const aoa: Cell[][] = [["Category", "Members", "Units", "Room nights sold", "Available room nights", "Occupancy %"]];
  if (rc) {
    for (const g of rc.groups) {
      aoa.push([g.label, g.members.map((m) => `${m.units} ${m.name}`).join("; "), g.units, g.soldNights, g.availableNights, r2(g.occPct)]);
    }
    aoa.push(["All rooms", "", rc.totalUnits, rc.soldNights, rc.availableNights, r2(rc.occPct)]);
    aoa.push([]);
    aoa.push(["Months included", rc.cleanMonths.join(", ")]);
    if (rc.skippedMonths.length) aoa.push(["Months excluded (no room-type detail)", rc.skippedMonths.join(", ")]);
  }
  return { name: `Room category ${code}`.slice(0, 31), aoa };
}

async function guestSheets(code: string, period: string): Promise<Sheet[]> {
  const a = await getPropertyAnalytics(code, period);
  if (!a) return [];
  return [
    dimSheet("Nationality", a.nationalities, countryName),
    dimSheet("Market segment", a.segments),
    dimSheet("Agent", a.agents),
    dimSheet("Room type", a.roomTypes),
    await roomCategorySheet(code, period),
  ];
}

// Pivot layout for the monthly split: the dimension runs down the side, the
// months run across the top, with margin totals. Each metric gets its own
// matrix, stacked with a title and a blank spacer — far easier to read than one
// repeating row per (month, value).
const monthTag = (m: string) => `${monthShort(m)} ${m.slice(0, 4)}`;

type MonthDims = { m: string; dims: Dim[] };
type MonthRc = { m: string; rc: Awaited<ReturnType<typeof getRoomCategoryOccupancy>> };

function pivotByMonth(
  sheetName: string,
  dimLabel: string,
  ctx: string,
  months: string[],
  perMonth: MonthDims[],
  nameFn?: (k: string) => string,
  cap?: number,
): Sheet {
  const metrics: { label: string; of: (d: Dim) => number }[] = [
    { label: "Revenue (IDR)", of: (d) => Math.round(d.revenue) },
    { label: "Room nights", of: (d) => Math.round(d.roomNights) },
    { label: "Bookings", of: (d) => d.reservations },
  ];

  // key -> month -> Dim, plus a revenue total per key for ranking / capping.
  const byKey = new Map<string, Map<string, Dim>>();
  const revByKey = new Map<string, number>();
  for (const { m, dims } of perMonth) {
    for (const d of dims) {
      const mm = byKey.get(d.key) ?? new Map<string, Dim>();
      mm.set(m, d); byKey.set(d.key, mm);
      revByKey.set(d.key, (revByKey.get(d.key) ?? 0) + d.revenue);
    }
  }
  let keys = Array.from(revByKey.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let otherKeys: string[] = [];
  if (cap != null && keys.length > cap) { otherKeys = keys.slice(cap); keys = keys.slice(0, cap); }

  const disp = (k: string) => (nameFn ? nameFn(k) : k);
  const valAt = (of: (d: Dim) => number, k: string, m: string) => { const d = byKey.get(k)?.get(m); return d ? of(d) : 0; };

  const aoa: Cell[][] = [[`${dimLabel} — production by month`], [ctx], []];
  for (const metric of metrics) {
    aoa.push([metric.label]);
    aoa.push([dimLabel, ...months.map(monthTag), "Total"]);
    for (const k of keys) {
      const vals = months.map((m) => valAt(metric.of, k, m));
      aoa.push([disp(k), ...vals, vals.reduce((a, b) => a + b, 0)]);
    }
    if (otherKeys.length) {
      const vals = months.map((m) => otherKeys.reduce((s, k) => s + valAt(metric.of, k, m), 0));
      aoa.push([`Other (${otherKeys.length} more)`, ...vals, vals.reduce((a, b) => a + b, 0)]);
    }
    const colTot = months.map((m) => keys.reduce((s, k) => s + valAt(metric.of, k, m), 0) + otherKeys.reduce((s, k) => s + valAt(metric.of, k, m), 0));
    aoa.push(["Total", ...colTot, colTot.reduce((a, b) => a + b, 0)]);
    aoa.push([]);
  }
  return { name: sheetName.slice(0, 31), aoa };
}

function roomCatPivot(sheetName: string, ctx: string, perMonth: MonthRc[]): Sheet {
  const title = "Room category — production by month";
  const withData = perMonth.filter((x): x is { m: string; rc: NonNullable<MonthRc["rc"]> } => !!x.rc && x.rc.hasData);
  if (!withData.length) return { name: sheetName.slice(0, 31), aoa: [[title], [ctx], [], ["No room-type detail for this period."]] };

  const monthsWithData = withData.map((x) => x.m);
  const cats = withData[0].rc.groups.map((g) => g.label);
  const cell = new Map<string, Map<string, { sold: number; avail: number; occ: number | null }>>();
  for (const { m, rc } of withData) {
    for (const g of rc.groups) {
      const mm = cell.get(g.label) ?? new Map<string, { sold: number; avail: number; occ: number | null }>();
      mm.set(m, { sold: g.soldNights, avail: g.availableNights, occ: g.occPct });
      cell.set(g.label, mm);
    }
  }
  const get = (cat: string, m: string) => cell.get(cat)?.get(m);

  const aoa: Cell[][] = [[title], [ctx], []];

  // Occupancy % — period total recomputed from summed sold/available (averaging % would be wrong).
  aoa.push(["Occupancy %"]);
  aoa.push(["Category", ...monthsWithData.map(monthTag), "Total"]);
  for (const cat of cats) {
    const vals = monthsWithData.map((m) => { const c = get(cat, m); return c ? r2(c.occ) : null; });
    let s = 0, a = 0;
    for (const m of monthsWithData) { const c = get(cat, m); if (c) { s += c.sold; a += c.avail; } }
    aoa.push([cat, ...vals, a > 0 ? r2((s / a) * 100) : null]);
  }
  {
    const vals = monthsWithData.map((m) => {
      let s = 0, a = 0;
      for (const cat of cats) { const c = get(cat, m); if (c) { s += c.sold; a += c.avail; } }
      return a > 0 ? r2((s / a) * 100) : null;
    });
    let S = 0, A = 0;
    for (const cat of cats) for (const m of monthsWithData) { const c = get(cat, m); if (c) { S += c.sold; A += c.avail; } }
    aoa.push(["All rooms", ...vals, A > 0 ? r2((S / A) * 100) : null]);
  }
  aoa.push([]);

  // Room nights sold.
  aoa.push(["Room nights sold"]);
  aoa.push(["Category", ...monthsWithData.map(monthTag), "Total"]);
  for (const cat of cats) {
    const vals = monthsWithData.map((m) => { const c = get(cat, m); return c ? c.sold : 0; });
    aoa.push([cat, ...vals, vals.reduce((a, b) => a + b, 0)]);
  }
  {
    const vals = monthsWithData.map((m) => {
      let s = 0;
      for (const cat of cats) { const c = get(cat, m); if (c) s += c.sold; }
      return s;
    });
    aoa.push(["All rooms", ...vals, vals.reduce((a, b) => a + b, 0)]);
  }
  return { name: sheetName.slice(0, 31), aoa };
}

// Same guest breakdowns as guestSheets, but pivoted month-by-month.
async function guestMonthlySheets(code: string, period: string): Promise<Sheet[]> {
  const base = await getPropertyAnalytics(code, period);
  if (!base || base.periodMonths.length === 0) return [];
  const months = base.periodMonths;
  const ctx = `${base.name} · ${base.periodLabel}`;

  // One reconciled read + one room-category read per month, in parallel.
  const per = await Promise.all(
    months.map(async (m) => ({
      m,
      a: await getPropertyAnalytics(code, m),
      rc: await getRoomCategoryOccupancy(code, m),
    })),
  );

  const dimsOf = (sel: (a: PropertyAnalytics) => Dim[]): MonthDims[] => per.map((x) => ({ m: x.m, dims: x.a ? sel(x.a) : [] }));

  return [
    pivotByMonth("Nationality by month", "Nationality", ctx, months, dimsOf((a) => a.nationalities), countryName, 15),
    pivotByMonth("Market segment by month", "Market segment", ctx, months, dimsOf((a) => a.segments)),
    pivotByMonth("Agent by month", "Agent", ctx, months, dimsOf((a) => a.agents), undefined, 15),
    pivotByMonth("Room type by month", "Room type", ctx, months, dimsOf((a) => a.roomTypes)),
    roomCatPivot("Room category by month", ctx, per.map((x) => ({ m: x.m, rc: x.rc }))),
  ];
}

/** Build the sheets for a requested dataset. `split: "month"` renders the guest
 * data as month-by-month pivot matrices instead of a single period aggregate. */
export async function buildExport(dataset: string, params: { p?: string; period?: string; split?: string }): Promise<Workbook | null> {
  const period = params.period || "2026";
  const code = (params.p || "BKDS").toUpperCase();
  const valid = PROPS.includes(code);
  const monthly = params.split === "month";

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
      return {
        filename: `blue-karma-${code}-guest-analytics-${monthly ? "by-month-" : ""}${period}-${stamp()}`,
        sheets: monthly ? await guestMonthlySheets(code, period) : await guestSheets(code, period),
      };
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
