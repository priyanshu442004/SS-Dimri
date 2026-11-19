const xlsx = require('xlsx');

const fileNames = ['new_tb.xlsx', 'new_reports.xlsx'];

fileNames.forEach(file => {
    console.log(`\n--- Reading ${file} ---`);
    try {
        const workbook = xlsx.readFile(`./public/${file}`);
        workbook.SheetNames.forEach(sheetName => {
            console.log(`Sheet: ${sheetName}`);
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            console.log(data.slice(0, 5)); // print first 5 rows
        });
    } catch (e) {
        console.error(`Error reading ${file}: ${e.message}`);
    }
});
