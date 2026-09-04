import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DimTable, type DimRow } from "@/components/dim-table";
import { ExportButtons } from "@/components/export-buttons";
import { getPropertyAnalytics, type Dim } from "@/lib/property-analytics";
import { getRoomCategoryOccupancy } from "@/lib/analytics";
import { formatIDRFull, formatInt, formatPct2, monthShort } from "@/lib/utils";
import { countryName as cname } from "@/lib/countries";

export const dynamic = "force-dynamic";

const VALID = ["BKDS", "BKDU", "BKV"];
const ACCENT: Record<string, string> = { BKDS: "text-bkds", BKDU: "text-bkdu", BKV: "text-bkv" };
const BAR: Record<string, string> = { BKDS: "bg-bkds", BKDU: "bg-bkdu", BKV: "bg-bkv" };

const toRows = (dims: Dim[], nameFn?: (k: string) => string, hrefFn?: (k: string) => string): DimRow[] =>
  dims.map((d) => ({
    key: d.key,
    label: nameFn ? nameFn(d.key) : d.key,
    href: hrefFn ? hrefFn(d.key) : undefined,
    reservations: d.reservations,
    roomNights: d.roomNights,
    revenue: d.revenue,
  }));

export default async function PropertyPage({
  params, searchParams,
}: {
  params: { code: string };
  searchParams: { period?: string; seg?: string; agent?: string };
}) {
  const code = params.code.toUpperCase();
  if (!VALID.includes(code)) notFound();
  const period = searchParams.period ?? "2026";
  const seg = searchParams.seg;
  const agent = searchParams.agent;
  const [a, rc] = await Promise.all([
    getPropertyAnalytics(code, period, seg, agent),
    getRoomCategoryOccupancy(code, period),
  ]);
  if (!a) notFound();

  const accent = ACCENT[code] ?? "text-primary";
  const bar = BAR[code] ?? "bg-primary";
  const periods = [{ k: "2026", label: "2026 YTD" }, { k: "2025", label: "2025 YTD" }, { k: "all", label: "All time" }];
  const maxCell = Math.max(1, ...a.matrix.flatMap((m) => m.byMonth));
  const ctx = agent ? `&agent=${encodeURIComponent(agent)}` : seg ? `&seg=${encodeURIComponent(seg)}` : "";
  const segHref = (k: string) => `/p/${code}?period=${period}&seg=${encodeURIComponent(k)}`;
  const agentHref = (k: string) => `/p/${code}?period=${period}&agent=${encodeURIComponent(k)}`;
  const sd = a.segmentDetail;
  const ad = a.agentDetail;
  const maxAgentMonth = ad ? Math.max(1, ...ad.byMonth.map((m) => m.reservations)) : 1;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Group dashboard</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={`text-xl font-semibold tracking-tight ${accent}`}>{code}</h1>
            <span className="text-sm text-muted-foreground">{a.name}</span>
            {a.city && <Badge variant="secondary">{a.city}</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">Guest analytics · {a.periodLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => (
              <Link key={p.k} href={`/p/${code}?period=${p.k}${ctx}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${period === p.k ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{p.label}</Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {a.monthsAll.slice().reverse().map((m) => (
              <Link key={m} href={`/p/${code}?period=${m}${ctx}`}
                className={`rounded-md border px-2 py-1 text-xs tabular-nums ${period === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{monthShort(m)} {m.slice(2, 4)}</Link>
            ))}
          </div>
        </div>
      </header>

      <div className="container space-y-8 py-8">
        <div className="flex justify-end">
          <ExportButtons dataset="guest" p={code} period={period} label="Export guest data" />
        </div>
        {/* KPIs */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Bookings", value: formatInt(a.totals.reservations), sub: "reservations" },
              { label: "Room nights", value: formatInt(a.totals.roomNights), sub: a.reconciled ? "matched to daily" : "arrival basis" },
              { label: "Room revenue", value: formatIDRFull(a.totals.revenue), sub: a.reconciled ? "matched to daily totals" : "from reservations" },
              { label: "ADR", value: formatIDRFull(a.totals.adr) },
            ].map((k) => (
              <Card key={k.label} className="shadow-none">
                <CardContent className="p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{k.value}</div>
                  {k.sub && <div className="text-xs text-muted-foreground">{k.sub}</div>}
                </CardContent>
              </Card>
            ))}
          </div>
          {a.reconciled && (
            <p className="text-xs text-muted-foreground">
              Revenue &amp; room nights are reconciled to the authoritative daily room-revenue totals;
              the mix (nationality · segment · agent · room type) comes from the reservation list.
              Bookings are the reservation count.
            </p>
          )}
        </div>

        {/* Room category occupancy */}
        {rc && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Room category occupancy</h2>
              <span className="text-xs text-muted-foreground">
                {rc.totalUnits} rooms{rc.hasData ? ` · ${rc.cleanMonths.length} month${rc.cleanMonths.length === 1 ? "" : "s"} with room-type detail` : ""}
              </span>
            </div>
            {rc.hasData ? (
              <>
                <Card>
                  <CardContent className="overflow-x-auto pt-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 text-left font-medium">Category</th>
                          <th className="px-2 py-2 text-right font-medium">Units</th>
                          <th className="px-2 py-2 text-right font-medium">Room-nights sold / available</th>
                          <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 170 }}>% sold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rc.groups.map((g) => (
                          <tr key={g.key} className="border-t border-border/40 align-top">
                            <td className="py-2.5 pr-3">
                              <div className="font-medium">{g.label}</div>
                              {(g.members.length > 1 || g.note) && (
                                <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                                  {g.members.length > 1 && <span>{g.members.map((m) => `${m.units} ${m.name}`).join(" · ")}</span>}
                                  {g.note && <span className="block italic">{g.note}</span>}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{g.units}</td>
                            <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                              {formatInt(g.soldNights)} <span className="text-muted-foreground">/ {formatInt(g.availableNights)}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 flex-1 rounded-full bg-muted">
                                  <div className={`h-full rounded-full ${bar} opacity-80`} style={{ width: `${Math.min(100, Math.max(2, g.occPct ?? 0))}%` }} />
                                </div>
                                <span
                                  title={g.occPct == null ? undefined : `${formatPct2(g.occPct)} · ${formatInt(g.soldNights)} of ${formatInt(g.availableNights)} room-nights`}
                                  className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${g.occPct != null && g.occPct > 100 ? "text-amber-600" : ""}`}
                                >{g.occPct == null ? "—" : g.occPct > 100 ? "100%+" : formatPct2(g.occPct)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2">
                          <td className="py-2.5 pr-3 font-semibold">All rooms</td>
                          <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{rc.totalUnits}</td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums">{formatInt(rc.soldNights)} <span className="font-normal text-muted-foreground">/ {formatInt(rc.availableNights)}</span></td>
                          <td className="px-3 py-2.5 font-semibold tabular-nums">{rc.occPct == null ? "—" : rc.occPct > 100 ? "100%+" : formatPct2(rc.occPct)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  % sold = room-nights sold ÷ (units × nights), from the arrival list, over the{" "}
                  {rc.cleanMonths.length} month{rc.cleanMonths.length === 1 ? "" : "s"} that carry a room-type breakdown
                  ({monthShort(rc.cleanMonths[0])} {rc.cleanMonths[0]?.slice(0, 4)} – {monthShort(rc.cleanMonths[rc.cleanMonths.length - 1])} {rc.cleanMonths[rc.cleanMonths.length - 1]?.slice(0, 4)}).
                  {rc.skippedMonths.length > 0 && (
                    <> {rc.skippedMonths.length} month{rc.skippedMonths.length === 1 ? "" : "s"} in this period had no room-type detail in the arrival file and are excluded: {rc.skippedMonths.map((m) => `${monthShort(m)} ${m.slice(0, 4)}`).join(", ")}.</>
                  )}{" "}
                  {rc.groups.some((g) => g.members.length > 1) && (
                    <>Rooms the booking system records under one code are shown together, with the members listed. </>
                  )}
                  {rc.groups.some((g) => (g.occPct ?? 0) > 100) && (
                    <> A line reads <span className="text-amber-600">100%+</span> when the bookings recorded under it span more rooms than its nominal unit count — a combined villa (a 4-bedroom is two villas joined), or same-room turnover within a single month. The base-room lines and the All-rooms total stay within capacity.</>
                  )}
                </p>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No room-type breakdown is available for {rc.periodLabel}
                  {rc.skippedMonths.length > 0 && <> — the arrival file{rc.skippedMonths.length === 1 ? "" : "s"} for {rc.skippedMonths.map((m) => `${monthShort(m)} ${m.slice(0, 4)}`).join(", ")} recorded every booking as “Unknown” room type</>}.
                  Pick a different period to see room-category occupancy.
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* Agent drill-down */}
        {ad ? (
          <section className="space-y-3 rounded-xl border-2 border-primary/40 bg-background p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                Agent: <span className={accent}>{ad.agent}</span>
                <Badge variant="secondary" className="ml-2 align-middle">{ad.segment}</Badge>
              </h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="tabular-nums">{formatInt(ad.totals.reservations)} bookings · {formatInt(ad.totals.roomNights)} nts · {formatIDRFull(ad.totals.revenue)} · ADR {formatIDRFull(ad.totals.adr)}</span>
                <Link href={`/p/${code}?period=${period}${seg ? `&seg=${encodeURIComponent(seg)}` : ""}`} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">✕ close</Link>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <DimTable title={`Nationalities · ${ad.agent}`} firstCol="Nationality" rows={toRows(ad.nationalities, cname)} total={ad.totals.roomNights} />
              <DimTable title={`Room types · ${ad.agent}`} firstCol="Room type" rows={toRows(ad.roomTypes)} total={ad.totals.roomNights} />
            </div>
            {ad.byMonth.length > 1 && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Bookings by month</div>
                <div className="flex items-end gap-1.5" style={{ height: 70 }}>
                  {ad.byMonth.map((m) => (
                    <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[9px] tabular-nums text-muted-foreground">{m.reservations || ""}</span>
                      <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(2, (m.reservations / maxAgentMonth) * 80)}%` }} />
                      <span className="text-[9px] text-muted-foreground">{monthShort(m.month)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : sd ? (
          <section className="space-y-3 rounded-xl border-2 border-primary/30 bg-background p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Segment: <span className={accent}>{sd.segment}</span></h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="tabular-nums">{formatInt(sd.totals.reservations)} bookings · {formatInt(sd.totals.roomNights)} nts · {formatIDRFull(sd.totals.revenue)} · ADR {formatIDRFull(sd.totals.adr)}</span>
                <Link href={`/p/${code}?period=${period}`} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">✕ close</Link>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Click an agent below to see that agent&apos;s own nationalities &amp; room types.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <DimTable title={`Agents in ${sd.segment}`} firstCol="Agent" rows={toRows(sd.agents, undefined, agentHref)} total={sd.totals.roomNights} />
              <DimTable title={`Nationalities in ${sd.segment}`} firstCol="Nationality" rows={toRows(sd.nationalities, cname)} total={sd.totals.roomNights} />
              <DimTable title={`Room types in ${sd.segment}`} firstCol="Room type" rows={toRows(sd.roomTypes)} total={sd.totals.roomNights} />
            </div>
          </section>
        ) : null}

        {/* Nationality × month */}
        {a.periodMonths.length > 1 && a.matrix.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Nationality by month <span className="text-sm font-normal text-muted-foreground">(room nights, top 8)</span></h2>
            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 text-left font-medium">Nationality</th>
                      {a.periodMonths.map((m) => <th key={m} className="px-1 py-1 text-right font-medium tabular-nums">{monthShort(m)}</th>)}
                      <th className="py-1 pl-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.matrix.map((row) => (
                      <tr key={row.nat} className="border-t border-border/40">
                        <td className="py-1.5 pr-2 font-medium">{cname(row.nat)}</td>
                        {row.byMonth.map((v, i) => (
                          <td key={i} className="px-1 py-1.5 text-right tabular-nums" style={{ backgroundColor: v > 0 ? `rgba(2,132,199,${(0.1 + 0.6 * (v / maxCell)).toFixed(3)})` : undefined }}>{v || ""}</td>
                        ))}
                        <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{formatInt(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Nationality + Segment */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DimTable title="Nationality" firstCol="Nationality" rows={toRows(a.nationalities, cname)} total={a.totals.roomNights} />
          <div className="space-y-1">
            <DimTable title="Market segment" firstCol="Segment" rows={toRows(a.segments, undefined, segHref)} total={a.totals.roomNights} />
            <p className="px-1 text-xs text-muted-foreground">Click a segment for its agents &amp; nationalities.</p>
          </div>
        </div>

        {/* Room type + Agent */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DimTable title="Room type" firstCol="Room type" rows={toRows(a.roomTypes)} total={a.totals.roomNights} />
          <div className="space-y-1">
            <DimTable title="Agent / channel" firstCol="Agent" rows={toRows(a.agents, undefined, agentHref)} total={a.totals.roomNights} />
            <p className="px-1 text-xs text-muted-foreground">Click an agent for its own nationalities &amp; room types.</p>
          </div>
        </div>

        {/* Nationality by segment */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Top nationalities by segment</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {a.segTop.map((s) => (
              <Card key={s.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Link href={segHref(s.key)} className="text-sm font-semibold text-primary hover:underline">{s.key} →</Link>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatInt(s.roomNights)} nts</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {s.tops.map((t) => (
                    <div key={t.key} className="flex justify-between text-sm"><span>{cname(t.key)}</span><span className="tabular-nums text-muted-foreground">{formatInt(t.reservations)}</span></div>
                  ))}
                  {s.revenue > 0 && <div className="mt-1 border-t pt-1 text-xs text-muted-foreground">Revenue {formatIDRFull(s.revenue)}</div>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">Guest analytics derived from the arrival list · Blue Karma Dijiwa Group</div>
      </footer>
    </main>
  );
}
