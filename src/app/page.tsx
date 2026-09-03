import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

// This page reads seeded Property rows from Postgres, so render it dynamically
// rather than at build time (when no database is available).
export const dynamic = "force-dynamic";

type PropertyRow = {
  code: string;
  name: string;
  city: string | null;
  roomsAvailable: number | null;
  currency: string;
};

async function getProperties(): Promise<{
  properties: PropertyRow[];
  dbError: string | null;
}> {
  try {
    const properties = await prisma.property.findMany({
      orderBy: { code: "asc" },
    });
    return { properties, dbError: null };
  } catch (error) {
    return {
      properties: [],
      dbError: error instanceof Error ? error.message : "unknown error",
    };
  }
}

const FORWARD_LOOKING = [
  {
    label: "Pickup (last 24h / 7d)",
    hint: "Rooms & revenue added for future dates",
    milestone: "M10",
  },
  {
    label: "On-the-books occupancy",
    hint: "Next 30 / 60 / 90 days, STLY overlay",
    milestone: "M10",
  },
  {
    label: "Booking pace vs STLY",
    hint: "OTB now vs same-days-out last year",
    milestone: "M10",
  },
];

const KPI_STRIP = [
  "Revenue MTD",
  "Room nights MTD",
  "ADR",
  "Occupancy %",
  "Unique guests",
  "% Repeater",
  "Top segment",
  "Top nationality",
];

const ROADMAP = [
  { n: 1, label: "Setup — Next.js, Prisma, Postgres, Docker, seeds", done: true },
  { n: 2, label: "Upload + parse foundation", done: false },
  { n: 3, label: "Sheet-name parser (property / month / year)", done: false },
  { n: 4, label: "Archetype A ingest — reservations", done: false },
  { n: 5, label: "Guest analytics dashboard", done: false },
  { n: 6, label: "Archetype B ingest + base KPIs", done: false },
  { n: 7, label: "Archetype C — segment budget vs actual", done: false },
  { n: 8, label: "Property comparison + global filters", done: false },
  { n: 9, label: "Auth + user management", done: false },
  { n: 10, label: "Archetype D — pickup / pace", done: false },
  { n: 11, label: "Export + monthly PDF report", done: false },
  { n: 12, label: "AI insights (Groq, EN/ID)", done: false },
];

const PROPERTY_ACCENT: Record<string, string> = {
  BKDS: "bg-bkds",
  BKDU: "bg-bkdu",
  BKV: "bg-bkv",
};

export default async function Home() {
  const { properties, dbError } = await getProperties();

  return (
    <main className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-1 py-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary" />
            <h1 className="text-xl font-semibold tracking-tight">
              Blue Karma · Market Analytics
            </h1>
            <Badge variant="secondary">Milestone 1</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Revenue-management dashboard for Blue Karma Dijiwa Group — Seminyak,
            Ubud &amp; Village.
          </p>
        </div>
      </header>

      <div className="container space-y-8 py-8">
        {/* DB status banner */}
        {dbError ? (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">
                Database not connected yet
              </CardTitle>
              <CardDescription>
                The app is running, but it can&apos;t reach Postgres. Start the
                database and seed it, then refresh:
                <code className="mt-2 block rounded bg-muted p-2 text-xs">
                  docker compose up -d db
                  <br />
                  npm run db:push &amp;&amp; npm run db:seed
                </code>
                <span className="mt-2 block text-xs opacity-70">
                  ({dbError})
                </span>
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card className="border-emerald-500/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Setup verified
              </CardTitle>
              <CardDescription>
                App is live and connected to Postgres. {properties.length}{" "}
                properties seeded. The dashboards below are scaffolding —
                real numbers land as each milestone ships.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Persistent KPI strip (placeholder) */}
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {KPI_STRIP.map((kpi) => (
              <Card key={kpi} className="shadow-none">
                <CardContent className="p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {kpi}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-muted-foreground/50">
                    —
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Daily forward-looking — the three numbers that matter daily */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Daily forward-looking</h2>
            <span className="text-xs text-muted-foreground">
              The only three metrics that need daily attention
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {FORWARD_LOOKING.map((m) => (
              <Card key={m.label} className="relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1 bg-primary/80" />
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{m.label}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {m.milestone}
                    </Badge>
                  </div>
                  <CardDescription>{m.hint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-muted-foreground/40">
                    —
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Property comparison — seeded from the database */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Properties</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {properties.length === 0 && !dbError ? (
              <p className="text-sm text-muted-foreground">
                No properties seeded yet. Run{" "}
                <code className="rounded bg-muted px-1">npm run db:seed</code>.
              </p>
            ) : (
              properties.map((p) => (
                <Card key={p.code} className="relative overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 w-1 ${
                      PROPERTY_ACCENT[p.code] ?? "bg-primary"
                    }`}
                  />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{p.code}</CardTitle>
                      <Badge variant="secondary">{p.city ?? "—"}</Badge>
                    </div>
                    <CardDescription>{p.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Rooms available
                      </span>
                      <span className="font-medium">
                        {p.roomsAvailable ?? (
                          <span className="text-amber-600">needs count</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Currency</span>
                      <span className="font-medium">{p.currency}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Build roadmap */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Build roadmap</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {ROADMAP.map((step) => (
                  <li
                    key={step.n}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        step.done
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step.done ? "✓" : step.n}
                    </span>
                    <span
                      className={
                        step.done ? "font-medium" : "text-muted-foreground"
                      }
                    >
                      {step.label}
                    </span>
                    {step.done && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        done
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>

      <footer className="border-t bg-background py-6">
        <div className="container text-xs text-muted-foreground">
          Blue Karma Dijiwa Group · Internal revenue-management tool · Built with
          Claude Code
        </div>
      </footer>
    </main>
  );
}
