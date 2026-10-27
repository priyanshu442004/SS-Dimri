import { z } from "zod";
import { gstinSchema, panSchema, tanSchema } from "./identifiers";

/**
 * Quick registration: only the minimum is required; the record is created
 * with status PENDING_APPROVAL and remaining details can be filled later.
 * (Which fields are mandatory at quick registration is still to be confirmed.)
 */
export const clientQuickRegistrationSchema = z.object({
  tradeName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().max(200).optional(),
  pan: panSchema.optional(),
  constitutionId: z.uuid().optional(),
  gstins: z.array(gstinSchema).max(50).default([]),
});

export const clientDetailsSchema = clientQuickRegistrationSchema.partial().extend({
  address: z.string().trim().max(1000).optional(),
  tan: tanSchema.optional(),
  natureOfUserId: z.uuid().optional(),
  natureOfClient: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  isMsme: z.boolean().optional(),
  msmeRegistrationNumber: z.string().trim().max(50).optional(),
  esiNumber: z.string().trim().max(50).optional(),
  pfNumber: z.string().trim().max(50).optional(),
});

export type ClientQuickRegistrationInput = z.infer<typeof clientQuickRegistrationSchema>;
export type ClientDetailsInput = z.infer<typeof clientDetailsSchema>;
