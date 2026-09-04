import { prisma } from "@/lib/prisma";
import { monthShort } from "@/lib/utils";
import { normalizeSegment } from "@/lib/ingest/segment";

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

// ---------------------------------------------------------------------------
// Property comparison — the "one glance, three properties" scorecard
// ---------------------------------------------------------------------------

export type CompareMetric = { code: string; value: number | null };
export type CompareRow = {
  code: string;
  name: string;
  city: string | null;
  roomsAvailable: number | null;
  revenue: number;
  roomNights: number;
  adr: number | null;
  occupancyPct: number | null;
  revpar: number | null;
  paceDelta: number | null; // OTB now − STLY, percentage points, nearest upcoming month
  paceMonth: string | null;
  topSegment: { key: string; roomNights: number } | null;
  topNationality: { key: string; roomNights: number } | null;
};
export type PropertyComparison = {
  period: string;
  periodLabel: string;
  monthsAll: string[];
  rows: CompareRow[];
};

/**
 * Side-by-side comparison of all properties over a period: revenue, room
 * nights, ADR, occupancy, RevPAR, booking pace vs last year, and the leading
 * segment & nationality. Occupancy/RevPAR need the room count, so they stay
 * null for properties whose count we don't have yet (BKDS, BKV).
 */
export async function getPropertyComparison(period: string): Promise<PropertyComparison> {
  const [props, daily, facts, forward, monthly] = await Promise.all([
    prisma.property.findMany({ orderBy: { code: "asc" } }),
    prisma.dailyStat.findMany(),
    prisma.reservationFact.findMany(),
    getForwardLook(),
    prisma.monthlyStat.findMany(),
  ]);

  const ym = (d: Date) => new Date(d).toISOString().slice(0, 7);
  const monthsAll = Array.from(new Set(daily.map((d) => ym(d.date)))).sort();

  let inPeriod: (m: string) => boolean;
  let periodLabel: string;
  if (/^\d{4}-\d{2}$/.test(period)) { inPeriod = (m) => m === period; periodLabel = `${monthShort(period)} ${period.slice(0, 4)}`; }
  else if (period === "all") { inPeriod = () => true; periodLabel = "All time"; }
  else { inPeriod = (m) => m.startsWith(period); periodLabel = `${period} YTD`; }

  const rows: CompareRow[] = props.map((p) => {
    const dRows = daily.filter((d) => d.propertyCode === p.code && inPeriod(ym(d.date)));
    const revenue = dRows.reduce((s, d) => s + num(d.revenue), 0);
    const roomNights = dRows.reduce((s, d) => s + d.roomNights, 0);
    const days = dRows.length;
    // Occupancy from the PU sheets (Occ on Hand), averaged over the period's months.
    const occMonths = monthly.filter((r) => r.propertyCode === p.code && r.actualOcc != null && inPeriod(ym(r.month)));
    const occupancyPct = occMonths.length ? occMonths.reduce((s, r) => s + num(r.actualOcc), 0) / occMonths.length : null;
    const revpar = p.roomsAvailable && days > 0 ? revenue / (p.roomsAvailable * days) : null;

    // Pace: nearest upcoming month that has both an OTB and an STLY reading.
    const fp = forward.find((f) => f.code === p.code);
    const pace = fp?.months.find((m) => m.delta != null) ?? null;

    // Top segment & nationality by booking volume (room nights) over the period.
    const fRows = facts.filter((f) => f.propertyCode === p.code && inPeriod(ym(f.month)));
    const top = (keyFn: (f: (typeof fRows)[number]) => string | null) => {
      const m = new Map<string, number>();
      for (const f of fRows) { const k = keyFn(f); if (k) m.set(k, (m.get(k) ?? 0) + f.roomNights); }
      const best = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
      return best ? { key: best[0], roomNights: best[1] } : null;
    };

    return {
      code: p.code, name: p.name, city: p.city, roomsAvailable: p.roomsAvailable,
      revenue, roomNights,
      adr: roomNights > 0 ? revenue / roomNights : null,
      occupancyPct, revpar,
      paceDelta: pace?.delta ?? null, paceMonth: pace?.month ?? null,
      topSegment: top((f) => normalizeSegment(f.agent)),
      topNationality: top((f) => f.nationality),
    };
  });

  return { period, periodLabel, monthsAll, rows };
}

