import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const defaultReportsPath = 'c:/Users/hp/Desktop/excel-doc/public/new_reports.xlsx';
const deployedReportsPath = path.join(process.cwd(), 'new_reports.xlsx');
const reportsPath = fs.existsSync(deployedReportsPath) ? deployedReportsPath : defaultReportsPath;

function analyzeSohnaTBSummary() {
    const workbook = XLSX.readFile(reportsPath);
    const sheet = workbook.Sheets['TB Sum_24-25'];
    if (!sheet) {
        console.log('Sheet TB Sum_24-25 not found');
        return;
    }
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('--- TB Sum_24-25 Analysis ---');
    console.log('Headers:', data[4]); // Row 5 (index 4) usually has headers
    console.log('Sample rows:');
    console.log(data.slice(5, 15));
}

analyzeSohnaTBSummary();
