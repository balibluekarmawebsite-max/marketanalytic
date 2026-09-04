import { Download } from "lucide-react";

// Presentational download links. A plain <a> triggers the browser download
// (the API sets Content-Disposition: attachment); the session cookie rides along
// on the same-origin navigation, so the export stays behind auth.
export function ExportButtons({
  dataset,
  p,
  period,
  label = "Export",
  monthly = false,
}: {
  dataset: "workbook" | "overview" | "comparison" | "budget" | "pace" | "guest";
  p?: string;
  period?: string;
  label?: string;
  // When true and the period spans more than one month, also offer a
  // "by month" export that separates the data per month.
  monthly?: boolean;
}) {
  const href = (format: "xlsx" | "csv", split?: "month") => {
    const s = new URLSearchParams({ dataset, format });
    if (p) s.set("p", p);
    if (period) s.set("period", period);
    if (split) s.set("split", split);
    return `/api/export?${s.toString()}`;
  };
  const cls = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent";
  // A single-month period ("YYYY-MM") wouldn't split into anything, so hide it.
  const showMonthly = monthly && !(period && /^\d{4}-\d{2}$/.test(period));
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <a href={href("xlsx")} className={cls}><Download className="h-3 w-3" /> Excel</a>
      <a href={href("csv")} className={cls}><Download className="h-3 w-3" /> CSV</a>
      {showMonthly && (
        <>
          <span className="text-xs text-muted-foreground">· by month:</span>
          <a href={href("xlsx", "month")} className={cls}><Download className="h-3 w-3" /> Excel</a>
          <a href={href("csv", "month")} className={cls}><Download className="h-3 w-3" /> CSV</a>
        </>
      )}
    </div>
  );
}
