import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Health check — verifies the app is up and the database is reachable.
// Used by docker-compose healthchecks and for smoke-testing the setup.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const properties = await prisma.property.count();
    return NextResponse.json({
      status: "ok",
      database: "connected",
      properties,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
        error: error instanceof Error ? error.message : "unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
