// GST registration type of a client (tracker S.No. 74, 100): Regular, Composition dealer, Input Service
// Distributor (ISD) or Surrendered (cancelled). It decides which GST compliances apply. A client with
// several GSTINs (tracker S.No. 107) may have a different type on one of them (e.g. a separate ISD
// registration): the compliances of every type the client holds then apply. Pure: shared by the
// forms and the server.

export const GST_TYPES = {
  REGULAR: "Regular",
  COMPOSITION: "Composition dealer",
  ISD: "Input Service Distributor (ISD)",
  SURRENDERED: "Surrendered (cancelled)",
} as const;
export type GstType = keyof typeof GST_TYPES;
export const GST_TYPE_KEYS = Object.keys(GST_TYPES) as GstType[];
export const isGstType = (v: unknown): v is GstType => typeof v === "string" && v in GST_TYPES;

export const GST_TYPE_NOTE: Record<GstType, string> = {
  REGULAR: "GSTR-1 / IFF, GSTR-3B, annual return and reconciliation; no composition returns.",
  COMPOSITION: "Composition dealers file CMP-08 (quarterly payment) and GSTR-4 (annual return) only.",
  ISD: "An Input Service Distributor files GSTR-6 every month (by the 13th) to pass input tax credit to the units of the same PAN.",
  SURRENDERED: "A surrendered (cancelled) registration needs no regular GST returns.",
};

const isComposition = (name: string) => /composition|cmp-?08|gstr-?4\b/i.test(name);
const isIsd = (name: string) => /\bisd\b|gstr-?6\b|input service distributor/i.test(name);

function appliesTo(type: GstType, text: string): boolean {
  if (type === "SURRENDERED") return false;
  if (type === "ISD") return isIsd(text);
  if (type === "COMPOSITION") return isComposition(text) || /e-?way bill/i.test(text);
  return !isComposition(text) && !isIsd(text);
}

/**
 * Does a GST compliance (by its master-data name / form) apply to a client of this type — or of any of
 * these types (one per GSTIN)? Other departments always do.
 */
export function gstItemApplies(type: GstType | readonly (GstType | null | undefined)[] | null | undefined, item: { department: string; name: string; form?: string | null }): boolean {
  if (item.department !== "GST") return true;
  const types = (Array.isArray(type) ? type : [type]).filter((t): t is GstType => isGstType(t));
  const text = `${item.name} ${item.form ?? ""}`;
  // No type known: every GST compliance except the ISD return (only an ISD registration files GSTR-6).
  if (!types.length) return !isIsd(text);
  return types.some((t) => appliesTo(t, text));
}
