// Conveyance as in the SSDA conveyance sheet (25 Nov 2026). Own vehicle: paid per km — the day's total
// run less the home <-> office km travelled anyway — at the firm's rate (Rs 4.50). Public transport / cab:
// the fare paid. The older modes stay valid for claims already made. Pure.

export const OWN_VEHICLE_MODES = ["Bike (own)", "Car (own)"] as const;
export const FARE_MODES = ["Metro", "Bus", "Auto / rickshaw", "Rapido / cab", "Porter", "Others"] as const;
const LEGACY_MODES = ["Two-wheeler", "Car", "Auto / cab", "Bus / metro", "Other"] as const;
export const CONVEYANCE_MODES = [...OWN_VEHICLE_MODES, ...FARE_MODES, ...LEGACY_MODES] as const;
export const isOwnVehicle = (mode: string | null | undefined) => mode === "Bike (own)" || mode === "Car (own)" || mode === "Two-wheeler" || mode === "Car";

/** KM for office work and the amount, as the sheet works them out: (total run − commute) × rate. */
export function conveyanceAmount(totalRunKm: number, commuteKm: number, ratePerKm: number) {
  const km = Math.max(0, Math.round((totalRunKm - commuteKm) * 10) / 10);
  return { km, amount: Math.round(km * ratePerKm * 100) / 100 };
}
