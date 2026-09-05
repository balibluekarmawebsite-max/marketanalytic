import { cn } from "@/lib/utils";

// A small YoY / vs-target delta chip: ▲ 12.4% (green, good) · ▼ 3.1% (red, bad) ·
// – flat (muted). Renders nothing when a delta can't be computed, so callers can
// drop it in unconditionally.
//
//   mode="pct"  → percentage change  (current − previous) / |previous|
//   mode="pts"  → absolute point delta  current − previous   (for occupancy %)
//   invert      → a decrease is the good direction (e.g. cancellations)
export function DeltaChip({
  current,
  previous,
  label,
  mode = "pct",
  invert = false,
  className,
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  label?: string;
  mode?: "pct" | "pts";
  invert?: boolean;
  className?: string;
}) {
  if (current == null || previous == null || Number.isNaN(current) || Number.isNaN(previous)) return null;
  if (mode === "pct" && previous === 0) return null; // no % change from zero

  const delta = mode === "pct" ? ((current - previous) / Math.abs(previous)) * 100 : current - previous;
  const flat = Math.abs(delta) < (mode === "pct" ? 0.05 : 0.05);
  const up = delta > 0;
  const good = flat ? null : invert ? !up : up;

  const tone = good == null ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600";
  const arrow = flat ? "–" : up ? "▲" : "▼";
  const mag = Math.abs(delta);
  const text = mode === "pct" ? `${mag.toFixed(1)}%` : `${mag.toFixed(1)} pt`;

  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums", tone, className)}
      title={label ? `${up ? "+" : flat ? "" : "−"}${text} ${label}` : undefined}
    >
      <span aria-hidden className="text-[9px]">{arrow}</span>
      {text}
      {label && <span className="font-normal text-muted-foreground">{label}</span>}
    </span>
  );
}
