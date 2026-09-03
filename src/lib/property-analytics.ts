import { prisma } from "@/lib/prisma";

const num = (d: unknown): number =>
  d == null ? 0 : typeof d === "number" ? d : Number((d as { toString(): string }).toString());

export type Dim = { key: string; reservations: number; roomNights: number; revenue: number };
type Totals = { reservations: number; roomNights: number; revenue: number };

export type SegmentDetail = {
  segment: string;
  totals: Totals & { adr: number | null };
  agents: Dim[];
  nationalities: Dim[];
  roomTypes: Dim[];
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
  nationalities: Dim[];
  segments: Dim[];
  agents: Dim[];
  roomTypes: Dim[];
  segTop: (Dim & { tops: { key: string; reservations: number }[] })[];
  matrix: { nat: string; byMonth: number[]; total: number }[];
  segmentDetail: SegmentDetail | null;
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

function aggOf(src: Fact[], keyFn: (f: Fact) => string | null): Dim[] {
  const m = new Map<string, Dim>();
  for (const f of src) {
    const k = keyFn(f) || "—";
    const d = m.get(k) ?? { key: k, reservations: 0, roomNights: 0, revenue: 0 };
    d.reservations += f.reservations;
    d.roomNights += f.roomNights;
    d.revenue += num(f.revenue);
    m.set(k, d);
  }
  return Array.from(m.values()).sort((a, b) => b.roomNights - a.roomNights);
}
function totalsOf(src: Fact[]): Totals {
  return src.reduce(
    (s, f) => ({ reservations: s.reservations + f.reservations, roomNights: s.roomNights + f.roomNights, revenue: s.revenue + num(f.revenue) }),
    { reservations: 0, roomNights: 0, revenue: 0 },
  );
}

export async function getPropertyAnalytics(
  code: string,
  period: string,
  seg?: string,
): Promise<PropertyAnalytics | null> {
  const [prop, facts] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.reservationFact.findMany({ where: { propertyCode: code } }),
  ]);
  if (!prop) return null;

  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const monthsAll = Array.from(new Set(facts.map((f) => ym(f.month)))).sort();

  let inPeriod: (m: string) => boolean;
  let periodLabel: string;
  if (/^\d{4}-\d{2}$/.test(period)) { inPeriod = (m) => m === period; periodLabel = period; }
  else if (period === "all") { inPeriod = () => true; periodLabel = "All time"; }
  else { inPeriod = (m) => m.startsWith(period); periodLabel = `${period} YTD`; }

  const rows: Fact[] = facts.filter((f) => inPeriod(ym(f.month)));
  const periodMonths = monthsAll.filter(inPeriod);

  const nationalities = aggOf(rows, (f) => f.nationality);
  const segments = aggOf(rows, (f) => f.marketSegment);
  const agents = aggOf(rows, (f) => f.agent);
  const roomTypes = aggOf(rows, (f) => f.roomType);
  const t = totalsOf(rows);
  const totals = { ...t, adr: t.roomNights > 0 ? t.revenue / t.roomNights : null };

  const segTop = segments.slice(0, 6).map((s) => {
    const natMap = new Map<string, number>();
    for (const f of rows)
      if ((f.marketSegment || "—") === s.key) natMap.set(f.nationality || "—", (natMap.get(f.nationality || "—") || 0) + f.reservations);
    const tops = Array.from(natMap.entries()).map(([key, reservations]) => ({ key, reservations })).sort((a, b) => b.reservations - a.reservations).slice(0, 4);
    return { ...s, tops };
  });

  const topNats = nationalities.slice(0, 8).map((n) => n.key);
  const matrix = topNats.map((nat) => {
    const byMonth = periodMonths.map((m) => rows.filter((f) => (f.nationality || "—") === nat && ym(f.month) === m).reduce((sum, f) => sum + f.roomNights, 0));
    return { nat, byMonth, total: byMonth.reduce((a, b) => a + b, 0) };
  });

  let segmentDetail: SegmentDetail | null = null;
  if (seg) {
    const sr = rows.filter((f) => (f.marketSegment || "—") === seg);
    const st = totalsOf(sr);
    segmentDetail = {
      segment: seg,
      totals: { ...st, adr: st.roomNights > 0 ? st.revenue / st.roomNights : null },
      agents: aggOf(sr, (f) => f.agent),
      nationalities: aggOf(sr, (f) => f.nationality),
      roomTypes: aggOf(sr, (f) => f.roomType),
    };
  }

  return {
    code, name: prop.name, city: prop.city, period, periodLabel,
    monthsAll, periodMonths, totals,
    nationalities, segments, agents, roomTypes, segTop, matrix, segmentDetail,
  };
}
