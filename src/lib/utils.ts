import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Indonesian Rupiah, compact for large sums. */
export function formatIDR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

/** Format a 0–100 percentage, or an em dash when unknown. */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/** Compact IDR: Rp 3.38 B / Rp 2.9 M / Rp 450 K. */
export function formatIDRCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `Rp ${(value / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `Rp ${(value / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `Rp ${Math.round(value / 1e3)} K`;
  return `Rp ${Math.round(value)}`;
}

/** Integer with thousands separators. */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

/** "2026-01" -> "Jan". */
export function monthShort(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10);
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? ym;
}
