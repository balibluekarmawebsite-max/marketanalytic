import { prisma } from "@/lib/prisma";
import { monthShort } from "@/lib/utils";

export type MonthAgg = {
  month: string; // "YYYY-MM"
  roomNights: number;
  revenue: number;
  adr: number | null;
  occupancyPct: number | null;
  days: number;
};

export type PropertyPerf = {
  code: string;
  name: string;
  city: string | null;
  roomsAvailable: number | null;
  ytdRevenue: number;
  ytdRoomNights: number;
  ytdAdr: number | null;
  months: MonthAgg[];
  latestFull: MonthAgg | null; // latest month with >= 28 days of data
};

export type Overview = {
  properties: PropertyPerf[];
  ytdRevenue: number;
  ytdRoomNights: number;
  ytdAdr: number | null;
  monthLabels: string[];
  dataFrom: string | null;
  dataTo: string | null;
  rowCount: number;
};

const num = (d: unknown): number =>
  d == null ? 0 : typeof d === "number" ? d : Number((d as { toString(): string }).toString());

export type PaceMonth = { month: string; otbNow: number | null; stly: number | null; delta: number | null };
export type PropertyPace = { code: string; name: string; asOf: string | null; stlyAsOf: string | null; months: PaceMonth[] };

/**
 * Forward-looking on-the-books & pace vs same-time-last-year, per property.
 * Uses the latest pickup snapshot for OTB, and the closest snapshot ~1 year
 * earlier (same month, comparable lead) as the STLY baseline.
 */
export async function getForwardLook(): Promise<PropertyPace[]> {
  const [props, snaps] = await Promise.all([
    prisma.property.findMany({ orderBy: { code: "asc" } }),
    prisma.pickupSnapshot.findMany(),
  ]);
  const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);

  return props.map((p) => {
    const ps = snaps.filter((s) => s.propertyCode === p.code);
    if (ps.length === 0) return { code: p.code, name: p.name, asOf: null, stlyAsOf: null, months: [] };

    const latest = ps.reduce((a, b) => (a.snapshotDate > b.snapshotDate ? a : b)).snapshotDate;
    const ld = new Date(latest);
    const lyYear = ld.getUTCFullYear() - 1;
    const lMonth = ld.getUTCMonth();
    const lDay = ld.getUTCDate();

    // STLY snapshot: same month last year, latest day <= lDay (else latest in that month)
    const lyInMonth = ps.filter((s) => { const d = new Date(s.snapshotDate); return d.getUTCFullYear() === lyYear && d.getUTCMonth() === lMonth; });
    let stlyDate: Date | null = null;
    if (lyInMonth.length) {
      const le = lyInMonth.filter((s) => new Date(s.snapshotDate).getUTCDate() <= lDay);
      const pick = (le.length ? le : lyInMonth).reduce((a, b) => (a.snapshotDate > b.snapshotDate ? a : b));
      stlyDate = new Date(pick.snapshotDate);
    }

    const otbAt = (date: Date | null) => {
      const m = new Map<number, number>();
      if (!date) return m;
      for (const s of ps) if (iso(s.snapshotDate) === iso(date)) m.set(new Date(s.targetMonth).getUTCMonth(), num(s.otbOccupancy));
      return m;
    };
    const nowMap = otbAt(ld);
    const stlyMap = otbAt(stlyDate);

    const months: PaceMonth[] = [];
    for (let mo = lMonth; mo <= 11; mo++) {
      const otbNow = nowMap.has(mo) ? nowMap.get(mo)! : null;
      const stly = stlyMap.has(mo) ? stlyMap.get(mo)! : null;
      months.push({
        month: `${ld.getUTCFullYear()}-${String(mo + 1).padStart(2, "0")}`,
        otbNow, stly,
        delta: otbNow != null && stly != null ? otbNow - stly : null,
      });
    }
    return { code: p.code, name: p.name, asOf: iso(ld), stlyAsOf: stlyDate ? iso(stlyDate) : null, months };
  });
}

// ---------------------------------------------------------------------------
// Archetype C — Budget vs Actual (market-segment plan)
// ---------------------------------------------------------------------------

export type BudgetSegRow = {
  segment: string;
  budgetRooms: number | null;
  actualRooms: number | null;
  varianceRooms: number | null; // actual − budget
  achievedPct: number | null; // actual ÷ budget × 100
  revBudget: number | null;
  revSharePct: number | null; // this segment's share of total rev budget
};

