import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPropertyAnalytics, type Dim } from "@/lib/property-analytics";
import { formatIDRFull, formatInt, monthShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID = ["BKDS", "BKDU", "BKV"];
const ACCENT: Record<string, string> = { BKDS: "text-bkds", BKDU: "text-bkdu", BKV: "text-bkv" };

const CC: Record<string, string> = {
  AUS: "Australia", FRA: "France", GBR: "United Kingdom", NLD: "Netherlands", CHN: "China",
  DEU: "Germany", NZL: "New Zealand", USA: "United States", PRT: "Portugal", JPN: "Japan",
  ITA: "Italy", HUN: "Hungary", PAK: "Pakistan", ARE: "UAE", SAU: "Saudi Arabia", IDN: "Indonesia",
  SGP: "Singapore", KOR: "South Korea", IND: "India", CAN: "Canada", CHE: "Switzerland",
  BEL: "Belgium", ESP: "Spain", SWE: "Sweden", RUS: "Russia", THA: "Thailand", MYS: "Malaysia",
  HKG: "Hong Kong", TWN: "Taiwan", PHL: "Philippines", BRA: "Brazil", ZAF: "South Africa",
  IRL: "Ireland", AUT: "Austria", DNK: "Denmark", NOR: "Norway", FIN: "Finland", POL: "Poland",
  ISR: "Israel", DZA: "Algeria", UKR: "Ukraine", CZE: "Czechia", GRC: "Greece", MEX: "Mexico",
};
const cname = (c: string) => CC[c] ?? c;
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

function DimTable({ title, firstCol, rows, total, limit = 12, nameFn, hrefFn }: {
  title: string; firstCol: string; rows: Dim[]; total: number; limit?: number;
  nameFn?: (k: string) => string; hrefFn?: (k: string) => string;
}) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const r = (a: number, b: number, c: number) => ({ a, b, c });
  const restAgg = rest.reduce((s, x) => r(s.a + x.reservations, s.b + x.roomNights, s.c + x.revenue), r(0, 0, 0));
  const numTd = "py-1.5 text-right tabular-nums whitespace-nowrap";
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">{firstCol}</th>
                <th className="py-1.5 text-right font-medium">Bookings</th>
                <th className="py-1.5 text-right font-medium">Nts</th>
                <th className="py-1.5 text-right font-medium">Revenue</th>
                <th className="py-1.5 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const label = nameFn ? nameFn(row.key) : row.key;
                return (
                  <tr key={row.key} className="border-b border-border/50">
                    <td className="py-1.5 pr-2">
                      {hrefFn ? <Link href={hrefFn(row.key)} className="font-medium text-primary hover:underline">{label} →</Link> : label}
                    </td>
                    <td className={numTd}>{formatInt(row.reservations)}</td>
                    <td className={numTd}>{formatInt(row.roomNights)}</td>
                    <td className={numTd}>{row.revenue > 0 ? formatIDRFull(row.revenue) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct(row.roomNights, total)}</td>
                  </tr>
                );
              })}
              {rest.length > 0 && (
                <tr className="text-muted-foreground">
                  <td className="py-1.5">+{rest.length} others</td>
                  <td className={numTd}>{formatInt(restAgg.a)}</td>
                  <td className={numTd}>{formatInt(restAgg.b)}</td>
                  <td className={numTd}>{restAgg.c > 0 ? formatIDRFull(restAgg.c) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(restAgg.b, total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const a = await getPropertyAnalytics(code, period, seg, agent);
  if (!a) notFound();

  const accent = ACCENT[code] ?? "text-primary";
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
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Bookings", value: formatInt(a.totals.reservations) },
            { label: "Room nights", value: formatInt(a.totals.roomNights) },
            { label: "Room revenue", value: formatIDRFull(a.totals.revenue), sub: "from reservations" },
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

        {/* Agent drill-down (takes priority when set) */}
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
              <DimTable title={`Nationalities · ${ad.agent}`} firstCol="Nationality" rows={ad.nationalities} total={ad.totals.roomNights} limit={15} nameFn={cname} />
              <DimTable title={`Room types · ${ad.agent}`} firstCol="Room type" rows={ad.roomTypes} total={ad.totals.roomNights} limit={15} />
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
            <div className="grid gap-4 lg:grid-cols-3">
              <DimTable title={`Agents in ${sd.segment}`} firstCol="Agent" rows={sd.agents} total={sd.totals.roomNights} limit={12} hrefFn={agentHref} />
              <DimTable title={`Nationalities in ${sd.segment}`} firstCol="Nationality" rows={sd.nationalities} total={sd.totals.roomNights} limit={12} nameFn={cname} />
              <DimTable title={`Room types in ${sd.segment}`} firstCol="Room type" rows={sd.roomTypes} total={sd.totals.roomNights} limit={12} />
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

        {/* Nationality + Segment (segment rows clickable) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DimTable title="Nationality" firstCol="Nationality" rows={a.nationalities} total={a.totals.roomNights} nameFn={cname} />
          <div className="space-y-1">
            <DimTable title="Market segment" firstCol="Segment" rows={a.segments} total={a.totals.roomNights} limit={14} hrefFn={segHref} />
            <p className="px-1 text-xs text-muted-foreground">Click a segment for its agents &amp; nationalities.</p>
          </div>
        </div>

        {/* Room type + Agent (agent rows clickable) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DimTable title="Room type" firstCol="Room type" rows={a.roomTypes} total={a.totals.roomNights} limit={14} />
          <div className="space-y-1">
            <DimTable title="Agent / channel" firstCol="Agent" rows={a.agents} total={a.totals.roomNights} limit={14} hrefFn={agentHref} />
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
