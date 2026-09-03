import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getPropertyComparison, type CompareRow } from "@/lib/analytics";
import { countryName } from "@/lib/countries";
import { formatIDRFull, formatInt, formatPct2, monthShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACCENT: Record<string, { text: string; bar: string }> = {
  BKDS: { text: "text-bkds", bar: "bg-bkds" },
  BKDU: { text: "text-bkdu", bar: "bg-bkdu" },
  BKV: { text: "text-bkv", bar: "bg-bkv" },
};

// A metric row: how to read a value off a property, format it, and (optionally)
// which direction is "better" so we can highlight the leader.
type Row = {
  label: string;
  sub?: string;
  get: (r: CompareRow) => number | null;
  fmt: (r: CompareRow) => string;
  better?: "high" | "low"; // omit for non-ranked rows (top segment/nationality)
  tone?: (r: CompareRow) => string;
};

const METRICS: Row[] = [
  { label: "Room revenue", get: (r) => r.revenue, fmt: (r) => formatIDRFull(r.revenue), better: "high" },
  { label: "Room nights", get: (r) => r.roomNights, fmt: (r) => formatInt(r.roomNights), better: "high" },
  { label: "ADR", sub: "revenue ÷ room nights", get: (r) => r.adr, fmt: (r) => formatIDRFull(r.adr), better: "high" },
  {
    label: "Occupancy", sub: "avg of daily", get: (r) => r.occupancyPct,
    fmt: (r) => (r.occupancyPct != null ? formatPct2(r.occupancyPct) : "needs room count"), better: "high",
  },
  {
    label: "RevPAR", sub: "revenue ÷ available rooms", get: (r) => r.revpar,
    fmt: (r) => (r.revpar != null ? formatIDRFull(r.revpar) : "needs room count"), better: "high",
  },
  {
    label: "Booking pace vs LY", sub: "OTB now − same time last year", get: (r) => r.paceDelta,
    fmt: (r) => (r.paceDelta != null ? `${r.paceDelta >= 0 ? "+" : ""}${r.paceDelta.toFixed(1)} pp${r.paceMonth ? ` · ${monthShort(r.paceMonth)}` : ""}` : "—"),
    better: "high",
    tone: (r) => (r.paceDelta == null ? "" : r.paceDelta >= 0 ? "text-emerald-600" : "text-red-600"),
  },
  { label: "Top segment", get: () => null, fmt: (r) => (r.topSegment ? `${r.topSegment.key}` : "—") },
  { label: "Top nationality", get: () => null, fmt: (r) => (r.topNationality ? countryName(r.topNationality.key) : "—") },
];

function leader(rows: CompareRow[], row: Row): string | null {
  if (!row.better) return null;
  const vals = rows.map((r) => ({ code: r.code, v: row.get(r) })).filter((x) => x.v != null) as { code: string; v: number }[];
  if (vals.length < 2) return null;
  const best = vals.reduce((a, b) => (row.better === "high" ? (b.v > a.v ? b : a) : (b.v < a.v ? b : a)));
  // Only call it a leader if it's strictly ahead of the rest.
  if (vals.filter((x) => x.v === best.v).length > 1) return null;
  return best.code;
}

export default async function ComparePage({ searchParams }: { searchParams: { period?: string } }) {
  const period = searchParams.period ?? "2026";
  const c = await getPropertyComparison(period);
  const periods = [{ k: "2026", label: "2026 YTD" }, { k: "2025", label: "2025 YTD" }, { k: "all", label: "All time" }];
  const rows = c.rows;
  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Group dashboard</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Property comparison</h1>
            <span className="ml-auto text-xs text-muted-foreground">{c.periodLabel} · three properties at a glance</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => (
              <Link key={p.k} href={`/compare?period=${p.k}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${period === p.k ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{p.label}</Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {c.monthsAll.slice().reverse().map((m) => (
              <Link key={m} href={`/compare?period=${m}`}
                className={`rounded-md border px-2 py-1 text-xs tabular-nums ${period === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{monthShort(m)} {m.slice(2, 4)}</Link>
            ))}
          </div>
        </div>
      </header>

      <div className="container space-y-6 py-8">
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-3 text-left text-[11px] uppercase tracking-wide text-muted-foreground">Metric</th>
                  {rows.map((r) => (
                    <th key={r.code} className="px-3 py-2 text-right">
                      <Link href={`/p/${r.code}`} className={`font-semibold ${ACCENT[r.code]?.text ?? ""} hover:underline`}>{r.code}</Link>
                      <div className="text-[10px] font-normal text-muted-foreground">{r.city ?? "—"}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((row) => {
                  const lead = leader(rows, row);
                  return (
                    <tr key={row.label} className="border-t border-border/40">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{row.label}</div>
                        {row.sub && <div className="text-[10px] text-muted-foreground">{row.sub}</div>}
                      </td>
                      {rows.map((r) => {
                        const isLead = lead === r.code;
                        const tone = row.tone ? row.tone(r) : "";
                        return (
                          <td key={r.code} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${tone} ${isLead ? "font-semibold" : ""}`}>
                            <span className={isLead ? `rounded px-1.5 py-0.5 ${ACCENT[r.code]?.bar ?? "bg-primary"} bg-opacity-10` : ""}>{row.fmt(r)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Revenue bar comparison */}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Room revenue · {c.periodLabel}</div>
            {rows.map((r) => (
              <div key={r.code} className="flex items-center gap-3">
                <Link href={`/p/${r.code}`} className={`w-12 shrink-0 text-sm font-semibold ${ACCENT[r.code]?.text ?? ""} hover:underline`}>{r.code}</Link>
                <div className="h-5 flex-1 rounded bg-muted">
                  <div className={`h-full rounded ${ACCENT[r.code]?.bar ?? "bg-primary"} opacity-80`} style={{ width: `${Math.max(1, (r.revenue / maxRev) * 100)}%` }} />
                </div>
                <div className="w-40 shrink-0 text-right text-sm tabular-nums">{formatIDRFull(r.revenue)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Revenue, room nights &amp; ADR are the authoritative daily totals for {c.periodLabel}. Occupancy and RevPAR need the
          room count — set for BKDU (38); send BKDS &amp; BKV counts to unlock theirs. Pace is on-the-books occupancy for the
          nearest upcoming month vs the same time last year. Top segment &amp; nationality are by room-night volume from the
          arrival list. The leader in each ranked row is highlighted.
        </p>
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">Property comparison · Blue Karma Dijiwa Group</div>
      </footer>
    </main>
  );
}
