import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { actionContext } from "@/lib/session";

export const runtime = "nodejs";

const TYPES = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;

/** A PDF / Excel file the assistant made; only the person who asked for it can download it. `?inline=1` opens a PDF. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await actionContext("assistant.use");
  } catch {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const f = await prisma.aiGeneratedFile.findFirst({ where: { id, userId: ctx.user.id, organizationId: ctx.organization.id } });
  if (!f) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const inline = f.kind === "pdf" && new URL(request.url).searchParams.get("inline") === "1";
  const name = f.fileName.replace(/["\\\r\n]/g, "_");
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": TYPES[f.kind as keyof typeof TYPES] ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