export type BudgetVsActual = {
  code: string;
  name: string;
  period: string;
  periodLabel: string;
  monthsAll: string[]; // months that carry a plan (for the period selector)
  periodMonths: string[];
  segments: BudgetSegRow[];
  totals: {
    budgetRooms: number;
    actualRooms: number;
    varianceRooms: number;
    achievedPct: number | null;
    revBudget: number;
  };
  // Authoritative actual room revenue (from DailyStat), compared only over the
  // months that have closed daily data so budget and actual cover the same span.
  actualRevenue: number | null;
  revBudgetCovered: number | null; // rev budget summed over the covered months
  revAchievedPct: number | null;
  coverageFrom: string | null;
  coverageTo: string | null;
  hasPlan: boolean;
};

/**
 * Budget-vs-actual for one property over a period. Rooms (budget & actual) and
 * budgeted revenue come straight from the market-segment plan sheet; actual
 * revenue comes from the authoritative daily totals, compared over the same
 * closed months so the achievement figure is apples-to-apples.
 */
export async function getBudgetVsActual(code: string, period: string): Promise<BudgetVsActual | null> {
  const [prop, plan, dailyRows] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.segmentActual.findMany({ where: { propertyCode: code } }),
    prisma.dailyStat.findMany({ where: { propertyCode: code } }),
  ]);
  if (!prop) return null;

  const ym = (d: Date) => new Date(d).toISOString().slice(0, 7);
  const monthsAll = Array.from(new Set(plan.map((s) => ym(s.month)))).sort();

  let inPeriod: (m: string) => boolean;
  let periodLabel: string;
  if (/^\d{4}-\d{2}$/.test(period)) { inPeriod = (m) => m === period; periodLabel = monthShort(period) + " " + period.slice(0, 4); }
  else if (period === "all") { inPeriod = () => true; periodLabel = "Full year"; }
  else { inPeriod = (m) => m.startsWith(period); periodLabel = `${period} full year`; }

  const periodMonths = monthsAll.filter(inPeriod);
  const rows = plan.filter((s) => inPeriod(ym(s.month)));

  // Per-segment aggregation over the period.
  type Acc = { budget: number; actual: number; rev: number; hasBudget: boolean; hasActual: boolean; hasRev: boolean };
  const seg = new Map<string, Acc>();
  for (const r of rows) {
    const a = seg.get(r.segment) ?? { budget: 0, actual: 0, rev: 0, hasBudget: false, hasActual: false, hasRev: false };
    if (r.budgetRooms != null) { a.budget += r.budgetRooms; a.hasBudget = true; }
    if (r.actualRooms != null) { a.actual += r.actualRooms; a.hasActual = true; }
    if (r.revBudget != null) { a.rev += num(r.revBudget); a.hasRev = true; }
    seg.set(r.segment, a);
  }

  const totalRevBudget = Array.from(seg.values()).reduce((s, a) => s + a.rev, 0);
  const segments: BudgetSegRow[] = Array.from(seg.entries())
    .filter(([, a]) => a.hasBudget || a.hasActual || a.hasRev) // drop wholly-empty plan lines
    .filter(([, a]) => a.budget > 0 || a.actual > 0 || a.rev > 0)
    .map(([segment, a]) => ({
      segment,
      budgetRooms: a.hasBudget ? a.budget : null,
      actualRooms: a.hasActual ? a.actual : null,
      varianceRooms: a.hasBudget && a.hasActual ? a.actual - a.budget : null,
      achievedPct: a.hasBudget && a.budget > 0 ? (a.actual / a.budget) * 100 : null,
      revBudget: a.hasRev ? a.rev : null,
      revSharePct: a.hasRev && totalRevBudget > 0 ? (a.rev / totalRevBudget) * 100 : null,
    }))
    .sort((x, y) => (y.revBudget ?? 0) - (x.revBudget ?? 0) || (y.actualRooms ?? 0) - (x.actualRooms ?? 0));

  const tBudget = segments.reduce((s, r) => s + (r.budgetRooms ?? 0), 0);
  const tActual = segments.reduce((s, r) => s + (r.actualRooms ?? 0), 0);
  const totals = {
    budgetRooms: tBudget,
    actualRooms: tActual,
    varianceRooms: tActual - tBudget,
    achievedPct: tBudget > 0 ? (tActual / tBudget) * 100 : null,
    revBudget: segments.reduce((s, r) => s + (r.revBudget ?? 0), 0),
  };

  // Authoritative actual revenue, matched to CLOSED months only (>= 28 days of
  // daily data) so a half-finished month can't drag the achievement figure.
  const dailyByMonth = new Map<string, number>();
  const daysByMonth = new Map<string, number>();
  for (const d of dailyRows) {
    const k = ym(d.date);
    dailyByMonth.set(k, (dailyByMonth.get(k) ?? 0) + num(d.revenue));
    daysByMonth.set(k, (daysByMonth.get(k) ?? 0) + 1);
  }
  const revMonths = periodMonths.filter((m) => (daysByMonth.get(m) ?? 0) >= 28).sort();
  const actualRevenue = revMonths.length ? revMonths.reduce((s, m) => s + (dailyByMonth.get(m) ?? 0), 0) : null;
  const revBudgetByMonth = new Map<string, number>();
  for (const r of rows) if (r.revBudget != null) revBudgetByMonth.set(ym(r.month), (revBudgetByMonth.get(ym(r.month)) ?? 0) + num(r.revBudget));
  const revBudgetCovered = revMonths.length ? revMonths.reduce((s, m) => s + (revBudgetByMonth.get(m) ?? 0), 0) : null;
  const revAchievedPct = actualRevenue != null && revBudgetCovered && revBudgetCovered > 0 ? (actualRevenue / revBudgetCovered) * 100 : null;

  return {
    code: prop.code, name: prop.name, period, periodLabel,
    monthsAll, periodMonths, segments, totals,
    actualRevenue, revBudgetCovered, revAchievedPct,
    coverageFrom: revMonths[0] ?? null, coverageTo: revMonths[revMonths.length - 1] ?? null,
    hasPlan: segments.length > 0,
  };
}

