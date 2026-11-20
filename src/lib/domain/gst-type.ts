// GST registration type of a client (tracker S.No. 74): Regular, Composition dealer, or Surrendered
// (cancelled). It decides which GST compliances apply. Pure: shared by the forms and the server.

export const GST_TYPES = {
  REGULAR: "Regular",
  COMPOSITION: "Composition dealer",
  SURRENDERED: "Surrendered (cancelled)",
} as const;
export type GstType = keyof typeof GST_TYPES;
export const GST_TYPE_KEYS = Object.keys(GST_TYPES) as GstType[];
export const isGstType = (v: unknown): v is GstType => typeof v === "string" && v in GST_TYPES;

export const GST_TYPE_NOTE: Record<GstType, string> = {
  REGULAR: "GSTR-1 / IFF, GSTR-3B, annual return and reconciliation; no composition returns.",
  COMPOSITION: "Composition dealers file CMP-08 (quarterly payment) and GSTR-4 (annual return) only.",
  SURRENDERED: "A surrendered (cancelled) registration needs no regular GST returns.",
};

const isComposition = (name: string) => /composition|cmp-?08|gstr-?4\b/i.test(name);

/** Does a GST compliance (by its master-data name / form) apply to a client of this type? Other departments always do. */
export function gstItemApplies(type: GstType | null | undefined, item: { department: string; name: string; form?: string | null }): boolean {
  if (item.department !== "GST" || !type) return true;
  const text = `${item.name} ${item.form ?? ""}`;
  if (type === "SURRENDERED") return false;
  if (type === "COMPOSITION") return isComposition(text) || /e-?way bill/i.test(text);
  return !isComposition(text);
}