// ---------------------------------------------------------------------------
// Pickup / pace detail — the forward booking view for one property
// ---------------------------------------------------------------------------

export type PickupMonthRow = {
  month: string; // YYYY-MM
  otbNow: number | null; // on-the-books occupancy now
  otb7: number | null;
  otb30: number | null;
  pickup7: number | null; // otbNow − otb7 (occupancy points gained in 7 days)
  pickup30: number | null;
  stly: number | null; // same-lead-time last year
  paceDelta: number | null; // otbNow − stly
};
export type CurvePoint = { lead: number; otb: number }; // lead = days before the 1st (0 = month start, negative = into the month)
export type PickupDetail = {
  code: string;
  name: string;
  asOf: string | null;
  months: PickupMonthRow[];
  curveMonth: string | null;
  curveThisYear: CurvePoint[];
  curveLastYear: CurvePoint[];
  availableCurveMonths: string[];
};

const DAY = 86400000;

/**
 * Deep pickup/pace view for one property: on-the-books occupancy for each
 * upcoming month, how much was picked up in the last 7/30 days, pace vs the
 * same lead time last year, and the booking-build-up curve (this year vs last)
 * for a chosen target month.
 */
export async function getPickupDetail(code: string, curveMonthArg?: string): Promise<PickupDetail | null> {
  const [prop, snaps] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.pickupSnapshot.findMany({ where: { propertyCode: code } }),
  ]);
  if (!prop) return null;

  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const ym = (ms: number) => new Date(ms).toISOString().slice(0, 7);
  const monthStart = (y: number, m0: number) => Date.UTC(y, m0, 1);
  const monthStartOf = (m: string) => monthStart(+m.slice(0, 4), +m.slice(5, 7) - 1);
  const monthEndOf = (m: string) => monthStart(+m.slice(0, 4), +m.slice(5, 7)) - DAY; // last day of month
  const shiftYear = (m: string, dy: number) => `${+m.slice(0, 4) + dy}-${m.slice(5, 7)}`;

  if (snaps.length === 0) {
    return { code: prop.code, name: prop.name, asOf: null, months: [], curveMonth: null, curveThisYear: [], curveLastYear: [], availableCurveMonths: [] };
  }

  // Index every snapshot by its target month → sorted [{snap ms, otb}].
  const byTarget = new Map<string, { snap: number; otb: number }[]>();
  let latest = 0;
  for (const s of snaps) {
    const snap = new Date(s.snapshotDate).getTime();
    const tgt = ym(new Date(s.targetMonth).getTime());
    if (snap > latest) latest = snap;
    (byTarget.get(tgt) ?? byTarget.set(tgt, []).get(tgt)!).push({ snap, otb: num(s.otbOccupancy) });
  }
  for (const arr of Array.from(byTarget.values())) arr.sort((a, b) => a.snap - b.snap);

  // OTB for a target month as known on/at-or-before a given snapshot time.
  const otbBefore = (month: string, cutoff: number): number | null => {
    const arr = byTarget.get(month);
    if (!arr) return null;
    let val: number | null = null;
    for (const p of arr) { if (p.snap <= cutoff) val = p.otb; else break; }
    return val;
  };

  const latestMonth = ym(latest);
  // Upcoming target months = those with a value at the latest snapshot, from the
  // current month forward.
  const upcoming = Array.from(byTarget.keys())
    .filter((m) => m >= latestMonth && otbBefore(m, latest) != null)
    .sort();

  const months: PickupMonthRow[] = upcoming.map((m) => {
    const otbNow = otbBefore(m, latest);
    const otb7 = otbBefore(m, latest - 7 * DAY);
    const otb30 = otbBefore(m, latest - 30 * DAY);
    const lead = Math.round((monthStartOf(m) - latest) / DAY); // days from now to month start
    const ly = shiftYear(m, -1);
    const stly = otbBefore(ly, monthStartOf(ly) - lead * DAY); // last year at the same lead time
    return {
      month: m,
      otbNow, otb7, otb30,
      pickup7: otbNow != null && otb7 != null ? otbNow - otb7 : null,
      pickup30: otbNow != null && otb30 != null ? otbNow - otb30 : null,
      stly,
      paceDelta: otbNow != null && stly != null ? otbNow - stly : null,
    };
  });

  // Booking curve for a chosen month (default: first upcoming). Build-up over the
  // ~150 days before the 1st, capped at month end so the post-month reset can't
  // pollute it. Last year uses the same-month-last-year curve aligned by lead.
  const availableCurveMonths = upcoming.filter((m) => byTarget.has(shiftYear(m, -1)));
  const curveMonth = curveMonthArg && upcoming.includes(curveMonthArg) ? curveMonthArg : upcoming[0] ?? null;

  const curveFor = (month: string | null): CurvePoint[] => {
    if (!month) return [];
    const arr = byTarget.get(month);
    if (!arr) return [];
    const start = monthStartOf(month);
    const end = Math.min(monthEndOf(month) + DAY, latest + DAY);
    return arr
      .filter((p) => p.snap <= end)
      .map((p) => ({ lead: Math.round((start - p.snap) / DAY), otb: p.otb }))
      .filter((pt) => pt.lead <= 150 && pt.lead >= -31)
      .sort((a, b) => b.lead - a.lead);
  };

  return {
    code: prop.code,
    name: prop.name,
    asOf: iso(latest),
    months,
    curveMonth,
    curveThisYear: curveFor(curveMonth),
    curveLastYear: curveFor(curveMonth ? shiftYear(curveMonth, -1) : null),
    availableCurveMonths,
  };
}

