"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIDRFull, formatInt } from "@/lib/utils";

export type DimRow = {
  key: string;
  label: string;
  href?: string;
  reservations: number;
  roomNights: number;
  revenue: number;
};

/**
 * Ranked breakdown table. Shows the first `limit` rows; the "+N others" row is
 * clickable to expand the full list in place (and collapse again).
 */
export function DimTable({
  title, firstCol, rows, total, limit = 10,
}: {
  title: string; firstCol: string; rows: DimRow[]; total: number; limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = (part: number) => (total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—");
  const shown = expanded ? rows : rows.slice(0, limit);
  const rest = expanded ? [] : rows.slice(limit);
  const ra = rest.reduce((s, x) => ({ a: s.a + x.reservations, b: s.b + x.roomNights, c: s.c + x.revenue }), { a: 0, b: 0, c: 0 });
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
              {shown.map((row) => (
                <tr key={row.key} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">
                    {row.href ? (
                      <Link href={row.href} className="font-medium text-primary hover:underline">{row.label} →</Link>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className={numTd}>{formatInt(row.reservations)}</td>
                  <td className={numTd}>{formatInt(row.roomNights)}</td>
                  <td className={numTd}>{row.revenue > 0 ? formatIDRFull(row.revenue) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct(row.roomNights)}</td>
                </tr>
              ))}
              {rest.length > 0 && (
                <tr className="cursor-pointer border-b border-border/50 hover:bg-accent/40" onClick={() => setExpanded(true)}>
                  <td className="py-1.5 pr-2 font-medium text-primary">+{rest.length} others · show all</td>
                  <td className={`${numTd} text-muted-foreground`}>{formatInt(ra.a)}</td>
                  <td className={`${numTd} text-muted-foreground`}>{formatInt(ra.b)}</td>
                  <td className={`${numTd} text-muted-foreground`}>{ra.c > 0 ? formatIDRFull(ra.c) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct(ra.b)}</td>
                </tr>
              )}
              {expanded && rows.length > limit && (
                <tr className="cursor-pointer hover:bg-accent/40" onClick={() => setExpanded(false)}>
                  <td colSpan={5} className="py-1.5 text-sm font-medium text-primary">↑ Show less</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
