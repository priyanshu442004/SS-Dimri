"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { createObservation, observationSchema, observationUpdateSchema, updateObservation } from "@/lib/services/observations";
import { setFlash } from "@/lib/flash";

export async function createObservationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(observationSchema, fd);
  if (!parsed.success) return parsed.state;
  let id = "";
  const r = await safeAction(async () => {
    const ctx = await actionContext("observations.manage");
    id = (await createObservation(ctx, parsed.data)).id;
  });
  if (r.ok === false) return r;
  await setFlash("Observation recorded.");
  redirect(`/app/observations/${id}`);
}

export async function updateObservationAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(observationUpdateSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("app.use");
    await updateObservation(ctx, id, parsed.data);
    revalidatePath(`/app/observations/${id}`);
    revalidatePath("/app/observations");
    return { ok: true, message: "Observation updated." };
  });
}
