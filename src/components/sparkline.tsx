import { cn } from "@/lib/utils";

// Tiny inline trend line — hand-rolled SVG, no chart library. Draws `data` as a
// polyline in a fixed box and dots the last point. Colour comes from the current
// text color (set a `text-*` class via className). Renders nothing for <2 points.
export function Sparkline({
  data,
  className,
  width = 68,
  height = 22,
}: {
  data: (number | null | undefined)[];
  className?: string;
  width?: number;
  height?: number;
}) {
  const pts = data.filter((v): v is number => v != null && !Number.isNaN(v));
  if (pts.length < 2) return null;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const dx = w / (pts.length - 1);
  const coords = pts.map((v, i) => [pad + i * dx, pad + h - ((v - min) / range) * h] as const);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      <circle cx={lx} cy={ly} r={1.7} fill="currentColor" />
    </svg>
  );
}
