// "Validate" next to PAN, TAN and GSTIN (tracker, 17 Nov 2026): checks the number itself — its
// format, what it says about the holder, the GST state code, the PAN inside a GSTIN and the GSTIN
// check digit. Name and status live on the government portals; `portalUrl` opens the right one.

export type IdKind = "PAN" | "TAN" | "GSTIN";
export type IdCheck = { ok: boolean; value: string; message: string; details: string[] };

const PAN_HOLDER: Record<string, string> = {
  P: "Individual", C: "Company", H: "HUF", F: "Firm / LLP", A: "Association of persons", T: "Trust",
  B: "Body of individuals", L: "Local authority", J: "Artificial juridical person", G: "Government", K: "Krish (other)",
};

export const GST_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "25": "Daman & Diu", "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra", "28": "Andhra Pradesh (old)", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other territory", "99": "Centre jurisdiction",
};

export const PORTAL_URL: Record<IdKind, string> = {
  PAN: "https://eportal.incometax.gov.in/iec/foservices/#/pre-login/verifyYourPAN",
  TAN: "https://eportal.incometax.gov.in/iec/foservices/#/pre-login/knowYourTAN",
  GSTIN: "https://services.gst.gov.in/services/searchtp",
};

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The 15th character of a GSTIN, from the first 14 (GSTN's base-36 check digit). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    if (v < 0) return "?";
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function checkPan(raw: string): IdCheck {
  const value = raw.trim().toUpperCase();
  if (!value) return { ok: false, value, message: "Enter the PAN first.", details: [] };
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value)) return { ok: false, value, message: "Not a valid PAN. A PAN has 5 letters, 4 digits and 1 letter, e.g. ABCDE1234F.", details: [] };
  const holder = PAN_HOLDER[value[3]];
  if (!holder) return { ok: false, value, message: `The 4th character "${value[3]}" is not a holder type the Income Tax department uses.`, details: [] };
  return { ok: true, value, message: "Valid PAN format.", details: [`Holder type: ${holder}`, `Name starts with: ${value[4]}${value[3] === "P" ? " (surname)" : ""}`] };
}

export function checkTan(raw: string): IdCheck {
  const value = raw.trim().toUpperCase();
  if (!value) return { ok: false, value, message: "Enter the TAN first.", details: [] };
  if (!/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(value)) return { ok: false, value, message: "Not a valid TAN. A TAN has 4 letters, 5 digits and 1 letter, e.g. DELA12345B.", details: [] };
  return { ok: true, value, message: "Valid TAN format.", details: [`Jurisdiction code: ${value.slice(0, 3)}`, `Deductor name starts with: ${value[3]}`] };
}

export function checkGstin(raw: string, pan?: string | null): IdCheck {
  const value = raw.trim().toUpperCase();
  if (!value) return { ok: false, value, message: "Enter the GSTIN first.", details: [] };
  if (value.length !== 15) return { ok: false, value, message: `A GSTIN has 15 characters; this has ${value.length}.`, details: [] };
  if (!/^[0-9]{2}[A-Z0-9]{10}[1-9A-Z][A-Z][0-9A-Z]$/.test(value)) return { ok: false, value, message: "Not a valid GSTIN format (e.g. 07AAACE1234F1Z5).", details: [] };
  const state = GST_STATES[value.slice(0, 2)];
  if (!state) return { ok: false, value, message: `"${value.slice(0, 2)}" is not a GST state code.`, details: [] };
  const expected = gstinCheckDigit(value.slice(0, 14));
  if (expected !== value[14]) return { ok: false, value, message: `The last character (check digit) should be "${expected}", not "${value[14]}". One of the characters is mistyped.`, details: [] };
  const inner = value.slice(2, 12);
  const details = [`State: ${state} (${value.slice(0, 2)})`, `PAN inside: ${inner}`, `Registration no. ${value[12]} in this state`];
  const p = pan?.trim().toUpperCase();
  if (p && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p) && p !== inner) {
    return { ok: false, value, message: `This GSTIN belongs to PAN ${inner}, but the client's PAN is ${p}.`, details };
  }
  const holder = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(inner) ? PAN_HOLDER[inner[3]] : null;
  if (holder) details.push(`Holder type: ${holder}`);
  return { ok: true, value, message: "Valid GSTIN: state code, PAN and check digit are correct.", details };
}

export function checkIdentifier(kind: IdKind, value: string, pan?: string | null): IdCheck {
  return kind === "PAN" ? checkPan(value) : kind === "TAN" ? checkTan(value) : checkGstin(value, pan);
}
