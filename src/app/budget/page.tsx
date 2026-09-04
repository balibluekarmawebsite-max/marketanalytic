import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getBudgetVsActual, getBudgetVsActualMonthly, getBusinessOverview, type MonthBvA, type YoyMonth } from "@/lib/analytics";
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
  if (pct >= 90) return "text-amber-600";
  return "text-red-600";
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

const occ = (v: number | null) => (v == null ? "—" : formatPct2(v));
const idr = (v: number | null) => (v == null ? "—" : formatIDRFull(v));
const int = (v: number | null) => (v == null ? "—" : formatInt(v));

// Year-over-year deltas.
const deltaPts = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
const growthPct = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? ((a - b) / b) * 100 : null);
const yoyTone = (v: number | null) => (v == null ? "text-muted-foreground" : v >= 0 ? "text-emerald-600" : "text-red-600");
const signed = (v: number | null, digits = 1, suffix = "") => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`);

export default async function BudgetPage({ searchParams }: { searchParams: { p?: string; period?: string } }) {
  const code = (searchParams.p ?? "BKDS").toUpperCase();
  if (!VALID.includes(code)) notFound();
  const period = searchParams.period ?? "2026";
  const [m, seg, bo] = await Promise.all([getBudgetVsActualMonthly(code, period), getBudgetVsActual(code, period), getBusinessOverview(code)]);
  if (!m) notFound();

  const accent = ACCENT[code] ?? { text: "text-primary", bar: "bg-primary" };
  const periods = [{ k: "2026", label: "2026 full year" }, { k: "all", label: "All" }];
  const t = m.totals;
  const maxRooms = seg ? Math.max(1, ...seg.segments.map((s) => Math.max(s.budgetRooms ?? 0, s.actualRooms ?? 0))) : 1;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Group dashboard</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Budget vs actual</h1>
            <span className="text-sm text-muted-foreground">{m.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">Revenue plan · {m.periodLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VALID.map((c) => (
              <Link key={c} href={`/budget?p=${c}&period=${period}`}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${code === c ? `${ACCENT[c].bar} text-white` : "bg-background hover:bg-accent"}`}>{c}</Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {periods.map((p) => (
              <Link key={p.k} href={`/budget?p=${code}&period=${p.k}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${period === p.k ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{p.label}</Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {m.monthsAll.map((mm) => (
              <Link key={mm} href={`/budget?p=${code}&period=${mm}`}
                className={`rounded-md border px-2 py-1 text-xs tabular-nums ${period === mm ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{monthShort(mm)} {mm.slice(2, 4)}</Link>
            ))}
          </div>
        </div>
      </header>

      <div className="container space-y-8 py-8">
        {!m.hasData ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No budget data for this period.</CardContent></Card>
        ) : (
          <>
            <div className="flex justify-end">
              <ExportButtons dataset="budget" p={code} period={period} />
            </div>

            {/* KPI strip — occupancy, rooms, revenue (all from the PU-sheet plan) */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Occupancy — budget" value={occ(t.avgBudgetOcc)} sub="avg over closed months" />
                <Kpi label="Occupancy — actual" value={occ(t.avgActualOcc)} tone={pctTone(t.avgActualOcc != null && t.avgBudgetOcc != null ? (t.avgActualOcc / t.avgBudgetOcc) * 100 : null)} sub="Occ on Hand" />
                <Kpi label="Rooms — budget" value={int(t.budgetRooms)} sub="planned rooms sold" />
                <Kpi label="Rooms — actual" value={int(t.actualRooms)} tone={pctTone(t.roomsAchieved)} sub={t.roomsAchieved != null ? `${formatPct2(t.roomsAchieved)} of budget` : undefined} />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Revenue — budget" value={idr(t.budgetRevenue)} sub="planned (net)" />
                <Kpi label="Revenue — actual" value={idr(t.actualRevenue)} tone={pctTone(t.revAchieved)} sub="from the PU sheet" />
                <Kpi label="Revenue achieved" value={t.revAchieved != null ? formatPct2(t.revAchieved) : "—"} tone={pctTone(t.revAchieved)} sub="actual ÷ budget" />
                <Kpi label="Rooms achieved" value={t.roomsAchieved != null ? formatPct2(t.roomsAchieved) : "—"} tone={pctTone(t.roomsAchieved)} sub="actual ÷ budget" />
              </div>
              <p className="text-xs text-muted-foreground">
                Budget and actual are read from the same PU sheet — budget from the plan block, actual from Occ on Hand / Room
                Sold / ADR / Revenue Nett — so they compare like-for-like. Revenue here is the plan&apos;s net figure (distinct from
                the gross daily room revenue on the dashboard). Green ≥ 100% of budget, amber ≥ 90%, red below.
              </p>
            </div>

            {/* Monthly budget vs actual */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">By month</h2>
              <Card>
                <CardContent className="overflow-x-auto pt-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th rowSpan={2} className="py-1 pr-3 text-left align-bottom font-medium">Month</th>
                        <th colSpan={2} className="px-2 py-1 text-center font-medium">Occupancy</th>
                        <th colSpan={3} className="px-2 py-1 text-center font-medium">Rooms sold</th>
                        <th colSpan={2} className="px-2 py-1 text-center font-medium">ADR</th>
                        <th colSpan={3} className="px-2 py-1 text-center font-medium">Revenue (net)</th>
                      </tr>
                      <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {["Bud", "Act", "Bud", "Act", "Ach", "Bud", "Act", "Bud", "Act", "Ach"].map((h, i) => (
                          <th key={i} className={`px-2 py-1 font-medium ${i === 0 ? "" : "text-right"} ${[1, 4, 9].includes(i) ? "pr-3" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.months.map((r: MonthBvA) => (
                        <tr key={r.month} className="border-t border-border/40">
                          <td className="py-1.5 pr-3 font-medium">
                            <Link href={`/budget?p=${code}&period=${r.month}`} className="hover:underline">{monthShort(r.month)} {r.month.slice(2, 4)}</Link>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{occ(r.budgetOcc)}</td>
                          <td className={`whitespace-nowrap px-2 py-1.5 pr-3 text-right tabular-nums font-medium ${pctTone(r.occAchieved)}`}>{occ(r.actualOcc)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{int(r.budgetRooms)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{int(r.actualRooms)}</td>
                          <td className={`whitespace-nowrap px-2 py-1.5 pr-3 text-right tabular-nums ${pctTone(r.roomsAchieved)}`}>{r.roomsAchieved != null ? `${r.roomsAchieved.toFixed(0)}%` : "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{idr(r.budgetAdr)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 pr-3 text-right tabular-nums">{idr(r.actualAdr)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{idr(r.budgetRevenue)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{idr(r.actualRevenue)}</td>
                          <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium ${pctTone(r.revAchieved)}`}>{r.revAchieved != null ? `${r.revAchieved.toFixed(0)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="py-2 pr-3">Total</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{occ(t.avgBudgetOcc)}</td>
                        <td className="px-2 py-2 pr-3 text-right tabular-nums">{occ(t.avgActualOcc)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{int(t.budgetRooms)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{int(t.actualRooms)}</td>
                        <td className={`px-2 py-2 pr-3 text-right tabular-nums ${pctTone(t.roomsAchieved)}`}>{t.roomsAchieved != null ? `${t.roomsAchieved.toFixed(0)}%` : "—"}</td>
                        <td className="px-2 py-2" colSpan={2} />
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{idr(t.budgetRevenue)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{idr(t.actualRevenue)}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${pctTone(t.revAchieved)}`}>{t.revAchieved != null ? `${t.revAchieved.toFixed(0)}%` : "—"}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            </section>

            {/* Business overview — pure actuals, 2026 vs 2025 */}
            {bo && bo.months.length > 0 && (() => {
              const bt = bo.totals;
              return (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">Business overview <span className="text-sm font-normal text-muted-foreground">· actual 2026 vs 2025</span></h2>
                    <span className="text-xs text-muted-foreground">occupancy · ADR · revenue, actuals only</span>
                  </div>
                  <Card>
                    <CardContent className="overflow-x-auto pt-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th rowSpan={2} className="py-1 pr-3 text-left align-bottom font-medium">Month</th>
                            <th colSpan={3} className="px-2 py-1 text-center font-medium">Occupancy</th>
                            <th colSpan={3} className="px-2 py-1 text-center font-medium">ADR</th>
                            <th colSpan={3} className="px-2 py-1 text-center font-medium">Revenue (net)</th>
                          </tr>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {["2026", "2025", "Δ", "2026", "2025", "Δ", "2026", "2025", "Δ"].map((h, i) => (
                              <th key={i} className={`px-2 py-1 text-right font-medium ${[2, 5, 8].includes(i) ? "pr-3" : ""}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bo.months.map((r: YoyMonth) => {
                            const oD = deltaPts(r.occ2026, r.occ2025), aD = growthPct(r.adr2026, r.adr2025), rD = growthPct(r.rev2026, r.rev2025);
                            const mkey = `2026-${String(r.month).padStart(2, "0")}`;
                            return (
                              <tr key={r.month} className="border-t border-border/40">
                                <td className="py-1.5 pr-3 font-medium">{monthShort(mkey)}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{occ(r.occ2026)}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{occ(r.occ2025)}</td>
                                <td className={`whitespace-nowrap px-2 py-1.5 pr-3 text-right tabular-nums ${yoyTone(oD)}`}>{signed(oD, 1, " pt")}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{idr(r.adr2026)}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{idr(r.adr2025)}</td>
                                <td className={`whitespace-nowrap px-2 py-1.5 pr-3 text-right tabular-nums ${yoyTone(aD)}`}>{signed(aD, 1, "%")}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{idr(r.rev2026)}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{idr(r.rev2025)}</td>
                                <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${yoyTone(rD)}`}>{signed(rD, 1, "%")}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border font-semibold">
                            <td className="py-2 pr-3">Total</td>
                            <td className="px-2 py-2 text-right tabular-nums">{occ(bt.occ2026)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{occ(bt.occ2025)}</td>
                            <td className={`px-2 py-2 pr-3 text-right tabular-nums ${yoyTone(deltaPts(bt.occ2026, bt.occ2025))}`}>{signed(deltaPts(bt.occ2026, bt.occ2025), 1, " pt")}</td>
                            <td className="px-2 py-2" colSpan={2} />
                            <td className="px-2 py-2 pr-3" />
                            <td className="px-2 py-2 text-right tabular-nums">{idr(bt.rev2026)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{idr(bt.rev2025)}</td>
                            <td className={`px-2 py-2 text-right tabular-nums ${yoyTone(growthPct(bt.rev2026, bt.rev2025))}`}>{signed(growthPct(bt.rev2026, bt.rev2025), 1, "%")}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>
                  <p className="text-xs text-muted-foreground">
                    Actual occupancy, ADR and net revenue for each month, this year against last — both from the PU sheets (2025
                    from the prior-year sheets). Δ is percentage points for occupancy, year-over-year growth for ADR and revenue
                    (green = up on last year). Totals cover the months present in both years.
                  </p>
                </section>
              );
            })()}

            {/* Secondary: channel / segment mix (rooms) from the market-segment plan */}
            {seg && seg.segments.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Planned channel mix <span className="text-sm font-normal text-muted-foreground">· rooms by market segment</span></h2>
                <Card>
                  <CardContent className="overflow-x-auto pt-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-1 pr-2 text-left font-medium">Segment</th>
                          <th className="px-2 py-1 text-right font-medium">Budget rms</th>
                          <th className="px-2 py-1 text-right font-medium">Actual rms</th>
                          <th className="px-2 py-1 text-right font-medium">Achieved</th>
                          <th className="px-2 py-1 text-left font-medium" style={{ width: 150 }}>Budget vs actual</th>
                          <th className="py-1 pl-2 text-right font-medium">Mix</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seg.segments.map((s) => (
                          <tr key={s.segment} className="border-t border-border/40">
                            <td className="py-1.5 pr-2 font-medium">{s.segment}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{int(s.budgetRooms)}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">{int(s.actualRooms)}</td>
                            <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${pctTone(s.achievedPct)}`}>{s.achievedPct != null ? `${s.achievedPct.toFixed(0)}%` : "—"}</td>
                            <td className="px-2 py-1.5">
                              <div className="relative h-3 w-full rounded bg-muted">
                                <div className="absolute inset-y-0 left-0 rounded border border-muted-foreground/40" style={{ width: `${((s.budgetRooms ?? 0) / maxRooms) * 100}%` }} />
                                <div className={`absolute inset-y-0 left-0 rounded ${accent.bar} opacity-80`} style={{ width: `${((s.actualRooms ?? 0) / maxRooms) * 100}%` }} />
                              </div>
                            </td>
                            <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{s.revSharePct != null ? `${s.revSharePct.toFixed(1)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                <p className="text-xs text-muted-foreground">Channel mix is the market-segment plan (rooms). The headline budget-vs-actual above is the authoritative monthly plan from the PU sheets.</p>
              </section>
            )}
          </>
        )}
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">Budget vs actual from the monthly revenue plan · Blue Karma Dijiwa Group</div>
      </footer>
    </main>
  );
}