// ---------------------------------------------------------------------------
// Monthly budget vs actual + forward on-the-books (from MonthlyStat)
// ---------------------------------------------------------------------------

export type MonthBvA = {
  month: string;
  budgetOcc: number | null; actualOcc: number | null;
  budgetRooms: number | null; actualRooms: number | null;
  budgetAdr: number | null; actualAdr: number | null;
  budgetRevenue: number | null; actualRevenue: number | null;
  roomsAchieved: number | null; revAchieved: number | null; occAchieved: number | null;
};
export type BudgetVsActualMonthly = {
  code: string; name: string; period: string; periodLabel: string;
  monthsAll: string[]; months: MonthBvA[];
  totals: {
    budgetRooms: number; actualRooms: number; roomsAchieved: number | null;
    budgetRevenue: number; actualRevenue: number; revAchieved: number | null;
    avgBudgetOcc: number | null; avgActualOcc: number | null;
  };
  hasData: boolean;
};

const pctAch = (actual: number | null, budget: number | null): number | null =>
  actual != null && budget != null && budget !== 0 ? (actual / budget) * 100 : null;

/** Per-month budget vs actual (occupancy, rooms, ADR, revenue) — all read from
 * the PU sheets, so both sides share one basis. Replaces the segment-plan
 * revenue comparison for the headline numbers. */
