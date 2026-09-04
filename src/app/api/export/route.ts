import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/session";
import { buildExport, sheetToCsv } from "@/lib/export";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") || "workbook";
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
  const p = url.searchParams.get("p") || undefined;
  const period = url.searchParams.get("period") || undefined;

  const wb = await buildExport(dataset, { p, period });
  if (!wb) return NextResponse.json({ error: "Unknown export." }, { status: 400 });

  if (format === "csv") {
    // BOM so Excel opens UTF-8 correctly.
    const body = "﻿" + sheetToCsv(wb.sheets[0]);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${wb.filename}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of wb.sheets) {
    const base = (s.name || "Sheet").replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
    let name = base, i = 2;
    while (used.has(name)) name = `${base.slice(0, 28)} ${i++}`;
    used.add(name);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(s.aoa), name);
  }
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${wb.filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
