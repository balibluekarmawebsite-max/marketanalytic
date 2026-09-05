import Link from "next/link";
import { periodPresets } from "@/lib/period";
import { monthShort } from "@/lib/utils";

// Compact period control: preset chips (YTD per year · Last 3 / 6 months · All
// time) plus a "Month ▾" disclosure listing every month. A native <details>
// keeps it a Server Component — no client JS — and it closes on navigation.
export function PeriodPicker({
  period,
  months,
  href,
}: {
  period: string;
  months: string[]; // available "YYYY-MM"
  href: (p: string) => string;
}) {
  const presets = periodPresets(months);
  const monthsDesc = Array.from(new Set(months)).sort().reverse();
  const isMonth = /^\d{4}-\d{2}$/.test(period);
  const chip = (active: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((p) => (
        <Link key={p.k} href={href(p.k)} className={chip(period === p.k)}>{p.label}</Link>
      ))}
      {monthsDesc.length > 0 && (
        <details className="relative">
          <summary className={`${chip(isMonth)} cursor-pointer list-none select-none`}>
            {isMonth ? `${monthShort(period)} ${period.slice(2, 4)}` : "Month"} ▾
          </summary>
          <div className="absolute right-0 z-20 mt-1 grid max-h-64 w-44 grid-cols-2 gap-1 overflow-auto rounded-md border bg-background p-2 shadow-lg">
            {monthsDesc.map((m) => (
              <Link
                key={m}
                href={href(m)}
                className={`rounded px-2 py-1 text-center text-xs tabular-nums ${period === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {monthShort(m)} {m.slice(2, 4)}
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
