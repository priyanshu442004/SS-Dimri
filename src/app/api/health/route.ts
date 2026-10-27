import { connection } from "next/server";
import { prisma } from "@/lib/db";

// Minimal liveness + database check. Never returns connection details or
// raw database errors.
export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
