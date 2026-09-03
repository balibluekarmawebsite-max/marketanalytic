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
