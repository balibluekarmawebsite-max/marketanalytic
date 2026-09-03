import { prisma } from "@/lib/prisma";

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
