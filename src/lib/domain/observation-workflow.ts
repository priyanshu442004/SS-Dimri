export type ObservationStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

/**
 * Provisional lifecycle (not confirmed by the firm — see requirements-and-decisions.md):
 * OPEN → IN_PROGRESS → RESOLVED → CLOSED, with RESOLVED/CLOSED reopenable to OPEN.
 */
export const OBSERVATION_TRANSITIONS: Record<ObservationStatus, ObservationStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["OPEN", "RESOLVED"],
  RESOLVED: ["CLOSED", "OPEN"],
  CLOSED: ["OPEN"],
};

export function canMoveObservation(from: ObservationStatus, to: ObservationStatus) {
  return OBSERVATION_TRANSITIONS[from].includes(to);
}
