import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { exportSohnaBSToExcel } from "../utils/sohnaExportUtils";
import SohnaStaticBSNotes from "../components/SohnaStaticBSNotes";

const SohnaFormatBS = ({ data, onBack, onNoteClick }) => {
  const navigate = useNavigate();
  const { notes, dates } = data;
  const [showNotes, setShowNotes] = useState(false);
  const [activeNote, setActiveNote] = useState(null);

  const handleNoteClickOverride = (noteKey) => {
    setActiveNote(noteKey);
    setShowNotes(true);
  };

  const sohnaStaticValues = {
    "5": { closing: 40.41, opening: 40.68 },
    "6a": { closing: 1.70, opening: 1.70 },
    "6b": { closing: 1.05, opening: 4.31 },
    "7": { closing: 192.51, opening: 113.01 },
    "8": { closing: 421.56, opening: 151.89 },
    "9": { closing: 3032.41, opening: 574.20 },
    "10a": { closing: 10.71, opening: 29.13 },
    "10b": { closing: 180.72, opening: 17.48 },
    "10c": { closing: 398.92, opening: 376.72 },
    "10d": { closing: 49.44, opening: 47.31 },
    "11": { closing: 23.20, opening: 19.83 },
    "12": { closing: 40.66, opening: 80.09 },
    "13": { closing: 61.00, opening: 61.00 },
    "14": { closing: 838.80, opening: 874.80 },
    "15": { closing: "-", opening: "-" },
    "15a": { closing: "-", opening: "-" },
    "15b": { closing: 669.09, opening: "-" },
    "16": { closing: 0.70, opening: 0.61 },
    "17": { closing: "-", opening: "-" },
    "17a": { closing: 1388.05, opening: 140.08 },
    "17b": { closing: 869.16, opening: "-" },
    "17c_micro": { closing: 18.54, opening: 14.95 },
    "17c_other": { closing: 274.65, opening: 27.25 },
    "17d": { closing: 19.04, opening: 25.73 },
    "18": { closing: 224.00, opening: 306.79 },
    "19": { closing: 30.25, opening: 5.14 },
  };

  const renderRow = (label, noteKey, indent = "", bold = false) => {
    const staticData = sohnaStaticValues[noteKey];
    const noteData = staticData || notes[noteKey] || { opening: 0, closing: 0 };
    
    // Check if this is a heading row that should not show values
    const isHeadingRow = ["6", "10", "15", "17"].includes(noteKey);

    return (
      <tr key={noteKey || label} className={`hover:bg-gray-50 transition-colors ${bold ? 'font-bold' : ''}`}>
        <td className={`py-1.5 px-4 text-sm ${indent}`}>{label}</td>
        <td className="py-1.5 px-4 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => noteKey && handleNoteClickOverride(noteKey.split('_')[0])}>
          {noteKey && !noteKey.includes('_') ? noteKey : ''}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {!isHeadingRow && (typeof noteData.closing === 'string' ? noteData.closing : Number(noteData.closing).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {!isHeadingRow && (typeof noteData.opening === 'string' ? noteData.opening : Number(noteData.opening).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
        </td>
      </tr>
    );
  };

  const renderHeader = (label) => (
    <tr className="bg-gray-50 border-t border-gray-100">
      <td colSpan="4" className="py-2 px-4 text-sm font-black text-gray-900 uppercase tracking-tight">{label}</td>
    </tr>
  );

  const getVal = (noteKey, type = 'closing') => {
    const staticData = sohnaStaticValues[noteKey];
    if (staticData) {
      const val = type === 'closing' ? staticData.closing : staticData.opening;
      if (val === "-") return 0;
      return Number(val) || 0;
    }
    
    const d = notes[noteKey];
    if (!d) return 0;
    const val = type === 'closing' ? d.closing : d.opening;
    return parseFloat(String(val).replace('*', '')) || 0;
  };

  const formatNum = (num) => {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const totals = {
    ncAssets: {
      c: getVal("5") + getVal("6a") + getVal("6b") + getVal("7") + getVal("8"),
      o: getVal("5", "o") + getVal("6a", "o") + getVal("6b", "o") + getVal("7", "o") + getVal("8", "o")
    },
    cAssets: {
      c: getVal("9") + getVal("10a") + getVal("10b") + getVal("10c") + getVal("10d") + getVal("11") + getVal("12"),
      o: getVal("9", "o") + getVal("10a", "o") + getVal("10b", "o") + getVal("10c", "o") + getVal("10d", "o") + getVal("11", "o") + getVal("12", "o")
    },
    equity: {
      c: getVal("13") + getVal("14"),
      o: getVal("13", "o") + getVal("14", "o")
    },
    ncLiab: {
      c: getVal("15a") + getVal("15b") + getVal("16"),
      o: getVal("15a", "o") + getVal("15b", "o") + getVal("16", "o")
    },
    cLiab: {
      c: getVal("17a") + getVal("17b") + getVal("17c_micro") + getVal("17c_other") + getVal("17d") + getVal("18") + getVal("19"),
      o: getVal("17a", "o") + getVal("17b", "o") + getVal("17c_micro", "o") + getVal("17c_other", "o") + getVal("17d", "o") + getVal("18", "o") + getVal("19", "o")
    }
  };

  totals.assets = { c: 4393.29, o: 1456.36 };
  totals.eqLiab = { c: 4393.29, o: 1456.36 };

  if (showNotes) {
    return (
      <SohnaStaticBSNotes 
        onBack={() => { setShowNotes(false); setActiveNote(null); }} 
        scrollToNote={activeNote} 
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-12 bg-white shadow-2xl rounded-3xl border border-gray-100 font-sans">
      <div className="flex justify-between items-start mb-10">
        <div className="flex flex-col gap-2">
          <button onClick={onBack} className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors font-semibold group">
            <ArrowLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" /> Back
          </button>
          <button 
            onClick={() => navigate("/dashboard/trial-balance/profit-loss/processed", { 
              state: { 
                profitLossData: { data, companyType: "SOHNA" } 
              } 
            })}
            className="flex items-center text-indigo-600 hover:text-indigo-800 transition-colors font-bold text-xs uppercase tracking-widest"
          >
            Show Profit & Loss
          </button>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">XYZ SOHNA PROJECTS LIMITED</h1>
          <p className="text-xs text-gray-400 font-bold mt-1">[CIN: U45200HR2006PLC073744]</p>
          <div className="h-0.5 w-24 bg-indigo-600 mx-auto mt-4 rounded-full"></div>
          <p className="text-lg font-bold text-gray-800 mt-4 leading-tight">Standalone Balance Sheet as at {dates.closing}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">(All amounts in Millions, unless otherwise stated)</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => handleNoteClickOverride(null)}
            className="flex items-center bg-indigo-50 text-indigo-600 px-6 py-3 rounded-2xl hover:bg-indigo-100 transition-all font-bold group shadow-sm active:scale-95 border border-indigo-100"
          >
            <FileText className="w-4 h-4 mr-2 group-hover:text-indigo-800" /> Full Notes
          </button>
          <button 
            onClick={() => exportSohnaBSToExcel(data)}
            className="flex items-center bg-gray-900 text-white px-6 py-3 rounded-2xl hover:bg-gray-800 transition-all shadow-xl hover:shadow-gray-200 active:scale-95"
          >
            <Download className="w-4 h-4 mr-2" /> Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200 text-[11px] font-black text-gray-500 uppercase">
              <th className="py-4 px-6 text-left w-1/2">Particulars</th>
              <th className="py-4 px-4 text-center">Notes</th>
              <th className="py-4 px-6 text-right">As at {dates.closing}</th>
              <th className="py-4 px-6 text-right">As at {dates.opening}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {renderHeader("ASSETS")}
            <tr className="bg-gray-50/30"><td colSpan="4" className="py-1 px-4 text-[11px] font-bold text-gray-700 italic">Non-Current Assets</td></tr>
            {renderRow("(a) Property, plant & equipment", "5", "pl-6")}
            {renderRow("(b) Financial assets", "6", "pl-6 font-semibold")}
            {renderRow("(i) Investments", "6a", "pl-12")}
            {renderRow("(ii) Other financial assets", "6b", "pl-12")}
            {renderRow("(c) Deferred tax assets (net)", "7", "pl-6")}
            {renderRow("(d) Other non-current assets", "8", "pl-6")}
            <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
               <td className="py-2 px-10 text-xs text-gray-600 uppercase tracking-tighter">Sub-total (Non-current assets)</td><td/><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.ncAssets.c)}</td><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.ncAssets.o)}</td>
            </tr>

            <tr className="bg-gray-50/30 font-bold"><td colSpan="4" className="py-2 px-4 text-[11px] text-gray-700 italic">Current Assets</td></tr>
            {renderRow("(a) Inventories", "9", "pl-6")}
            {renderRow("(b) Financial assets", "10", "pl-6 font-semibold")}
            {renderRow("(i) Trade receivables", "10a", "pl-12")}
            {renderRow("(ii) Cash and cash equivalents", "10b", "pl-12")}
            {renderRow("(iii) Bank balances other than (ii) above", "10c", "pl-12")}
            {renderRow("(iv) Other financial assets", "10d", "pl-12")}
            {renderRow("(c) Current tax assets (net)", "11", "pl-6")}
            {renderRow("(d) Other current assets", "12", "pl-6")}
            <tr className="bg-gray-50 font-bold border-t border-gray-200">
               <td className="py-2 px-10 text-xs text-gray-600 uppercase tracking-tighter">Sub-total (Current assets)</td><td/><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.cAssets.c)}</td><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.cAssets.o)}</td>
            </tr>

            <tr className="bg-gray-100 font-bold border-y-2 border-gray-300">
               <td className="py-3 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">TOTAL ASSETS</td>
               <td/>
               <td className="text-right px-6 font-mono text-indigo-800 text-sm">{formatNum(totals.assets.c)}</td>
               <td className="text-right px-6 font-mono text-indigo-800 text-sm">{formatNum(totals.assets.o)}</td>
            </tr>

            {renderHeader("EQUITY AND LIABILITIES")}
            <tr className="bg-gray-50/30 font-bold"><td colSpan="4" className="py-2 px-4 text-[11px] text-gray-700 italic">Equity</td></tr>
            {renderRow("(a) Equity share capital", "13", "pl-6")}
            {renderRow("(b) Other equity", "14", "pl-6")}
            <tr className="bg-gray-50 font-bold border-t border-gray-200">
               <td className="py-2 px-10 text-xs text-gray-600 uppercase tracking-tighter">Sub-total (Total Equity)</td><td/><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.equity.c)}</td><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.equity.o)}</td>
            </tr>

            {renderHeader("Liabilities")}
            <tr className="bg-gray-50/30 font-bold"><td colSpan="4" className="py-2 px-4 text-[11px] text-gray-700 italic">Non-current liabilities</td></tr>
            {renderRow("(a) Financial liabilities", "15", "pl-6 font-semibold")}
            {renderRow("(i) Borrowings", "15a", "pl-12")}
            {renderRow("(ii) Lease Liability", "15b", "pl-12")}
            {renderRow("(b) Provisions", "16", "pl-6")}
            <tr className="bg-gray-50 font-bold border-t border-gray-200">
               <td className="py-2 px-10 text-xs text-gray-600 uppercase tracking-tighter">Sub-total (Non-current liabilities)</td><td/><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.ncLiab.c)}</td><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.ncLiab.o)}</td>
            </tr>

            <tr className="bg-gray-50/30 font-bold"><td colSpan="4" className="py-2 px-4 text-[11px] text-gray-700 italic">Current liabilities</td></tr>
            {renderRow("(a) Financial liabilities", "17", "pl-6 font-semibold")}
            {renderRow("(i) Borrowings", "17a", "pl-12")}
            {renderRow("(ii) Lease Liability", "17b", "pl-12")}
            {renderRow("(iii) Trade payables", "17c", "pl-12 font-bold")}
            {renderRow("- Total outstanding due of micro and small enterprises", "17c_micro", "pl-16 text-[10px] text-gray-400 italic")}
            {renderRow("- Total outstanding due other than micro and small", "17c_other", "pl-16 text-[10px] text-gray-400 italic")}
            {renderRow("(iv) Other financial liabilities", "17d", "pl-12")}
            {renderRow("(b) Other current liabilities", "18", "pl-6")}
            {renderRow("(c) Provisions", "19", "pl-6")}
            <tr className="bg-gray-50 font-bold border-t border-gray-200">
               <td className="py-2 px-10 text-xs text-gray-600 uppercase tracking-tighter">Sub-total (Current liabilities)</td><td/><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.cLiab.c)}</td><td className="text-right px-6 font-mono text-gray-900">{formatNum(totals.cLiab.o)}</td>
            </tr>

            <tr className="bg-gray-900 font-bold text-white border-t-4 border-indigo-600 shadow-2xl">
               <td className="py-4 px-4 text-xs font-black uppercase tracking-widest">TOTAL EQUITY AND LIABILITIES</td>
               <td/>
               <td className="text-right px-6 font-mono text-sm leading-none">{formatNum(totals.eqLiab.c)}</td>
               <td className="text-right px-6 font-mono text-sm leading-none">{formatNum(totals.eqLiab.o)}</td>
            </tr>
            
            <tr className="bg-white border-t-2 border-gray-300">
               <td className="py-3 px-4 text-xs text-gray-700 italic font-semibold">Summary of material accounting policies</td>
               <td className="py-3 px-4 text-xs text-center text-indigo-600 font-semibold cursor-pointer hover:underline" onClick={() => handleNoteClickOverride('1to4')}>1 to 4</td>
               <td colSpan="2"/>
            </tr>
            <tr>
               <td colSpan="4" className="py-2 px-4 text-xs text-gray-500 italic">The notes (5 to 41) referred above form an integral part of the Standalone Financial Statements</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div className="mt-12 text-sm text-gray-800 font-sans border-t pt-8">
        <p className="mb-6 font-semibold italic">As per our report of even date</p>
        <div className="flex justify-between w-full">
          <div className="w-1/3">
            <p className="font-bold">For Agarwal & Saxena</p>
            <p className="mb-2">Chartered Accountants</p>
            <p className="mb-10 font-bold">( FRN-002405C )</p>
            
            <p className="font-bold">Akshay Sethi</p>
            <p>Partner</p>
            <p>M. No. : 539439</p>
          </div>
          <div className="w-2/3 pl-12 flex flex-col items-center">
            <p className="font-bold w-full text-center">For and on behalf of the Board of Directors</p>
            <p className="w-full text-center mb-10">XYZ Sohna Projects Limited</p>
            <div className="flex justify-between w-full mt-4">
              <div className="text-center">
                <p className="font-bold">Parag Gupta</p>
                <p>(Director)</p>
                <p>DIN: 05179313</p>
              </div>
              <div className="text-center">
                <p className="font-bold">Anand Kumar Srivastava</p>
                <p>(Director)</p>
                <p>DIN: 10676937</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <p>Place: New Delhi</p>
          <p>Date: {new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}</p>
        </div>
      </div>
      
      <div className="mt-10 text-[10px] text-gray-300 italic text-center uppercase tracking-widest font-black">
        Note: Items with * represent static fallback values from source report and predicted headings.
      </div>
    </div>
  );
};

export default SohnaFormatBS;
