import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const defaultReportsPath = 'c:/Users/hp/Desktop/excel-doc/public/new_reports.xlsx';
const deployedReportsPath = path.join(process.cwd(), 'new_reports.xlsx');
const reportsPath = fs.existsSync(deployedReportsPath) ? deployedReportsPath : defaultReportsPath;

function analyzeNotes() {
    const workbook = XLSX.readFile(reportsPath);
    
    ['BS notes', 'PL notes'].forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        data.forEach((row, i) => {
            // Focus on rows that have Note numbers (usually column A or B)
            if (row[1] && row[1].toString().match(/^Note\s+\d+/i)) {
                console.log(`Row ${i}:`, row);
                // Also log the next few rows to see sub-items
                for (let j = 1; j <= 10; j++) {
                    if (data[i+j] && data[i+j].filter(c => c).length > 0) {
                        console.log(`  +${j}:`, data[i+j]);
                    } else if (data[i+j]) {
                        // Empty row might mean end of note
                        break;
                    }
                }
            }
        });
    });
}

function analyzeBSPL() {
     const workbook = XLSX.readFile(reportsPath);
    ['BS', 'PL'].forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        data.slice(0, 50).forEach((row, i) => {
            if (row.filter(c => c).length > 0) {
                console.log(`Row ${i}:`, row);
            }
        });
    });
}

analyzeNotes();
analyzeBSPL();
