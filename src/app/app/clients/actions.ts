"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BusinessRuleError, parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/services/audit";
import { gstState } from "@/lib/domain/gst-state";
import {
  addEngagements,
  engagementsSchema,
  gstinDetailsSchema,
  updateEngagement,
  addRepresentative,
  clientDetailsSchema,
  contactSchema,
  documentSchema,
  engagementSchema,
  getClientForCtx,
  invitePortalUser,
  issuePortalResetLink,
  portalInviteSchema,
  setPortalUserStatus,
  gstinSchemaForm,
  quickRegisterClient,
  quickRegistrationSchema,
  representativeSchema,
  saveClientDetails,
  transitionClient,
  transitionSchema,
} from "@/lib/services/clients";
import { fullRegistrationSchema, registerClient } from "@/lib/services/client-registration";
import { hasFile, storeUpload } from "@/lib/services/files";

export async function quickRegisterAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(quickRegistrationSchema, fd);
  if (!parsed.success) return parsed.state;
  let id = "";
  let name = "";
  let canOpen = false;
  const r = await safeAction(async () => {
    const ctx = await actionContext("clients.quick_register");
    const client = await quickRegisterClient(ctx, parsed.data, fd);
    id = client.id;
    name = client.tradeName;
    // A team member cannot open a client still pending approval: back to the list with a note.
    canOpen = can(ctx, "clients.view_all");
  });
  if (r.ok === false) return r;
  redirect(canOpen ? `/app/clients/${id}?registered=1` : `/app/clients?registered=${encodeURIComponent(name)}`);
}

/** Full registration from the six-section form (Clients → New client). */
export async function fullRegisterClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(fullRegistrationSchema, fd);
  if (!parsed.success) return parsed.state;
  let id = "";
  const r = await safeAction(async () => {
    const ctx = await actionContext("clients.register");
    id = (await registerClient(ctx, parsed.data, fd)).id;
  });
  if (r.ok === false) return r;
  redirect(`/app/clients/${id}?registered=1`);
}

export async function saveClientDetailsAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(clientDetailsSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("clients.edit");
    await saveClientDetails(ctx, clientId, parsed.data, fd);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Saved." };
  });
}

export async function transitionClientAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(transitionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("clients.edit");
    await transitionClient(ctx, clientId, parsed.data.action, parsed.data.reason);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Status updated." };
  });
}

async function editableClient(clientId: string) {
  const ctx = await actionContext("clients.edit");
  const client = await getClientForCtx(ctx, clientId);
  if (!client) throw new BusinessRuleError("Client not found.");
  return { ctx, client };
}

export async function addGstinAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(gstinSchemaForm, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { ctx, client } = await editableClient(clientId);
    // Prevent the same GSTIN being registered against two clients of this organization.
    const dup = await prisma.clientGstRegistration.findFirst({
      where: { gstin: parsed.data.gstin, client: { organizationId: ctx.organization.id } },
      select: { client: { select: { tradeName: true } } },
    });
    if (dup) throw new BusinessRuleError(`This GSTIN is already registered for ${dup.client.tradeName}.`);
    await prisma.$transaction(async (tx) => {
      const g = await tx.clientGstRegistration.create({
        data: { clientId: client.id, gstin: parsed.data.gstin, state: gstState(parsed.data.gstin), branchName: parsed.data.branchName ?? null, registrationType: parsed.data.registrationType ?? null },
      });
      await audit(tx, ctx, "client.gstin_added", "client", client.id, { gstinId: g.id });
    });
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "GSTIN added." };
  });
}

/** Branch and own registration type of one GSTIN (tracker S.No. 107: state-wise registrations). */
export async function updateGstinAction(clientId: string, gstId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(gstinDetailsSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { ctx, client } = await editableClient(clientId);
    await prisma.$transaction(async (tx) => {
      const g = await tx.clientGstRegistration.findFirst({ where: { id: gstId, clientId: client.id } });
      if (!g) throw new BusinessRuleError("GSTIN not found.");
      await tx.clientGstRegistration.update({ where: { id: g.id }, data: { branchName: parsed.data.branchName ?? null, registrationType: parsed.data.registrationType ?? null, state: g.state ?? gstState(g.gstin) } });
      await audit(tx, ctx, "client.gstin_updated", "client", client.id, { gstinId: g.id });
    });
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "GSTIN details saved." };
  });
}

