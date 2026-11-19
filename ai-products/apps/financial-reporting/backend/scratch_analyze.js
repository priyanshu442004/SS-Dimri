import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const getPath = (fileName, fallback) => {
    const deployed = path.join(process.cwd(), fileName);
    return fs.existsSync(deployed) ? deployed : fallback;
};

const tbPath = getPath('new_tb.xlsx', 'c:/Users/hp/Desktop/excel-doc/public/new_tb.xlsx');
const reportsPath = getPath('new_reports.xlsx', 'c:/Users/hp/Desktop/excel-doc/public/new_reports.xlsx');

function analyzeTB() {
    const workbook = XLSX.readFile(tbPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log('--- TB Analysis ---');
    console.log('Sheet Names:', workbook.SheetNames);
    console.log('First 10 rows:');
    console.log(data.slice(0, 10));
}

function analyzeReports() {
    const workbook = XLSX.readFile(reportsPath);
    console.log('--- Reports Analysis ---');
    console.log('Sheet Names:', workbook.SheetNames);
    
    const relevantSheets = ['TB Sum_24-25', 'BS notes', 'PL notes', 'BS', 'PL'];
    relevantSheets.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (sheet) {
            console.log(`\n--- Sheet: ${sheetName} ---`);
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            console.log('Max columns:', data[0]?.length || 'N/A');
            // Find a row that looks like headers
            for (let i = 0; i < Math.min(20, data.length); i++) {
                if (data[i] && data[i].filter(cell => cell).length > 2) {
                    console.log(`Row ${i} (Possible Headers/Start):`, data[i]);
                    // Show next 5 rows
                    console.log(`Next 5 rows:`);
                    for (let j = 1; j <= 5; j++) {
                        if (data[i+j]) console.log(data[i+j]);
                    }
                    break;
                }
            }
        } else {
            console.log(`\n--- Sheet: ${sheetName} NOT FOUND ---`);
        }
    });
}

analyzeTB();
analyzeReports();
