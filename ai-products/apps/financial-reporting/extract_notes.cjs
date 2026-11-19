const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('./public/new_reports.xlsx');
    console.log("All Sheets:", workbook.SheetNames);
    
    // We only care about Notes. Let's see what note sheets exist.
    const noteSheets = workbook.SheetNames.filter(name => !['General Inforamtion', 'BS', 'PL', 'CFS', 'SCIE', 'Audit Trail', 'Directors Report', 'Auditors Report', 'Notice', 'Proxy', 'Attendance'].includes(name));
    console.log("Potential Note Sheets:", noteSheets);
    
    noteSheets.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        // print first 20 rows of each note to get an idea
        console.log(data.slice(0, 20));
    });
} catch (e) {
    console.error(`Error: ${e.message}`);
}
