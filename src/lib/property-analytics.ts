import { prisma } from "@/lib/prisma";
import { normalizeSegment } from "@/lib/ingest/segment";

const num = (d: unknown): number =>
  d == null ? 0 : typeof d === "number" ? d : Number((d as { toString(): string }).toString());

export type Dim = { key: string; reservations: number; roomNights: number; revenue: number };
type Totals = { reservations: number; roomNights: number; revenue: number };
type NF = (f: Fact) => number;

export type SegmentDetail = {
  segment: string;
  totals: Totals & { adr: number | null };
  agents: Dim[];
  nationalities: Dim[];
  roomTypes: Dim[];
};

export type AgentDetail = {
  agent: string;
  segment: string;
  totals: Totals & { adr: number | null };
  nationalities: Dim[];
  roomTypes: Dim[];
  byMonth: { month: string; reservations: number; roomNights: number }[];
};

export type PropertyAnalytics = {
  code: string;
  name: string;
  city: string | null;
  period: string;
  periodLabel: string;
  monthsAll: string[];
  periodMonths: string[];
  totals: Totals & { adr: number | null };
  reconciled: boolean; // true when revenue/nights were scaled to daily totals
  nationalities: Dim[];
  segments: Dim[];
  agents: Dim[];
  roomTypes: Dim[];
  segTop: (Dim & { tops: { key: string; reservations: number }[] })[];
  matrix: { nat: string; byMonth: number[]; total: number }[];
  segmentDetail: SegmentDetail | null;
  agentDetail: AgentDetail | null;
};

type Fact = {
  month: Date;
  nationality: string | null;
  marketSegment: string | null;
  agent: string | null;
  roomType: string | null;
  reservations: number;
  roomNights: number;
  revenue: unknown;
};

function aggOf(src: Fact[], keyFn: (f: Fact) => string | null, nightsOf: NF, revOf: NF): Dim[] {
  const m = new Map<string, Dim>();
  for (const f of src) {
    const k = keyFn(f) || "—";
    const d = m.get(k) ?? { key: k, reservations: 0, roomNights: 0, revenue: 0 };
    d.reservations += f.reservations;
    d.roomNights += nightsOf(f);
    d.revenue += revOf(f);
    m.set(k, d);
  }
  return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue || b.roomNights - a.roomNights);
}
function totalsOf(src: Fact[], nightsOf: NF, revOf: NF): Totals {
  return src.reduce(
    (s, f) => ({ reservations: s.reservations + f.reservations, roomNights: s.roomNights + nightsOf(f), revenue: s.revenue + revOf(f) }),
    { reservations: 0, roomNights: 0, revenue: 0 },
  );
}
const withAdr = (t: Totals) => ({ ...t, adr: t.roomNights > 0 ? t.revenue / t.roomNights : null });

