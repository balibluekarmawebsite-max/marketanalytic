import { prisma } from "@/lib/prisma";
import { normalizeSegment } from "@/lib/ingest/segment";
import { resolvePeriod } from "@/lib/period";

// Booking window (lead time) analytics, read from BookingWindowFact. Lead time
// is the arrival date minus the created/booking date, in days. Segment is
// derived live from the agent, matching the rest of the guest analytics.

export type LeadBuckets = { b0_7: number; b8_30: number; b31_60: number; b61_90: number; b91plus: number };
export const BUCKET_LABELS: { key: keyof LeadBuckets; label: string }[] = [
  { key: "b0_7", label: "0–7d" },
  { key: "b8_30", label: "8–30d" },
  { key: "b31_60", label: "31–60d" },
  { key: "b61_90", label: "61–90d" },
  { key: "b91plus", label: "90+d" },
];

export type LeadGroup = {
  key: string;
  reservations: number;
  avgLead: number; // mean lead days (each booking capped at 365)
  lastMinutePct: number; // share booked within 7 days of arrival
  advancePct: number; // share booked more than 90 days out
  buckets: LeadBuckets;
};

export type BookingWindow = {
  code: string;
  name: string;
  period: string;
  periodLabel: string;
  monthsAll: string[];
  periodMonths: string[];
  hasData: boolean;
  overall: LeadGroup;
  segments: LeadGroup[];
  agents: LeadGroup[];
};

type Row = {
  month: Date;
  agent: string | null;
  reservations: number;
  leadDaysSum: number;
  lead0_7: number;
  lead8_30: number;
  lead31_60: number;
  lead61_90: number;
  lead91plus: number;
};

function groupOf(key: string, rows: Row[]): LeadGroup {
  let reservations = 0, sum = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
  for (const r of rows) {
    reservations += r.reservations; sum += r.leadDaysSum;
    b0 += r.lead0_7; b1 += r.lead8_30; b2 += r.lead31_60; b3 += r.lead61_90; b4 += r.lead91plus;
  }
  const pct = (n: number) => (reservations > 0 ? (n / reservations) * 100 : 0);
  return {
    key,
    reservations,
    avgLead: reservations > 0 ? sum / reservations : 0,
    lastMinutePct: pct(b0),
    advancePct: pct(b4),
    buckets: { b0_7: b0, b8_30: b1, b31_60: b2, b61_90: b3, b91plus: b4 },
  };
}

function pushInto(m: Map<string, Row[]>, key: string, row: Row) {
  const arr = m.get(key);
  if (arr) arr.push(row);
  else m.set(key, [row]);
}

export async function getBookingWindow(code: string, period: string): Promise<BookingWindow | null> {
  const [prop, rows] = await Promise.all([
    prisma.property.findUnique({ where: { code } }),
    prisma.bookingWindowFact.findMany({ where: { propertyCode: code } }),
  ]);
  if (!prop) return null;

  const ym = (d: Date) => new Date(d).toISOString().slice(0, 7);
  const monthsAll = Array.from(new Set(rows.map((r) => ym(r.month)))).sort();
  const { inPeriod, label } = resolvePeriod(period, monthsAll);
  const sel = rows.filter((r) => inPeriod(ym(r.month)));
  const periodMonths = monthsAll.filter(inPeriod);

  const bySeg = new Map<string, Row[]>();
  const byAgent = new Map<string, Row[]>();
  for (const r of sel) {
    pushInto(bySeg, normalizeSegment(r.agent), r);
    pushInto(byAgent, r.agent || "—", r);
  }
  const bySize = (a: LeadGroup, b: LeadGroup) => b.reservations - a.reservations || a.avgLead - b.avgLead;
  const segments = Array.from(bySeg).map(([k, rs]) => groupOf(k, rs)).sort(bySize);
  const agents = Array.from(byAgent).map(([k, rs]) => groupOf(k, rs)).sort(bySize);

  return {
    code: prop.code,
    name: prop.name,
    period,
    periodLabel: label,
    monthsAll,
    periodMonths,
    hasData: sel.length > 0,
    overall: groupOf("All", sel),
    segments,
    agents,
  };
}
