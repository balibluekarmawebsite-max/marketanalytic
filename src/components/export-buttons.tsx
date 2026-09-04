import { Download } from "lucide-react";

// Presentational download links. A plain <a> triggers the browser download
// (the API sets Content-Disposition: attachment); the session cookie rides along
// on the same-origin navigation, so the export stays behind auth.
export function ExportButtons({
  dataset,
  p,
  period,
  label = "Export",
}: {
  dataset: "workbook" | "overview" | "comparison" | "budget" | "pace" | "guest";
  p?: string;
  period?: string;
  label?: string;
}) {
  const href = (format: "xlsx" | "csv") => {
    const s = new URLSearchParams({ dataset, format });
    if (p) s.set("p", p);
    if (period) s.set("period", period);
    return `/api/export?${s.toString()}`;
  };
  const cls = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent";
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <a href={href("xlsx")} className={cls}><Download className="h-3 w-3" /> Excel</a>
      <a href={href("csv")} className={cls}><Download className="h-3 w-3" /> CSV</a>
    </div>
  );
}