export async function getPropertyAnalytics(
  code: string,
  period: string,
  seg?: string,
  agent?: string,
): Promise<PropertyAnalytics | null> {
  const [prop, facts, dailyRows] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.reservationFact.findMany({ where: { propertyCode: code } }),
    prisma.dailyStat.findMany({ where: { propertyCode: code } }),
  ]);
  if (!prop) return null;

  const ym = (d: Date) => d.toISOString().slice(0, 7);

  // Authoritative daily totals per month, and arrival-list totals per month.
  const daily = new Map<string, { rev: number; nights: number }>();
  for (const d of dailyRows) {
    const k = ym(d.date);
    const e = daily.get(k) ?? { rev: 0, nights: 0 };
    e.rev += num(d.revenue); e.nights += d.roomNights; daily.set(k, e);
  }
  const arr = new Map<string, { rev: number; nights: number }>();
  for (const f of facts) {
    const k = ym(f.month);
    const e = arr.get(k) ?? { rev: 0, nights: 0 };
    e.rev += num(f.revenue); e.nights += f.roomNights; arr.set(k, e);
  }

  // Reconcile: scale a fact's nights & revenue so each month sums to the daily
  // total, preserving the reservation-list mix. Months without daily data
  // (e.g. 2025) fall back to the raw reservation figures.
  const nightsOf: NF = (f) => {
    const dd = daily.get(ym(f.month)); const aa = arr.get(ym(f.month));
    return dd && aa && aa.nights > 0 ? f.roomNights * (dd.nights / aa.nights) : f.roomNights;
  };
  const revOf: NF = (f) => {
    const k = ym(f.month); const dd = daily.get(k); const aa = arr.get(k);
    if (!dd) return num(f.revenue);
    if (aa && aa.rev > 0) return num(f.revenue) * (dd.rev / aa.rev); // by value mix
    if (aa && aa.nights > 0) return f.roomNights * (dd.rev / aa.nights); // by night mix
    return num(f.revenue);
  };

  const monthsAll = Array.from(new Set(facts.map((f) => ym(f.month)))).sort();
  let inPeriod: (m: string) => boolean;
  let periodLabel: string;
  if (/^\d{4}-\d{2}$/.test(period)) { inPeriod = (m) => m === period; periodLabel = period; }
  else if (period === "all") { inPeriod = () => true; periodLabel = "All time"; }
  else { inPeriod = (m) => m.startsWith(period); periodLabel = `${period} YTD`; }

  const rows: Fact[] = facts.filter((f) => inPeriod(ym(f.month)));
  const periodMonths = monthsAll.filter(inPeriod);
  const reconciled = periodMonths.some((m) => daily.has(m));

  // Segment is derived live from the agent, so the taxonomy can change without
  // re-importing the reservation data.
  const segOf = (f: Fact) => normalizeSegment(f.agent);

  const nationalities = aggOf(rows, (f) => f.nationality, nightsOf, revOf);
  const segments = aggOf(rows, segOf, nightsOf, revOf);
  const agents = aggOf(rows, (f) => f.agent, nightsOf, revOf);
  const roomTypes = aggOf(rows, (f) => f.roomType, nightsOf, revOf);
  const totals = withAdr(totalsOf(rows, nightsOf, revOf));

  const segTop = segments.slice(0, 6).map((s) => {
    const natMap = new Map<string, number>();
    for (const f of rows)
      if (segOf(f) === s.key) natMap.set(f.nationality || "—", (natMap.get(f.nationality || "—") || 0) + f.reservations);
    const tops = Array.from(natMap.entries()).map(([key, reservations]) => ({ key, reservations })).sort((a, b) => b.reservations - a.reservations).slice(0, 4);
    return { ...s, tops };
  });

  const topNats = nationalities.slice(0, 8).map((n) => n.key);
  const matrix = topNats.map((nat) => {
    const byMonth = periodMonths.map((m) => Math.round(rows.filter((f) => (f.nationality || "—") === nat && ym(f.month) === m).reduce((sum, f) => sum + nightsOf(f), 0)));
    return { nat, byMonth, total: byMonth.reduce((a, b) => a + b, 0) };
  });

  let segmentDetail: SegmentDetail | null = null;
  if (seg) {
    const sr = rows.filter((f) => segOf(f) === seg);
    segmentDetail = {
      segment: seg,
      totals: withAdr(totalsOf(sr, nightsOf, revOf)),
      agents: aggOf(sr, (f) => f.agent, nightsOf, revOf),
      nationalities: aggOf(sr, (f) => f.nationality, nightsOf, revOf),
      roomTypes: aggOf(sr, (f) => f.roomType, nightsOf, revOf),
    };
  }

  let agentDetail: AgentDetail | null = null;
  if (agent) {
    const ar = rows.filter((f) => (f.agent || "—") === agent);
    const segsForAgent = aggOf(ar, segOf, nightsOf, revOf);
    agentDetail = {
      agent,
      segment: segsForAgent[0]?.key ?? "—",
      totals: withAdr(totalsOf(ar, nightsOf, revOf)),
      nationalities: aggOf(ar, (f) => f.nationality, nightsOf, revOf),
      roomTypes: aggOf(ar, (f) => f.roomType, nightsOf, revOf),
      byMonth: periodMonths.map((m) => {
        const mt = totalsOf(ar.filter((f) => ym(f.month) === m), nightsOf, revOf);
        return { month: m, reservations: mt.reservations, roomNights: Math.round(mt.roomNights) };
      }),
    };
  }

  return {
    code, name: prop.name, city: prop.city, period, periodLabel,
    monthsAll, periodMonths, totals, reconciled,
    nationalities, segments, agents, roomTypes, segTop, matrix, segmentDetail, agentDetail,
  };
}
