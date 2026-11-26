// State of a GST registration from the first two digits of the GSTIN (GST state codes). One PAN can be
// registered in many states — each GSTIN is then a separate registration with its own returns
// (tracker S.No. 107). Pure: shared by the forms, the client page and the compliance tracker.

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "25": "Daman & Diu", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
  "28": "Andhra Pradesh (old)", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
  "97": "Other Territory", "99": "Centre Jurisdiction",
};

/** "07AAACD1234F1Z5" → "Delhi"; unknown code → null. */
export function gstState(gstin: string | null | undefined): string | null {
  const code = (gstin ?? "").trim().slice(0, 2);
  return GST_STATE_CODES[code] ?? null;
}

/** "07AAACD1234F1Z5 (Delhi)" for pickers and the compliance tracker's registration number. */
export function gstinLabel(g: { gstin: string; state?: string | null; branchName?: string | null }): string {
  const state = g.state || gstState(g.gstin);
  const where = [state, g.branchName].filter(Boolean).join(" · ");
  return where ? `${g.gstin} (${where})` : g.gstin;
}
