import master from "../../prisma/data/ssda-master-data.json";

// Verified firm details, taken from the firm's own documents (letterheads and
// the ERP master data pack, sheet "5. Firm Details"). Nothing here is invented.
export const FIRM = {
  name: "S S Dimri & Associates",
  address: "2nd Floor, B-191, Phase-I, Naraina Industrial Area, New Delhi – 110028",
  landmark: "Near Bikanerwala Sweets, Naraina Industrial Area Phase-1",
  phone: "011-47094120",
  email: "sunildimri@ssdimri.com",
  website: "www.ssdimri.com",
  mapsUrl: "https://goo.gl/maps/tHBEVwCK9Cs2Yrw76",
  officeHours: "Monday to Saturday, 9:30 AM – 6:30 PM",
  established: "2012", // Udyog Aadhaar: date of commencement 15-12-2012
  nic: "Legal & accounting activities (NIC 69100)",
};

export type PublicService = (typeof master.services)[number];

/** Only services the firm marked as "Given" are shown publicly; "Suggested" ones await confirmation. */
export const PUBLIC_SERVICES = master.services.filter((s) => s.confirmed);

export const SERVICE_DEPARTMENTS = [...new Set(PUBLIC_SERVICES.map((s) => s.department))];

export const BILLING_BASES = master.classifications.filter((c) => c.basis === "BILLING_BASIS");

/** Statutory compliances the firm tracks (department, form, frequency, due-date rule). */
export const COMPLIANCES = master.compliances;
