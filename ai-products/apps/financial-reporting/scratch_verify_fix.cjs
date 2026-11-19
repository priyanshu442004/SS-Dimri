const XLSX = require('xlsx');
const path = require('path');

const detectCompany = (filePath) => {
  let companyType = "INFRASTRUCTURE";
  let headerRowIndex = 4; // Default

  try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    for (let i = 0; i < Math.min(data.length, 25); i++) {
      const row = data[i] || [];
      const rowStr = row.join(" ").toUpperCase();
      
      if (rowStr.includes("ELDECO SOHNA")) {
        companyType = "SOHNA";
      }
      
      if (row.some(cell => cell && cell.toString().trim().toLowerCase() === "account head")) {
        headerRowIndex = i;
      }
    }
  } catch (e) {
    console.error("Detect Error:", e);
  }
  
  return { companyType, headerRowIndex };
};

const filePath = path.join(__dirname, 'public', 'new_tb.xlsx');
const result = detectCompany(filePath);
console.log('Detection Result:', result);
