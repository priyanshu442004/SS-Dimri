const xlsx = require('xlsx');
const fs = require('fs');

try {
    const workbook = xlsx.readFile('./public/new_reports.xlsx');
    const bsNotes = xlsx.utils.sheet_to_json(workbook.Sheets['BS Notes'], { header: 1 });
    const plNotes = xlsx.utils.sheet_to_json(workbook.Sheets['PL Notes'], { header: 1 });
    
    fs.writeFileSync('./scratch_bs_notes.json', JSON.stringify(bsNotes, null, 2));
    fs.writeFileSync('./scratch_pl_notes.json', JSON.stringify(plNotes, null, 2));
    console.log("Successfully dumped notes");
} catch (e) {
    console.error(`Error: ${e.message}`);
}
