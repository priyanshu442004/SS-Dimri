const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('./public/new_reports.xlsx');
    
    ['BS', 'PL'].forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (sheet) {
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            console.log(`\n--- Sheet: ${sheetName} Footer ---`);
            // print the last 20 rows
            const lastRows = data.slice(Math.max(data.length - 20, 0));
            lastRows.forEach(row => {
                if(row.length > 0) console.log(JSON.stringify(row));
            });
        }
    });
} catch (e) {
    console.error(`Error: ${e.message}`);
}
