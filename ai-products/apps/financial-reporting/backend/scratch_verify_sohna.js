import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const defaultReportsPath = 'c:/Users/hp/Desktop/excel-doc/public/new_reports.xlsx';
const deployedReportsPath = path.join(process.cwd(), 'new_reports.xlsx');
const reportsPath = fs.existsSync(deployedReportsPath) ? deployedReportsPath : defaultReportsPath;

try {
  const workbook = XLSX.readFile(reportsPath);
  const sheetNames = workbook.SheetNames;
  console.log('Sheet Names:', sheetNames);

  const extractData = (sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 });
  };

  console.log('\n--- BS Notes ---');
  console.log(extractData('BS notes').slice(0, 50)); // First 50 rows

  console.log('\n--- PL Notes ---');
  console.log(extractData('PL notes').slice(0, 50));

  console.log('\n--- Balance Sheet (BS) ---');
  console.log(extractData('BS').slice(0, 50));

  console.log('\n--- Profit & Loss (PL) ---');
  console.log(extractData('PL').slice(0, 50));

} catch (error) {
  console.error('Error reading Excel:', error.message);
}
