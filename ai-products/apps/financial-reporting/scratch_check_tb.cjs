const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'new_tb.xlsx');
try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log('Total Rows:', rawData.length);
    console.log('Searching for headers...');
    rawData.forEach((row, i) => {
        if (row.includes('Account Head') || row.includes('Debit Opening') || row.includes('Particulars')) {
            console.log(`Potential Header at Row ${i}:`, row);
        }
    });
} catch (error) {
    console.error('Error reading file:', error);
}