export async function getBudgetVsActualMonthly(code: string, period: string): Promise<BudgetVsActualMonthly | null> {
  const [prop, allRows] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.monthlyStat.findMany({ where: { propertyCode: code }, orderBy: { month: "asc" } }),
  ]);
  if (!prop) return null;

  const ym = (d: Date) => new Date(d).toISOString().slice(0, 7);
  // Budget-vs-actual is only about months that HAVE a budget (the 2026 plan) —
  // exclude the prior-year (2025) actual-only rows so they can't clutter the
  // month selector or inflate the achievement totals.
  const rows = allRows.filter((r) => r.budgetOcc != null || r.budgetRooms != null || r.budgetRevenue != null);
  const monthsAll = rows.map((r) => ym(r.month));
  let inPeriod: (m: string) => boolean;
  let periodLabel: string;
  if (/^\d{4}-\d{2}$/.test(period)) { inPeriod = (m) => m === period; periodLabel = `${monthShort(period)} ${period.slice(0, 4)}`; }
  else if (period === "all") { inPeriod = () => true; periodLabel = "Full year"; }
  else { inPeriod = (m) => m.startsWith(period); periodLabel = `${period} full year`; }

  const sel = rows.filter((r) => inPeriod(ym(r.month)));
  const months: MonthBvA[] = sel.map((r) => {
    const budgetOcc = r.budgetOcc == null ? null : num(r.budgetOcc);
    const actualOcc = r.actualOcc == null ? null : num(r.actualOcc);
    const budgetRooms = r.budgetRooms, actualRooms = r.actualRooms;
    const budgetAdr = r.budgetAdr == null ? null : num(r.budgetAdr);
    const actualAdr = r.actualAdr == null ? null : num(r.actualAdr);
    const budgetRevenue = r.budgetRevenue == null ? null : num(r.budgetRevenue);
    const actualRevenue = r.actualRevenue == null ? null : num(r.actualRevenue);
    return {
      month: ym(r.month),
      budgetOcc, actualOcc, budgetRooms, actualRooms, budgetAdr, actualAdr, budgetRevenue, actualRevenue,
      roomsAchieved: pctAch(actualRooms, budgetRooms),
      revAchieved: pctAch(actualRevenue, budgetRevenue),
      occAchieved: pctAch(actualOcc, budgetOcc),
    };
  });

  // Each total is summed/averaged only over months that carry BOTH sides, so
  // budget and actual always span the same set (no inflated achievement, and the
  // two occupancy averages cover identical months).
  const sumOf = (arr: MonthBvA[], f: (m: MonthBvA) => number | null) => arr.reduce((s, m) => s + (f(m) ?? 0), 0);
  const roomsBoth = months.filter((m) => m.actualRooms != null && m.budgetRooms != null);
  const revBoth = months.filter((m) => m.actualRevenue != null && m.budgetRevenue != null);
  const occBoth = months.filter((m) => m.actualOcc != null && m.budgetOcc != null);
  const budgetRooms = sumOf(roomsBoth, (m) => m.budgetRooms), actualRooms = sumOf(roomsBoth, (m) => m.actualRooms);
  const budgetRevenue = sumOf(revBoth, (m) => m.budgetRevenue), actualRevenue = sumOf(revBoth, (m) => m.actualRevenue);

  return {
    code: prop.code, name: prop.name, period, periodLabel, monthsAll, months,
    totals: {
      budgetRooms, actualRooms, roomsAchieved: pctAch(actualRooms, budgetRooms),
      budgetRevenue, actualRevenue, revAchieved: pctAch(actualRevenue, budgetRevenue),
      avgBudgetOcc: occBoth.length ? sumOf(occBoth, (m) => m.budgetOcc) / occBoth.length : null,
      avgActualOcc: occBoth.length ? sumOf(occBoth, (m) => m.actualOcc) / occBoth.length : null,
    },
    hasData: months.length > 0,
  };
}

export type YoyMonth = {
  month: number; // 1..12
  occ2026: number | null; occ2025: number | null;
  adr2026: number | null; adr2025: number | null;
  rev2026: number | null; rev2025: number | null;
  rooms2026: number | null; rooms2025: number | null;
};
export type BusinessOverview = {
  code: string; name: string;
  months: YoyMonth[];
  totals: { rev2026: number; rev2025: number; rooms2026: number; rooms2025: number; occ2026: number | null; occ2025: number | null };
};

/** Actual occupancy / ADR / revenue per month, 2026 vs 2025 (from MonthlyStat).
 * A pure business-overview view — actuals only, no budget. */
