import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPropertyAnalytics, type Dim } from "@/lib/property-analytics";
import { formatIDRFull, formatInt, monthShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID = ["BKDS", "BKDU", "BKV"];
const ACCENT: Record<string, string> = { BKDS: "text-bkds", BKDU: "text-bkdu", BKV: "text-bkv" };

// Common nationality codes → readable names (falls back to the raw code).
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

function pct(part: number, whole: number) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

function DimTable({ title, rows, total, limit = 12, nameFn }: {
  title: string; rows: Dim[]; total: number; limit?: number; nameFn?: (k: string) => string;
}) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const restRes = rest.reduce((s, r) => s + r.reservations, 0);
  const restNights = rest.reduce((s, r) => s + r.roomNights, 0);
  const restRev = rest.reduce((s, r) => s + r.revenue, 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">{title.includes("ationalit") ? "Nationality" : title.includes("egment") ? "Segment" : "Agent"}</th>
                <th className="py-1.5 text-right font-medium">Bookings</th>
                <th className="py-1.5 text-right font-medium">Room nts</th>
                <th className="py-1.5 text-right font-medium">Revenue</th>
                <th className="py-1.5 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-b border-border/50">
                  <td className="py-1.5">{nameFn ? nameFn(r.key) : r.key}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatInt(r.reservations)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatInt(r.roomNights)}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.revenue > 0 ? formatIDRFull(r.revenue) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct(r.roomNights, total)}</td>
                </tr>
              ))}
              {rest.length > 0 && (
                <tr className="text-muted-foreground">
                  <td className="py-1.5">+{rest.length} others</td>
                  <td className="py-1.5 text-right tabular-nums">{formatInt(restRes)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatInt(restNights)}</td>
                  <td className="py-1.5 text-right tabular-nums">{restRev > 0 ? formatIDRFull(restRev) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(restNights, total)}</td>
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
  searchParams: { period?: string };
}) {
  const code = params.code.toUpperCase();
  if (!VALID.includes(code)) notFound();
  const period = searchParams.period ?? "2026";
  const a = await getPropertyAnalytics(code, period);
  if (!a) notFound();

  const accent = ACCENT[code] ?? "text-primary";
  const periods = [
    { k: "2026", label: "2026 YTD" },
    { k: "2025", label: "2025 YTD" },
    { k: "all", label: "All time" },
  ];
  const maxCell = Math.max(1, ...a.matrix.flatMap((m) => m.byMonth));

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
          {/* period selector */}
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => (
              <Link key={p.k} href={`/p/${code}?period=${p.k}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${period === p.k ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>
                {p.label}
              </Link>
            ))}
            <span className="mx-1 w-px bg-border" />
            {a.monthsAll.slice().reverse().map((m) => (
              <Link key={m} href={`/p/${code}?period=${m}`}
                className={`rounded-md border px-2 py-1 text-xs tabular-nums ${period === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>
                {monthShort(m)} {m.slice(2, 4)}
              </Link>
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

        {/* Nationality × month matrix */}
        {a.periodMonths.length > 1 && a.matrix.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Nationality by month <span className="text-sm font-normal text-muted-foreground">(room nights, top 8)</span></h2>
            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 text-left font-medium">Nationality</th>
                      {a.periodMonths.map((m) => (
                        <th key={m} className="px-1 py-1 text-right font-medium tabular-nums">{monthShort(m)}</th>
                      ))}
                      <th className="py-1 pl-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.matrix.map((row) => (
                      <tr key={row.nat} className="border-t border-border/40">
                        <td className="py-1.5 pr-2 font-medium">{cname(row.nat)}</td>
                        {row.byMonth.map((v, i) => (
                          <td key={i} className="px-1 py-1.5 text-right tabular-nums"
                            style={{ backgroundColor: v > 0 ? `rgba(2,132,199,${(0.1 + 0.6 * (v / maxCell)).toFixed(3)})` : undefined }}>
                            {v || ""}
                          </td>
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

        {/* Nationality + Segment tables */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DimTable title="Nationality" rows={a.nationalities} total={a.totals.roomNights} nameFn={cname} />
          <DimTable title="Market segment" rows={a.segments} total={a.totals.roomNights} limit={14} />
        </div>

        {/* Agents */}
        <DimTable title="Agent / channel" rows={a.agents} total={a.totals.roomNights} limit={15} />

        {/* Nationality by segment */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Top nationalities by segment</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {a.segTop.map((s) => (
              <Card key={s.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{s.key}</CardTitle>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatInt(s.roomNights)} nts</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {s.tops.map((t) => (
                    <div key={t.key} className="flex justify-between text-sm">
                      <span>{cname(t.key)}</span>
                      <span className="tabular-nums text-muted-foreground">{formatInt(t.reservations)}</span>
                    </div>
                  ))}
                  {s.revenue > 0 && (
                    <div className="mt-1 border-t pt-1 text-xs text-muted-foreground">
                      Revenue {formatIDRFull(s.revenue)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">
          Guest analytics derived from the arrival list · Blue Karma Dijiwa Group
        </div>
      </footer>
    </main>
  );
}
