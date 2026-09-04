import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBudgetVsActual } from "@/lib/analytics";
import { ExportButtons } from "@/components/export-buttons";
import { formatIDRFull, formatInt, formatPct2, monthShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID = ["BKDS", "BKDU", "BKV"];
const ACCENT: Record<string, { text: string; bar: string }> = {
  BKDS: { text: "text-bkds", bar: "bg-bkds" },
  BKDU: { text: "text-bkdu", bar: "bg-bkdu" },
  BKV: { text: "text-bkv", bar: "bg-bkv" },
};

function pctTone(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 85) return "text-amber-600";
  return "text-red-600";
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: { p?: string; period?: string };
}) {
  const code = (searchParams.p ?? "BKDS").toUpperCase();
  if (!VALID.includes(code)) notFound();
  const period = searchParams.period ?? "2026";
  const b = await getBudgetVsActual(code, period);
  if (!b) notFound();

  const accent = ACCENT[code] ?? { text: "text-primary", bar: "bg-primary" };
  const periods = [{ k: "2026", label: "2026 full year" }, { k: "all", label: "All" }];
  const maxRooms = Math.max(1, ...b.segments.map((s) => Math.max(s.budgetRooms ?? 0, s.actualRooms ?? 0)));
  const covLabel =
    b.coverageFrom && b.coverageTo
      ? b.coverageFrom === b.coverageTo
        ? `${monthShort(b.coverageFrom)} ${b.coverageFrom.slice(0, 4)}`
        : `${monthShort(b.coverageFrom)}–${monthShort(b.coverageTo)} ${b.coverageTo.slice(0, 4)}`
      : null;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Group dashboard</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Budget vs actual</h1>
            <span className="text-sm text-muted-foreground">{b.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">Market-segment plan · {b.periodLabel}</span>
          </div>
          {/* Property selector */}
          <div className="flex flex-wrap gap-1.5">
            {VALID.map((c) => (
              <Link key={c} href={`/budget?p=${c}&period=${period}`}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${code === c ? `${ACCENT[c].bar} text-white` : "bg-background hover:bg-accent"}`}>{c}</Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {/* Period selector */}
            {periods.map((p) => (
              <Link key={p.k} href={`/budget?p=${code}&period=${p.k}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${period === p.k ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{p.label}</Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {b.monthsAll.map((m) => (
              <Link key={m} href={`/budget?p=${code}&period=${m}`}
                className={`rounded-md border px-2 py-1 text-xs tabular-nums ${period === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{monthShort(m)} {m.slice(2, 4)}</Link>
            ))}
          </div>
        </div>
      </header>

      <div className="container space-y-8 py-8">
        {!b.hasPlan ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">No plan data for this period.</CardContent>
          </Card>
        ) : (
          <>
            <div className="flex justify-end">
              <ExportButtons dataset="budget" p={code} period={period} />
            </div>
            {/* KPI strip */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Budget rooms" value={formatInt(b.totals.budgetRooms)} sub="planned rooms sold" />
                <Kpi label="Actual rooms" value={formatInt(b.totals.actualRooms)}
                  sub={`${b.totals.varianceRooms >= 0 ? "+" : ""}${formatInt(b.totals.varianceRooms)} vs budget`} />
                <Kpi label="Rooms achieved" value={formatPct2(b.totals.achievedPct)} tone={pctTone(b.totals.achievedPct)} sub="actual ÷ budget" />
                <Kpi label="Revenue budget" value={formatIDRFull(b.totals.revBudget)} sub="planned room revenue" />
              </div>
              {/* Revenue: plan vs authoritative daily actuals (neutral — see note) */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Actual revenue" value={formatIDRFull(b.actualRevenue)}
                  sub={covLabel ? `daily totals · ${covLabel}` : "no closed months yet"} />
                <Kpi label="Rev. budget (same months)" value={formatIDRFull(b.revBudgetCovered)}
                  sub={covLabel ? `plan · ${covLabel}` : "—"} />
                <Kpi label="Actual vs plan revenue"
                  value={b.revAchievedPct != null ? `${(b.revAchievedPct / 100).toFixed(2)}×` : "—"}
                  sub={covLabel ? `actual ÷ plan · ${covLabel}` : "—"} />
              </div>
              <p className="text-xs text-muted-foreground">
                Rooms (budget &amp; actual) and the revenue budget come from the market-segment plan; the room volumes
                reconcile closely with the daily data. Actual revenue is the authoritative daily room-revenue total over the
                same closed months{covLabel ? ` (${covLabel})` : ""}. Note: the plan&apos;s revenue line runs well below actual
                for the same room volume, so it appears to be recorded on a different basis — treat the actual-vs-plan revenue
                figure as indicative and reconcile the plan with Finance.
              </p>
            </div>

            {/* Segment table */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">By market segment</h2>
              <Card>
                <CardContent className="overflow-x-auto pt-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-1 pr-2 text-left font-medium">Segment</th>
                        <th className="px-2 py-1 text-right font-medium">Budget rms</th>
                        <th className="px-2 py-1 text-right font-medium">Actual rms</th>
                        <th className="px-2 py-1 text-right font-medium">Variance</th>
                        <th className="px-2 py-1 text-right font-medium">Achieved</th>
                        <th className="px-2 py-1 text-left font-medium" style={{ width: 160 }}>Budget vs actual</th>
                        <th className="px-2 py-1 text-right font-medium">Rev budget</th>
                        <th className="py-1 pl-2 text-right font-medium">Mix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.segments.map((s) => (
                        <tr key={s.segment} className="border-t border-border/40">
                          <td className="py-1.5 pr-2 font-medium">{s.segment}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{s.budgetRooms != null ? formatInt(s.budgetRooms) : "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{s.actualRooms != null ? formatInt(s.actualRooms) : "—"}</td>
                          <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${s.varianceRooms == null ? "text-muted-foreground" : s.varianceRooms >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {s.varianceRooms != null ? `${s.varianceRooms >= 0 ? "+" : ""}${formatInt(s.varianceRooms)}` : "—"}
                          </td>
                          <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium ${pctTone(s.achievedPct)}`}>{s.achievedPct != null ? formatPct2(s.achievedPct) : "—"}</td>
                          <td className="px-2 py-1.5">
                            <div className="relative h-3 w-full rounded bg-muted">
                              {/* budget = outline width, actual = filled */}
                              <div className="absolute inset-y-0 left-0 rounded border border-muted-foreground/40" style={{ width: `${((s.budgetRooms ?? 0) / maxRooms) * 100}%` }} />
                              <div className={`absolute inset-y-0 left-0 rounded ${accent.bar} opacity-80`} style={{ width: `${((s.actualRooms ?? 0) / maxRooms) * 100}%` }} />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{s.revBudget != null ? formatIDRFull(s.revBudget) : "—"}</td>
                          <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{s.revSharePct != null ? `${s.revSharePct.toFixed(1)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="py-2 pr-2">Total</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatInt(b.totals.budgetRooms)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatInt(b.totals.actualRooms)}</td>
                        <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${b.totals.varianceRooms >= 0 ? "text-emerald-600" : "text-red-600"}`}>{b.totals.varianceRooms >= 0 ? "+" : ""}{formatInt(b.totals.varianceRooms)}</td>
                        <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${pctTone(b.totals.achievedPct)}`}>{formatPct2(b.totals.achievedPct)}</td>
                        <td />
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatIDRFull(b.totals.revBudget)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-4 rounded ${accent.bar} opacity-80`} /> actual rooms</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded border border-muted-foreground/40" /> budget rooms</span>
                <span>Segments are the property&apos;s own budget plan lines. Green achievement ≥ 100%, amber ≥ 85%, red below.</span>
              </div>
            </section>
          </>
        )}
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">Budget vs actual from the market-segment plan · Blue Karma Dijiwa Group</div>
      </footer>
    </main>
  );
}
