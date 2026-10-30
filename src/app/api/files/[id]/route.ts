import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { createDownloadUrl } from "@/lib/storage/s3";

// Authorized file access: checks the caller's organization and their right to
// the record that owns the file, then redirects to a 5-minute pre-signed URL.
export async function GET(_req: Request, { params }: RouteContext<"/api/files/[id]">) {
  const ctx = await getContext();
  if (!ctx) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const file = await prisma.storedFile.findFirst({
    where: { id, organizationId: ctx.organization.id, deletedAt: null },
    include: {
      employeeProfilePicture: { select: { id: true } },
      employeeAadhaarDocument: { select: { id: true } },
      employeePanDocument: { select: { id: true } },
      employeeDocument: { select: { employeeId: true } },
      employeeBankBook: { select: { employeeId: true } },
      employeeQualification: { select: { employeeId: true } },
      employeeExperience: { select: { employeeId: true } },
      employeeMemo: { select: { employeeId: true } },
      employeeLetter: { select: { employeeId: true } },
      attendanceTimeInPhoto: { select: { employeeId: true } },
      attendanceTimeOutPhoto: { select: { employeeId: true } },
      taskAttachment: { select: { task: { select: { assignments: { select: { employeeId: true } } } } } },
      clientDocument: { select: { clientId: true } },
      clientProfilePicture: { select: { id: true } },
      clientMsmeCertificate: { select: { id: true } },
      clientEsiCertificate: { select: { id: true } },
      clientPfCertificate: { select: { id: true } },
      followUp: { select: { clientVisible: true, pendingItem: { select: { clientId: true, clientVisible: true } } } },
    },
  });
  if (!file) return new NextResponse("Not found", { status: 404 });

  const me = ctx.employee?.id;
  const employeeOwner =
    file.employeeProfilePicture?.id ?? file.employeeAadhaarDocument?.id ?? file.employeePanDocument?.id ??
    file.employeeDocument?.employeeId ?? file.employeeBankBook?.employeeId ?? file.employeeQualification?.employeeId ??
    file.employeeExperience?.employeeId ?? file.employeeMemo?.employeeId ?? file.employeeLetter?.employeeId;
  const attendanceOwner = file.attendanceTimeInPhoto?.employeeId ?? file.attendanceTimeOutPhoto?.employeeId;

  const clientOwner =
    file.clientDocument?.clientId ?? file.clientProfilePicture?.id ?? file.clientMsmeCertificate?.id ?? file.clientEsiCertificate?.id ??
    file.clientPfCertificate?.id ?? (file.followUp?.clientVisible && file.followUp.pendingItem?.clientVisible ? file.followUp.pendingItem.clientId : null);

  let allowed: boolean;
  if (ctx.access.state === "locked") {
    // Locked while awaiting approval: staff may still open their own onboarding documents; clients nothing.
    allowed = ctx.role !== "CLIENT" && !!employeeOwner && employeeOwner === me;
  } else if (ctx.role === "CLIENT") {
    // Clients: only files that belong to their own business.
    allowed = !!ctx.client && clientOwner === ctx.client.id;
  } else if (employeeOwner) {
    // Personal identity / HR documents: the employee themself or HR administrators.
    allowed = employeeOwner === me || can(ctx.role, "employees.manage");
  } else if (attendanceOwner) {
    allowed = attendanceOwner === me || can(ctx.role, "attendance.view_all");
  } else if (file.taskAttachment) {
    allowed = can(ctx.role, "tasks.view_all") || file.taskAttachment.task.assignments.some((a) => a.employeeId === me);
  } else {
    // Organization and client documents: internal staff with client access.
    allowed = can(ctx.role, "clients.view_all");
  }
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const url = await createDownloadUrl(file.objectKey, file.originalFileName);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
