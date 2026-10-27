export type RepresentativeRole = "PROPRIETOR" | "PARTNER" | "DIRECTOR" | "TRUSTEE" | "KARTA" | "MEMBER" | "OTHER";

/**
 * A representative must hold the constitution's own role (proprietor, partner,
 * director, trustee, karta) or a generic one (MEMBER, e.g. HUF members; OTHER,
 * e.g. an authorised signatory). Without a recorded constitution nothing can be checked.
 */
export function isRepresentativeRoleAllowed(constitutionRole: RepresentativeRole | null | undefined, role: RepresentativeRole): boolean {
  if (!constitutionRole) return true;
  return role === constitutionRole || role === "MEMBER" || role === "OTHER";
}

/** Constitutions that allow only one holder of their role (e.g. a proprietorship has one proprietor). */
export function exceedsSingleHolder(c: { representativeRole: RepresentativeRole; allowsMultiple: boolean }, roles: RepresentativeRole[]): boolean {
  return !c.allowsMultiple && roles.filter((r) => r === c.representativeRole).length > 1;
}
