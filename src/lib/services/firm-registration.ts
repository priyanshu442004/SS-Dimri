import "server-only";

/**
 * Firm (owner) registration: the portal serves many firms, each with its own
 * clients, staff and data, so registration stays open. Set
 * ALLOW_FIRM_REGISTRATION=false to pause new sign-ups.
 */
export async function isFirmRegistrationOpen() {
  return process.env.ALLOW_FIRM_REGISTRATION !== "false";
}