export async function getBusinessOverview(code: string): Promise<BusinessOverview | null> {
  const [prop, rows] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.monthlyStat.findMany({ where: { propertyCode: code }, orderBy: { month: "asc" } }),
  ]);
  if (!prop) return null;

  const byKey = new Map<string, (typeof rows)[number]>(); // "YYYY-M"
  for (const r of rows) {
    const d = new Date(r.month);
    byKey.set(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, r);
  }
  const val = (year: number, mo: number, f: (r: (typeof rows)[number]) => unknown): number | null => {
    const r = byKey.get(`${year}-${mo}`);
    const v = r ? f(r) : null;
    return v == null ? null : num(v as number);
  };

  const months: YoyMonth[] = [];
  for (let mo = 1; mo <= 12; mo++) {
    const row: YoyMonth = {
      month: mo,
      occ2026: val(2026, mo, (r) => r.actualOcc), occ2025: val(2025, mo, (r) => r.actualOcc),
      adr2026: val(2026, mo, (r) => r.actualAdr), adr2025: val(2025, mo, (r) => r.actualAdr),
      rev2026: val(2026, mo, (r) => r.actualRevenue), rev2025: val(2025, mo, (r) => r.actualRevenue),
      rooms2026: val(2026, mo, (r) => r.actualRooms), rooms2025: val(2025, mo, (r) => r.actualRooms),
    };
    if (row.occ2026 != null || row.occ2025 != null) months.push(row);
  }

  // Totals over months present in BOTH years (fair comparison).
  const both = months.filter((m) => m.rev2026 != null && m.rev2025 != null);
  const sum = (f: (m: YoyMonth) => number | null) => both.reduce((s, m) => s + (f(m) ?? 0), 0);
  const occB26 = both.filter((m) => m.occ2026 != null), occB25 = both.filter((m) => m.occ2025 != null);
  return {
    code: prop.code, name: prop.name, months,
    totals: {
      rev2026: sum((m) => m.rev2026), rev2025: sum((m) => m.rev2025),
      rooms2026: sum((m) => m.rooms2026), rooms2025: sum((m) => m.rooms2025),
      occ2026: occB26.length ? occB26.reduce((s, m) => s + (m.occ2026 ?? 0), 0) / occB26.length : null,
      occ2025: occB25.length ? occB25.reduce((s, m) => s + (m.occ2025 ?? 0), 0) / occB25.length : null,
    },
  };
}

export type OtbMonth = { month: string; otbOcc: number | null; otbAdr: number | null; otbRevenue: number | null; otbRooms: number | null };
export type PropertyOtb = { code: string; name: string; months: OtbMonth[] };

/** Forward on-the-books (occupancy, ADR, revenue) per property, from the latest
 * PU sheet's forward columns (stored on MonthlyStat.otb*). */
export async function getForwardOtbAll(): Promise<PropertyOtb[]> {
  const [props, rows] = await Promise.all([
    prisma.property.findMany({ orderBy: { code: "asc" } }),
    prisma.monthlyStat.findMany({ orderBy: { month: "asc" } }),
  ]);
  const ym = (d: Date) => new Date(d).toISOString().slice(0, 7);
  return props.map((p) => ({
    code: p.code, name: p.name,
    months: rows
      .filter((r) => r.propertyCode === p.code && r.otbOcc != null)
      .map((r) => ({
        month: ym(r.month),
        otbOcc: r.otbOcc == null ? null : num(r.otbOcc),
        otbAdr: r.otbAdr == null ? null : num(r.otbAdr),
        otbRevenue: r.otbRevenue == null ? null : num(r.otbRevenue),
        otbRooms: r.otbRooms,
      })),
  }));
}

/** Aggregate DailyStat into per-property, per-month performance. */
export async function getOverview(): Promise<Overview> {
  const [rows, props, monthly] = await Promise.all([
    prisma.dailyStat.findMany({ orderBy: [{ propertyCode: "asc" }, { date: "asc" }] }),
    prisma.property.findMany({ orderBy: { code: "asc" } }),
    prisma.monthlyStat.findMany(),
  ]);
  // Authoritative occupancy % from the PU sheets (Occ on Hand), keyed CODE|YYYY-MM.
  const occByMonth = new Map<string, number>();
  for (const r of monthly) if (r.actualOcc != null) occByMonth.set(`${r.propertyCode}|${new Date(r.month).toISOString().slice(0, 7)}`, num(r.actualOcc));

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
      // Prefer the PU-sheet occupancy (available for every property); fall back
      // to the daily-derived average only if a month has no monthly figure.
      const puOcc = occByMonth.get(`${p.code}|${m}`);
      return {
        month: m,
        roomNights: a?.rn ?? 0,
        revenue: a?.rev ?? 0,
        adr: a && a.rn > 0 ? a.rev / a.rn : null,
        occupancyPct: puOcc != null ? puOcc : a && a.occDays > 0 ? a.occSum / a.occDays : null,
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
