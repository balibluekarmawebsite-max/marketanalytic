import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOverview, type PropertyPerf } from "@/lib/analytics";
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
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
                <span className="text-xs font-normal text-amber-600">needs room count</span>
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
        <Link
          href={`/p/${p.code}`}
          className={`inline-flex items-center gap-1 text-sm font-medium ${accent.text} hover:underline`}
        >
          Guest analytics →
        </Link>
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
          </div>
          <p className="text-sm text-muted-foreground">
            Revenue-management dashboard for Blue Karma Dijiwa Group — Seminyak, Ubud &amp; Village.
          </p>
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
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Group performance · 2026 YTD</h2>
                <span className="text-xs text-muted-foreground">
                  {overview!.dataFrom} → {overview!.dataTo} · {formatInt(overview!.rowCount)} daily records
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Room revenue YTD" value={formatIDRFull(overview!.ytdRevenue)} sub="3 properties" />
                <Kpi label="Room nights YTD" value={formatInt(overview!.ytdRoomNights)} />
                <Kpi label="Blended ADR" value={formatIDRFull(overview!.ytdAdr)} sub="revenue ÷ room nights" />
                <Kpi label="Properties" value="3" sub="BKDS · BKDU · BKV" />
              </div>
            </section>

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
                Headline figures are each property&apos;s latest closed month. Occupancy needs the
                room count per property — BKDU (38) is set; send BKDS &amp; BKV counts to unlock theirs.
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
