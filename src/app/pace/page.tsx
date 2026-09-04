import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getPickupDetail, type CurvePoint } from "@/lib/analytics";
import { ExportButtons } from "@/components/export-buttons";
import { monthShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID = ["BKDS", "BKDU", "BKV"];
const ACCENT: Record<string, { text: string; bar: string; stroke: string }> = {
  BKDS: { text: "text-bkds", bar: "bg-bkds", stroke: "#0284c7" },
  BKDU: { text: "text-bkdu", bar: "bg-bkdu", stroke: "#16a34a" },
  BKV: { text: "text-bkv", bar: "bg-bkv", stroke: "#ea580c" },
};

const pp1 = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const monthLabel = (m: string) => `${monthShort(m)} ${m.slice(0, 4)}`;

// Server-rendered SVG booking-pace curve: OTB occupancy vs days-before-arrival,
// this year against the same month last year.
function Curve({ thisYear, lastYear, stroke }: { thisYear: CurvePoint[]; lastYear: CurvePoint[]; stroke: string }) {
  const W = 720, H = 240, padL = 34, padR = 12, padT = 12, padB = 26;
  const leadMax = 150, leadMin = -31;
  const x = (lead: number) => padL + ((leadMax - lead) / (leadMax - leadMin)) * (W - padL - padR);
  const y = (otb: number) => padT + (1 - Math.max(0, Math.min(100, otb)) / 100) * (H - padT - padB);
  const path = (pts: CurvePoint[]) =>
    pts.length ? pts.map((p, i) => `${i ? "L" : "M"}${x(p.lead).toFixed(1)} ${y(p.otb).toFixed(1)}`).join(" ") : "";
  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = [120, 90, 60, 30, 0];
  const last = thisYear[thisYear.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }} role="img" aria-label="Booking pace curve">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-border" strokeWidth={1} opacity={0.4} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>{t}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>{t === 0 ? "1st" : `${t}d`}</text>
      ))}
      {lastYear.length > 0 && <path d={path(lastYear)} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />}
      {thisYear.length > 0 && <path d={path(thisYear)} fill="none" stroke={stroke} strokeWidth={2.5} />}
      {last && <circle cx={x(last.lead)} cy={y(last.otb)} r={3.5} fill={stroke} />}
    </svg>
  );
}

export default async function PacePage({ searchParams }: { searchParams: { p?: string; m?: string } }) {
  const code = (searchParams.p ?? "BKDS").toUpperCase();
  if (!VALID.includes(code)) notFound();
  const d = await getPickupDetail(code, searchParams.m);
  if (!d) notFound();

  const accent = ACCENT[code] ?? { text: "text-primary", bar: "bg-primary", stroke: "#334155" };
  const hasData = d.months.length > 0;
  const next = d.months[0];

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Group dashboard</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Pickup &amp; pace</h1>
            <span className="text-sm text-muted-foreground">{d.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">On the books as of {d.asOf ?? "—"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VALID.map((c) => (
              <Link key={c} href={`/pace?p=${c}`}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${code === c ? `${ACCENT[c].bar} text-white` : "bg-background hover:bg-accent"}`}>{c}</Link>
            ))}
          </div>
        </div>
      </header>

      <div className="container space-y-8 py-8">
        {!hasData ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No pickup data for this property.</CardContent></Card>
        ) : (
          <>
            <div className="flex justify-end">
              <ExportButtons dataset="pace" p={code} />
            </div>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: `${next ? monthShort(next.month) : ""} on the books`, value: pp1(next?.otbNow ?? null), sub: "occupancy now" },
                { label: "Picked up · 7 days", value: next?.pickup7 != null ? `${next.pickup7 >= 0 ? "+" : ""}${next.pickup7.toFixed(1)} pts` : "—", sub: `${next ? monthShort(next.month) : ""} occupancy` },
                { label: "Picked up · 30 days", value: next?.pickup30 != null ? `${next.pickup30 >= 0 ? "+" : ""}${next.pickup30.toFixed(1)} pts` : "—", sub: `${next ? monthShort(next.month) : ""} occupancy` },
                { label: "Pace vs last year", value: next?.paceDelta != null ? `${next.paceDelta >= 0 ? "+" : ""}${next.paceDelta.toFixed(1)} pts` : "—", sub: "same lead time", tone: next?.paceDelta == null ? "" : next.paceDelta >= 0 ? "text-emerald-600" : "text-red-600" },
              ].map((k) => (
                <Card key={k.label} className="shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                    <div className={`mt-1 text-xl font-semibold tabular-nums ${k.tone ?? ""}`}>{k.value}</div>
                    <div className="text-xs text-muted-foreground">{k.sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Booking curve */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Booking curve · <span className={accent.text}>{d.curveMonth ? monthLabel(d.curveMonth) : ""}</span></h2>
                <div className="flex flex-wrap gap-1.5">
                  {d.months.map((m) => (
                    <Link key={m.month} href={`/pace?p=${code}&m=${m.month}`}
                      className={`rounded-md border px-2 py-1 text-xs tabular-nums ${d.curveMonth === m.month ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>{monthShort(m.month)} {m.month.slice(2, 4)}</Link>
                  ))}
                </div>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <Curve thisYear={d.curveThisYear} lastYear={d.curveLastYear} stroke={accent.stroke} />
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: accent.stroke }} /> this year</span>
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded border-t-2 border-dashed border-muted-foreground" /> same month last year</span>
                    <span>X = days before the 1st (booking lead time) · Y = on-the-books occupancy %</span>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Forward months table */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">On the books by month</h2>
              <Card>
                <CardContent className="overflow-x-auto pt-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-1 pr-3 text-left font-medium">Month</th>
                        <th className="px-3 py-1 text-right font-medium">On the books</th>
                        <th className="px-3 py-1 text-right font-medium">Pickup 7d</th>
                        <th className="px-3 py-1 text-right font-medium">Pickup 30d</th>
                        <th className="px-3 py-1 text-right font-medium">Last year</th>
                        <th className="py-1 pl-3 text-right font-medium">Pace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.months.map((m) => (
                        <tr key={m.month} className="border-t border-border/40">
                          <td className="py-2 pr-3 font-medium">
                            <Link href={`/pace?p=${code}&m=${m.month}`} className="hover:underline">{monthLabel(m.month)}</Link>
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{pp1(m.otbNow)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${m.pickup7 == null ? "text-muted-foreground" : m.pickup7 > 0 ? "text-emerald-600" : ""}`}>{m.pickup7 != null ? `${m.pickup7 >= 0 ? "+" : ""}${m.pickup7.toFixed(1)}` : "—"}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${m.pickup30 == null ? "text-muted-foreground" : m.pickup30 > 0 ? "text-emerald-600" : ""}`}>{m.pickup30 != null ? `${m.pickup30 >= 0 ? "+" : ""}${m.pickup30.toFixed(1)}` : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pp1(m.stly)}</td>
                          <td className={`py-2 pl-3 text-right font-medium tabular-nums ${m.paceDelta == null ? "text-muted-foreground" : m.paceDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{m.paceDelta != null ? `${m.paceDelta >= 0 ? "+" : ""}${m.paceDelta.toFixed(1)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                On-the-books = confirmed occupancy for that month as of {d.asOf}. Pickup = occupancy points added in the last 7 / 30 days.
                Pace compares against the same lead time last year (green = ahead). Figures are occupancy %, from the pickup snapshots.
              </p>
            </section>
          </>
        )}
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">Pickup &amp; pace from the forward booking snapshots · Blue Karma Dijiwa Group</div>
      </footer>
    </main>
  );
}
