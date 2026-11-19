
import XLSX from 'xlsx';

const infraPath = 'c:/Users/hp/Desktop/excel-doc/backend/uploads/Raw Trial Balance Data.xlsx';

function analyzeInfra() {
    try {
        const workbook = XLSX.readFile(infraPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        console.log('--- Infrastructure TB Analysis ---');
        console.log('First 10 rows:');
        console.log(data.slice(0, 10));
    } catch (e) {
        console.log('Infrastructure TB not found or error reading it.');
    }
}

analyzeInfra();
