import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { getOverview, getForwardOtbAll, getForwardLook, getKpiDeltas, getBriefing, type PropertyPerf, type PropertyOtb, type KpiSeries, type PropertyPace } from "@/lib/analytics";
import { ExportButtons } from "@/components/export-buttons";
import { DeltaChip } from "@/components/ui/delta-chip";
import { Sparkline } from "@/components/sparkline";
import { formatIDRFull, formatInt, formatNum0, formatPct2, monthShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACCENT: Record<string, { bar: string; text: string }> = {
  BKDS: { bar: "bg-bkds", text: "text-bkds" },
  BKDU: { bar: "bg-bkdu", text: "text-bkdu" },
  BKV: { bar: "bg-bkv", text: "text-bkv" },
};

function Bars({ data, color = "bg-primary" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 760 }}>
        <div className="flex items-end gap-1.5" style={{ height: 170 }}>
          {data.map((d) => (
            <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9px] tabular-nums text-muted-foreground">{formatNum0(d.value)}</span>
              <div
                className={`w-full rounded-t ${color}`}
                style={{ height: `${Math.max(2, (d.value / max) * 88)}%` }}
                title={`${d.label}: ${formatIDRFull(d.value)}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {data.map((d) => (
            <div key={d.label} className="flex-1 text-center text-[10px] text-muted-foreground">
              {d.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sparkbars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-0.5" style={{ height: 34 }}>
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${color}`}
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v > 0 ? 1 : 0.15 }}
        />
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, d, priorLabel }: { label: string; value: string; sub?: string; d?: KpiSeries; priorLabel?: string | null }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          {d && <Sparkline data={d.series} className="mt-0.5 shrink-0 text-primary opacity-50" />}
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {d && <DeltaChip current={d.cur} previous={d.prev} label={priorLabel ?? undefined} />}
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// Forward booking pace vs last year, as a compact ± points tag. Green ahead, red
// behind — but only once the gap is worth acting on (≥5 pts); muted otherwise.
function PaceTag({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return <span className="text-muted-foreground">—</span>;
  const strong = Math.abs(delta) >= 5;
  const tone = !strong ? "text-muted-foreground" : delta > 0 ? "text-emerald-600" : "text-red-600";
  const arrow = Math.abs(delta) < 0.5 ? "–" : delta > 0 ? "▲" : "▼";
  return (
    <span className={`whitespace-nowrap font-medium tabular-nums ${tone}`}>
      <span className="text-[9px]">{arrow}</span> {delta > 0 ? "+" : ""}{delta.toFixed(0)}
    </span>
  );
}

// A one-line pace verdict for the card header.
function PaceBadge({ avg }: { avg: number | null | undefined }) {
  if (avg == null) return null;
  if (avg >= 5) return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">▲ ahead of last year</span>;
  if (avg <= -5) return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-600">▼ behind pace</span>;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">on pace</span>;
}

function PropertyCard({ p }: { p: PropertyPerf }) {
  const accent = ACCENT[p.code] ?? { bar: "bg-primary", text: "text-foreground" };
  const lf = p.latestFull;
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{p.code}</CardTitle>
          <Badge variant="secondary">{p.city ?? "—"}</Badge>
        </div>
        <CardDescription>{p.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {lf ? `${monthShort(lf.month)} revenue` : "Revenue"}
            </div>
            <div className="text-sm font-semibold tabular-nums">{formatIDRFull(lf?.revenue)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ADR</div>
            <div className="text-sm font-semibold tabular-nums">{formatIDRFull(lf?.adr)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Room nights</div>
            <div className="text-sm font-semibold tabular-nums">{formatInt(lf?.roomNights)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Occupancy</div>
            <div className="text-sm font-semibold tabular-nums">
              {lf?.occupancyPct != null ? (
                formatPct2(lf.occupancyPct)
              ) : (
                <span className="text-xs font-normal text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Monthly revenue</span>
            <span className="tabular-nums normal-case">YTD {formatIDRFull(p.ytdRevenue)}</span>
          </div>
          <Sparkbars data={p.months.map((m) => m.revenue)} color={accent.bar} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href={`/p/${p.code}`}
            className={`inline-flex items-center gap-1 text-sm font-medium ${accent.text} hover:underline`}
          >
            Guest analytics →
          </Link>
          <Link
            href={`/budget?p=${p.code}`}
            className={`inline-flex items-center gap-1 text-sm font-medium ${accent.text} hover:underline`}
          >
            Budget vs actual →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function Home() {
  let overview: Awaited<ReturnType<typeof getOverview>> | null = null;
  let dbError: string | null = null;
  try {
    overview = await getOverview();
  } catch (e) {
    dbError = e instanceof Error ? e.message : "unknown error";
  }

  let forward: PropertyOtb[] = [];
  try {
    forward = await getForwardOtbAll();
  } catch {
    /* on-the-books data optional */
  }
  const hasForward = forward.some((p) => p.months.length > 0);

  // Forward booking pace vs same time last year — used to flag whether the
  // on-the-books occupancy is actually ahead or behind, not just its level.
  let pace: PropertyPace[] = [];
  try {
    pace = await getForwardLook();
  } catch {
    /* pace optional */
  }
  const paceDelta = new Map<string, number>(); // "CODE|YYYY-MM" → pts vs LY
  for (const p of pace) for (const m of p.months) if (m.delta != null) paceDelta.set(`${p.code}|${m.month}`, m.delta);
  const paceAvg = new Map<string, number>(); // "CODE" → mean forward delta
  for (const p of pace) {
    const ds = p.months.map((m) => m.delta).filter((d): d is number => d != null);
    if (ds.length) paceAvg.set(p.code, ds.reduce((a, b) => a + b, 0) / ds.length);
  }

  let kpi: Awaited<ReturnType<typeof getKpiDeltas>> | null = null;
  try {
    kpi = await getKpiDeltas("2026");
  } catch {
    /* YoY context optional */
  }

  let briefing: Awaited<ReturnType<typeof getBriefing>> | null = null;
  try {
    briefing = await getBriefing();
  } catch {
    /* briefing optional */
  }

  const updatedThrough = overview?.dataTo
    ? new Date(overview.dataTo).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const hasData = overview && overview.rowCount > 0;
  const overallMonthly =
    overview?.monthLabels.map((m, i) => ({
      label: monthShort(m),
      value: overview!.properties.reduce((s, p) => s + (p.months[i]?.revenue ?? 0), 0),
    })) ?? [];

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-1 py-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Blue Karma · Market Analytics</h1>
            {hasData ? <Badge>Live data</Badge> : <Badge variant="secondary">Milestone 1</Badge>}
            {hasData && updatedThrough && (
              <span className="text-xs text-muted-foreground">· data through {updatedThrough}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Revenue-management dashboard for Blue Karma Dijiwa Group — Seminyak, Ubud &amp; Village.
          </p>
          <nav className="mt-1 flex flex-wrap gap-2 text-sm">
            <Link href="/compare" className="rounded-md border px-2.5 py-1 font-medium hover:bg-accent">Compare properties →</Link>
            <Link href="/pace" className="rounded-md border px-2.5 py-1 font-medium hover:bg-accent">Pickup &amp; pace →</Link>
            <Link href="/budget" className="rounded-md border px-2.5 py-1 font-medium hover:bg-accent">Budget vs actual →</Link>
          </nav>
        </div>
      </header>

      <div className="container space-y-8 py-8">
        {dbError ? (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Database not connected</CardTitle>
              <CardDescription>{dbError}</CardDescription>
            </CardHeader>
          </Card>
        ) : !hasData ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No performance data yet</CardTitle>
              <CardDescription>
                Load daily revenue, then refresh.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {briefing && briefing.items.length > 0 && (
              <section className="rounded-xl border bg-primary/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary"><TrendingUp className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What changed</div>
                    <ul className="space-y-1 text-sm">
                      {briefing.items.map((it, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${it.tone === "good" ? "bg-emerald-500" : it.tone === "bad" ? "bg-red-500" : "bg-muted-foreground/50"}`} />
                          <span>{it.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Group performance · 2026 YTD</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <ExportButtons dataset="workbook" period="2026" label="Download everything" />
                  <span className="text-xs text-muted-foreground">
                    {overview!.dataFrom} → {overview!.dataTo} · {formatInt(overview!.rowCount)} daily records
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Room revenue YTD" value={formatIDRFull(overview!.ytdRevenue)} sub="3 properties" d={kpi?.revenue} priorLabel={kpi?.priorLabel} />
                <Kpi label="Room nights YTD" value={formatInt(overview!.ytdRoomNights)} d={kpi?.roomNights} priorLabel={kpi?.priorLabel} />
                <Kpi label="Blended ADR" value={formatIDRFull(overview!.ytdAdr)} sub="revenue ÷ room nights" d={kpi?.adr} priorLabel={kpi?.priorLabel} />
                <Kpi label="Properties" value="3" sub="BKDS · BKDU · BKV" />
              </div>
            </section>

            {/* Forward-looking: on the books (from the latest PU sheet) */}
            {hasForward && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">On the books</h2>
                  <span className="text-xs text-muted-foreground">forward occupancy · ADR · revenue</span>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {forward.map((p) => (
                    <Card key={p.code} className="relative overflow-hidden">
                      <div className={`absolute inset-y-0 left-0 w-1 ${ACCENT[p.code]?.bar ?? "bg-primary"}`} />
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{p.code}</CardTitle>
                          <PaceBadge avg={paceAvg.get(p.code)} />
                        </div>
                        <CardDescription>On-the-books occupancy · ADR · revenue</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="text-left font-medium">Month</th>
                              <th className="text-right font-medium">Occ</th>
                              <th className="text-right font-medium" title="Booking pace vs same time last year (points)">vs LY</th>
                              <th className="text-right font-medium">ADR</th>
                              <th className="text-right font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.months.map((m) => (
                              <tr key={m.month} className="border-t border-border/40">
                                <td className="py-1">{monthShort(m.month)}</td>
                                <td className="py-1 text-right font-medium tabular-nums">{m.otbOcc != null ? `${m.otbOcc.toFixed(1)}%` : "—"}</td>
                                <td className="py-1 text-right"><PaceTag delta={paceDelta.get(`${p.code}|${m.month}`)} /></td>
                                <td className="py-1 text-right tabular-nums text-muted-foreground">{m.otbAdr != null ? formatIDRFull(m.otbAdr) : "—"}</td>
                                <td className="py-1 text-right tabular-nums text-muted-foreground">{m.otbRevenue != null ? formatIDRFull(m.otbRevenue) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <Link href={`/pace?p=${p.code}`} className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${ACCENT[p.code]?.text ?? "text-primary"} hover:underline`}>
                          Booking curve &amp; pickup →
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  On-the-books = confirmed occupancy, ADR &amp; net revenue for each upcoming month, taken from the latest PU sheet&apos;s
                  Occ on Hand line. Revenue is the plan&apos;s net figure. <span className="font-medium">vs LY</span> is the booking pace
                  in occupancy points against the same time last year — <span className="text-emerald-600">green</span> is ahead,
                  <span className="text-red-600"> red</span> is behind by 5+ points and worth a look at rates.
                </p>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Group room revenue by month</h2>
              <Card>
                <CardContent className="pt-6">
                  <Bars data={overallMonthly} color="bg-primary/80" />
                </CardContent>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Property performance</h2>
              <div className="grid gap-4 md:grid-cols-3">
                {overview!.properties.map((p) => (
                  <PropertyCard key={p.code} p={p} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Headline figures are each property&apos;s latest closed month. Revenue, ADR &amp; room nights are the gross daily
                totals; occupancy is the Occ on Hand figure from that month&apos;s PU sheet.
              </p>
            </section>
          </>
        )}
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">
          Blue Karma Dijiwa Group · Internal revenue-management tool · Built with Claude Code
        </div>
      </footer>
    </main>
  );
}
