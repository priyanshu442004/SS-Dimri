import XLSX from "xlsx";
import fs from "fs";
import csv from "csv-parser";

const VALID_REVENUE = [
  "00.Lease Rent",
  "00.Yearly Lease Rent",
  "00.IGL Security Deposit",
  "00.Unit Cost",
  "00.Lease Rent",
  "00.LEASED RENT",
  "00.External Electrification Charges",
  "00.Fire Fighting Charges_15",
  "00.Power Back Up Installation",
  "00.Safeguarding Charges",
  "00.Upgrade Charges*"
];

export const processExcelFiles = async (files) => {
  let rows = [];

  for (const file of files) {
    if (file.originalname.endsWith(".csv")) {
      const csvData = await readCSV(file.path);
      rows.push(...csvData);
    } else {
      const workbook = XLSX.readFile(file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { range: 9, defval: "" });

const json = raw.map(row => {
  const cleaned = {};
  for (const key in row) {
    const newKey = key.trim().replace(/\s+/g, " ");
    cleaned[newKey] = row[key];
  }
  return cleaned;
});

      rows.push(...json);
    }
  }

 
const filtered = rows.filter(r =>
  r.Status === "Active" &&
  r.Component === "BASIC" &&
  VALID_REVENUE.includes(r["Revenue Head"])
);


const output = filtered.map(r => ({
  bookingNo: r["Booking No"],
  customerName: r["Customer Name"],
  unitCode: r["Unit Code"],
  superBuiltUp: r["Super Built-Up"],
  revenueHead: r["Revenue Head"],
  basicAmount: Number(r["Basic Amount"] || r["Basic  Amount"] || 0),
  billAmount: Number(r["Bill Amount"] || 0),
  receivedAmount: Number(r["Received Amount"] || 0),
  balanceAmount: Number(r["Balance Amount"] || 0)
}));

return output;

  
};

const readCSV = (path) => {
  return new Promise((resolve) => {
    const results = [];
    fs.createReadStream(path)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results));
  });
};
