// Rupees in words, Indian system (lakh, crore), as on the salary slip:
// 36272.68 → "Rupees Thirty Six Thousand Two Hundred Seventy Two and Sixty Eight Paise Only". Pure.

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function upTo99(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function upTo999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? upTo99(r) : ""].filter(Boolean).join(" ");
}

/** Whole number in words, Indian grouping: crore, lakh, thousand, hundred. */
export function numberInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (rest) parts.push(upTo999(rest));
  return parts.join(" ");
}

export function rupeesInWords(amount: number): string {
  const paise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${numberInWords(rupees)}${p ? ` and ${upTo99(p)} Paise` : ""} Only`;
}