export async function removeGstinAction(clientId: string, gstId: string): Promise<ActionState> {
  return safeAction(async () => {
    const { ctx, client } = await editableClient(clientId);
    await prisma.$transaction(async (tx) => {
      await tx.clientGstRegistration.delete({ where: { id: gstId, clientId: client.id } });
      await audit(tx, ctx, "client.gstin_removed", "client", client.id, { gstinId: gstId });
    });
    revalidatePath(`/app/clients/${clientId}`);
  });
}

export async function addContactAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(contactSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { client } = await editableClient(clientId);
    await prisma.$transaction(async (tx) => {
      if (parsed.data.isPrimary) await tx.clientContact.updateMany({ where: { clientId: client.id }, data: { isPrimary: false } });
      await tx.clientContact.create({ data: { clientId: client.id, ...parsed.data, isPrimary: !!parsed.data.isPrimary } });
    });
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Contact added." };
  });
}

export async function removeContactAction(clientId: string, contactId: string): Promise<ActionState> {
  return safeAction(async () => {
    const { client } = await editableClient(clientId);
    await prisma.clientContact.delete({ where: { id: contactId, clientId: client.id } });
    revalidatePath(`/app/clients/${clientId}`);
  });
}

export async function addRepresentativeAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(representativeSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { ctx } = await editableClient(clientId);
    await addRepresentative(ctx, clientId, parsed.data, fd);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Representative added." };
  });
}

export async function removeRepresentativeAction(clientId: string, memberId: string): Promise<ActionState> {
  return safeAction(async () => {
    const { ctx, client } = await editableClient(clientId);
    await prisma.$transaction(async (tx) => {
      await tx.constitutionMember.delete({ where: { id: memberId, clientId: client.id } });
      await audit(tx, ctx, "client.representative_removed", "client", client.id);
    });
    revalidatePath(`/app/clients/${clientId}`);
  });
}

/** Add one or more services (tracker S.No. 99: multi-select). */
export async function addEngagementAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(engagementsSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { ctx } = await editableClient(clientId);
    const r = await addEngagements(ctx, clientId, parsed.data);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: `${r.added.length === 1 ? "Service" : `${r.added.length} services`} added: ${r.added.join(", ")}.${r.skipped.length ? ` Already active: ${r.skipped.join(", ")}.` : ""}` };
  });
}

export async function updateEngagementAction(clientId: string, engagementId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(engagementSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { ctx } = await editableClient(clientId);
    await updateEngagement(ctx, clientId, engagementId, parsed.data);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Service updated." };
  });
}

export async function setEngagementStatusAction(clientId: string, engagementId: string, status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED"): Promise<ActionState> {
  return safeAction(async () => {
    const { client } = await editableClient(clientId);
    // The end of an engagement is dated: a one-time fee is earned on completion, a retainer stops accruing.
    const ended = status === "COMPLETED" || status === "CANCELLED";
    await prisma.clientService.update({ where: { id: engagementId, clientId: client.id }, data: { status, completedAt: ended ? new Date() : null } });
    revalidatePath(`/app/clients/${clientId}`);
  });
}

export async function uploadClientDocumentAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(documentSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const { ctx, client } = await editableClient(clientId);
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, fieldErrors: { file: ["Choose a file"] }, message: "Choose a file to upload." };
    const stored = await storeUpload(ctx, file, { area: "clients", ownerId: client.id });
    await prisma.$transaction(async (tx) => {
      await tx.clientDocument.create({ data: { clientId: client.id, fileId: stored.id, type: parsed.data.type, title: parsed.data.title ?? file.name } });
      await audit(tx, ctx, "client.document_uploaded", "client", client.id);
    });
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Uploaded." };
  });
}

export async function invitePortalUserAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(portalInviteSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("clients.edit");
    const link = await invitePortalUser(ctx, clientId, parsed.data);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: `Portal login created. Send this one-time setup link to the client privately (valid ${link.expiresInHours} hours, shown only once): ${link.url}` };
  });
}

export async function issuePortalResetLinkAction(clientId: string, membershipId: string, _p: ActionState): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("clients.edit");
    const link = await issuePortalResetLink(ctx, clientId, membershipId);
    return { ok: true, message: `Reset link (single use, valid ${link.expiresInHours} hours — share privately): ${link.url}` };
  });
}

export async function setPortalUserStatusAction(clientId: string, membershipId: string, status: "ACTIVE" | "DISABLED"): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("clients.approve");
    await setPortalUserStatus(ctx, clientId, membershipId, status);
    revalidatePath(`/app/clients/${clientId}`);
  });
}