/** Aggregate DailyStat into per-property, per-month performance. */
export async function getOverview(): Promise<Overview> {
  const [rows, props] = await Promise.all([
    prisma.dailyStat.findMany({ orderBy: [{ propertyCode: "asc" }, { date: "asc" }] }),
    prisma.property.findMany({ orderBy: { code: "asc" } }),
  ]);

  const monthsSet = new Set<string>();
  // property -> month -> accumulator
  const acc = new Map<string, Map<string, { rn: number; rev: number; days: number; occSum: number; occDays: number }>>();

  for (const r of rows) {
    const d = new Date(r.date);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthsSet.add(month);
    if (!acc.has(r.propertyCode)) acc.set(r.propertyCode, new Map());
    const pm = acc.get(r.propertyCode)!;
    if (!pm.has(month)) pm.set(month, { rn: 0, rev: 0, days: 0, occSum: 0, occDays: 0 });
    const a = pm.get(month)!;
    a.rn += r.roomNights;
    a.rev += num(r.revenue);
    a.days += 1;
    if (r.occupancyPct != null) { a.occSum += num(r.occupancyPct); a.occDays += 1; }
  }

  const monthLabels = Array.from(monthsSet).sort();

  const properties: PropertyPerf[] = props.map((p) => {
    const pm = acc.get(p.code) ?? new Map();
    const months: MonthAgg[] = monthLabels.map((m) => {
      const a = pm.get(m);
      return {
        month: m,
        roomNights: a?.rn ?? 0,
        revenue: a?.rev ?? 0,
        adr: a && a.rn > 0 ? a.rev / a.rn : null,
        occupancyPct: a && a.occDays > 0 ? a.occSum / a.occDays : null,
        days: a?.days ?? 0,
      };
    });
    const withData = months.filter((m) => m.days > 0);
    const ytdRevenue = withData.reduce((s, m) => s + m.revenue, 0);
    const ytdRoomNights = withData.reduce((s, m) => s + m.roomNights, 0);
    const fullMonths = months.filter((m) => m.days >= 28);
    return {
      code: p.code,
      name: p.name,
      city: p.city,
      roomsAvailable: p.roomsAvailable,
      ytdRevenue,
      ytdRoomNights,
      ytdAdr: ytdRoomNights > 0 ? ytdRevenue / ytdRoomNights : null,
      months,
      latestFull: fullMonths.length ? fullMonths[fullMonths.length - 1] : null,
    };
  });

  const ytdRevenue = properties.reduce((s, p) => s + p.ytdRevenue, 0);
  const ytdRoomNights = properties.reduce((s, p) => s + p.ytdRoomNights, 0);

  return {
    properties,
    ytdRevenue,
    ytdRoomNights,
    ytdAdr: ytdRoomNights > 0 ? ytdRevenue / ytdRoomNights : null,
    monthLabels,
    dataFrom: rows.length ? new Date(rows[0].date).toISOString().slice(0, 10) : null,
    dataTo: rows.length ? new Date(rows[rows.length - 1].date).toISOString().slice(0, 10) : null,
    rowCount: rows.length,
  };
}
