import { monthShort } from "@/lib/utils";

// One place that turns a period token into a month predicate + a label + the
// months it covers, so every analytics function reads periods the same way.
//
// Tokens:
//   "YYYY"      → that year, to-date within the data (YTD)
//   "YYYY-MM"   → a single month
//   "all"       → every month
//   "lastN"     → the most recent N months that have data (e.g. "last3")
export type ResolvedPeriod = { inPeriod: (m: string) => boolean; label: string; months: string[] };

export function resolvePeriod(period: string, monthsAll: string[]): ResolvedPeriod {
  const sorted = Array.from(new Set(monthsAll)).sort();

  if (/^\d{4}-\d{2}$/.test(period)) {
    return { inPeriod: (m) => m === period, label: `${monthShort(period)} ${period.slice(0, 4)}`, months: sorted.filter((m) => m === period) };
  }
  const lastN = period.match(/^last(\d+)$/);
  if (lastN) {
    const n = Math.max(1, parseInt(lastN[1], 10));
    const pick = sorted.slice(-n);
    const set = new Set(pick);
    return { inPeriod: (m) => set.has(m), label: `Last ${n} months`, months: pick };
  }
  if (period === "all") return { inPeriod: () => true, label: "All time", months: sorted };
  return { inPeriod: (m) => m.startsWith(period), label: `${period} YTD`, months: sorted.filter((m) => m.startsWith(period)) };
}

// Preset chips for the picker, derived from the available months: one "YTD" per
// year present (newest first), then Last 3 / Last 6 months and All time.
export function periodPresets(monthsAll: string[]): { k: string; label: string }[] {
  const years = Array.from(new Set(monthsAll.map((m) => m.slice(0, 4)))).sort().reverse();
  return [
    ...years.map((y) => ({ k: y, label: `${y} YTD` })),
    { k: "last3", label: "Last 3 mo" },
    { k: "last6", label: "Last 6 mo" },
    { k: "all", label: "All time" },
  ];
}
