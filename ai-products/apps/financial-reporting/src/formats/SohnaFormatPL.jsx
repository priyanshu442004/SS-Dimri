import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { exportSohnaPLToExcel } from "../utils/sohnaExportUtils";
import SohnaStaticPLNotes from "../components/SohnaStaticPLNotes";

const SohnaFormatPL = ({ data, onBack, onNoteClick }) => {
  const navigate = useNavigate();
  const { notes, dates } = data;
  const [showNotes, setShowNotes] = useState(false);
  const [activeNote, setActiveNote] = useState(null);

  const handleNoteClickOverride = (noteKey) => {
    setActiveNote(noteKey);
    setShowNotes(true);
  };

  const sohnaStaticValues = {
    "20": { closing: 411.70, opening: 3384.81 },
    "21": { closing: 29.92, opening: 29.97 },
    "22": { closing: 2910.83, opening: 472.80 },
    "23": { closing: -2458.21, opening: 3222.79 },
    "24": { closing: 8.71, opening: 9.54 },
    "25": { closing: 5.68, opening: 11.67 },
    "5": { closing: 0.32, opening: 0.59 },
    "26": { closing: 80.83, opening: 111.48 },
    "exceptional": { closing: "-", opening: "-" },
    "taxCurrent": { closing: "-", opening: "-" },
    "taxPrior": { closing: 9.01, opening: "-" },
    "taxDeferred": { closing: -79.51, opening: -102.10 },
    "19PL": { closing: -70.50, opening: -102.10 },
    "oci_i": { closing: 0.05, opening: 0.09 },
    "oci_tax": { closing: -0.01, opening: -0.02 },
    "27": { closing: -5.91, opening: -51.15 },
  };

  const renderRow = (label, noteKey, bold = false, indent = "") => {
    const staticData = sohnaStaticValues[noteKey];
    const noteData = staticData || notes[noteKey] || { opening: 0, closing: 0 };
    return (
      <tr key={noteKey || label} className={`hover:bg-gray-50 transition-colors ${bold ? 'font-bold' : ''}`}>
        <td className={`py-1.5 px-4 text-sm ${indent}`}>{label}</td>
        <td className="py-1.5 px-4 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => noteKey && handleNoteClickOverride(noteKey)}>
          {noteKey && !noteKey.includes('tax') && !noteKey.includes('oci') && noteKey !== 'exceptional' ? noteKey : ''}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {typeof noteData.closing === 'string' ? noteData.closing : formatNum(noteData.closing)}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {typeof noteData.opening === 'string' ? noteData.opening : formatNum(noteData.opening)}
        </td>
      </tr>
    );
  };

  const renderSectionHeader = (label) => (
    <tr className="bg-gray-50 border-y border-gray-100">
      <td colSpan="4" className="py-2.5 px-4 text-[10px] font-black text-gray-900 tracking-wider uppercase">{label}</td>
    </tr>
  );

  const getVal = (noteKey, type = 'closing') => {
    const staticData = sohnaStaticValues[noteKey];
    if (staticData) {
      const val = type === 'closing' ? staticData.closing : staticData.opening;
      return typeof val === 'number' ? val : 0;
    }

    const d = notes[noteKey];
    if (!d) return 0;
    const val = type === 'closing' ? d.closing : d.opening;
    return parseFloat(String(val).replace('*', '')) || 0;
  };

  const formatNum = (num) => {
    if (num < 0) return `(${Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const totals = {
    income: {
      c: getVal("20") + getVal("21"),
      o: getVal("20", "o") + getVal("21", "o")
    },
    expenses: {
      c: getVal("22") + getVal("23") + getVal("24") + getVal("25") + getVal("5") + getVal("26"),
      o: getVal("22", "o") + getVal("23", "o") + getVal("24", "o") + getVal("25", "o") + getVal("5", "o") + getVal("26", "o")
    }
  };

  const pbit = { c: totals.income.c - totals.expenses.c, o: totals.income.o - totals.expenses.o };
  const pbt = pbit;
  const tax = { c: getVal("19PL"), o: getVal("19PL", "o") };
  const pat = { c: pbt.c - tax.c, o: pbt.o - tax.o };
  
  const oci = { c: getVal("oci_i") + getVal("oci_tax"), o: getVal("oci_i", "o") + getVal("oci_tax", "o") };
  const tci = { c: pat.c + oci.c, o: pat.o + oci.o };

  if (showNotes) {
    return (
      <SohnaStaticPLNotes 
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
            onClick={() => navigate("/dashboard/trial-balance/balance-sheet/processed", { 
              state: { 
                balanceSheetData: { data, companyType: "SOHNA" } 
              } 
            })}
            className="flex items-center text-indigo-600 hover:text-indigo-800 transition-colors font-bold text-xs uppercase tracking-widest"
          >
            Show Balance Sheet
          </button>
        </div>
        <div className="text-center flex-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">XYZ SOHNA PROJECTS LIMITED</h1>
          <p className="text-xs text-gray-400 font-bold mt-1">[CIN: U45200HR2006PLC073744]</p>
          <div className="h-0.5 w-24 bg-indigo-600 mx-auto mt-4 rounded-full"></div>
          <p className="text-lg font-bold text-gray-800 mt-4 leading-tight">Standalone Statement of Profit and Loss for the year ended {dates.closing}</p>
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
            onClick={() => exportSohnaPLToExcel(data)}
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
              <th className="py-4 px-4 text-center">Notes No.</th>
              <th className="py-4 px-6 text-right">For the year ended {dates.closing}</th>
              <th className="py-4 px-6 text-right">For the year ended {dates.opening}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {renderSectionHeader("Income")}
            {renderRow("Revenue from operations", "20")}
            {renderRow("Other incomes", "21")}
            <tr className="bg-gray-50/50 font-bold">
               <td className="py-2.5 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total Income</td><td/><td className="text-right px-6 font-mono text-indigo-800">{formatNum(totals.income.c)}</td><td className="text-right px-6 font-mono text-indigo-800">{formatNum(totals.income.o)}</td>
            </tr>

            {renderSectionHeader("Expenses")}
            {renderRow("Cost of material consumed", "22")}
            {renderRow("Changes in Inventories of raw materials, land stock, WIP", "23")}
            {renderRow("Employee benefits expense", "24")}
            {renderRow("Finance costs", "25")}
            {renderRow("Depreciation and amortization", "5")}
            {renderRow("Other expenses", "26")}
            <tr className="bg-gray-50/50 font-bold">
               <td className="py-2.5 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total expenses</td><td/><td className="text-right px-6 font-mono text-indigo-800">{formatNum(totals.expenses.c)}</td><td className="text-right px-6 font-mono text-indigo-800">{formatNum(totals.expenses.o)}</td>
            </tr>

            {renderSectionHeader("Profit Before Tax")}
            <tr className="font-bold">
               <td className="py-2 px-4 text-sm">Profit before exceptional items and tax</td><td/><td className="text-right px-6 font-mono">{formatNum(pbit.c)}</td><td className="text-right px-6 font-mono">{formatNum(pbit.o)}</td>
            </tr>
            {renderRow("Exceptional items", "exceptional")}
            <tr className="font-bold border-y border-gray-200 bg-gray-50/20">
               <td className="py-2 px-4 text-sm">Profit before tax</td><td/><td className="text-right px-6 font-mono">{formatNum(pbt.c)}</td><td className="text-right px-6 font-mono">{formatNum(pbt.o)}</td>
            </tr>

            {renderSectionHeader("Tax Expense")}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="py-1.5 px-4 text-sm pl-4">1) Current tax</td><td/>
              <td className="py-1.5 px-4 text-sm text-right font-mono">{formatNum(getVal("taxCurrent"))}</td>
              <td className="py-1.5 px-4 text-sm text-right font-mono">{formatNum(getVal("taxCurrent", "o"))}</td>
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="py-1.5 px-4 text-sm pl-4">2) Previous year tax</td><td/>
              <td className="py-1.5 px-4 text-sm text-right font-mono">{formatNum(getVal("taxPrior"))}</td>
              <td className="py-1.5 px-4 text-sm text-right font-mono">{formatNum(getVal("taxPrior", "o"))}</td>
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="py-1.5 px-4 text-sm pl-4">3) Deferred tax charge/ (credit)</td><td/>
              <td className="py-1.5 px-4 text-sm text-right font-mono">{formatNum(getVal("taxDeferred"))}</td>
              <td className="py-1.5 px-4 text-sm text-right font-mono">{formatNum(getVal("taxDeferred", "o"))}</td>
            </tr>
            {renderRow("Total Tax Expense", "19PL", true, "pl-2")}

            <tr className="bg-gray-900 text-white font-bold">
               <td className="py-3 px-4 text-sm uppercase tracking-widest">Profit for the year</td><td/><td className="text-right px-6 font-mono">{formatNum(pat.c)}</td><td className="text-right px-6 font-mono">{formatNum(pat.o)}</td>
            </tr>

            {renderSectionHeader("Other Comprehensive Income")}
            {renderRow("(i) Re-measurement gain/(loss) on defined benefits plans", "oci_i", false, "pl-4")}
            {renderRow("Income tax effect on (i)", "oci_tax", false, "pl-4")}
            <tr className="font-bold border-t border-gray-200">
               <td className="py-2 px-4 text-xs uppercase text-gray-600 tracking-tighter">Total other comprehensive income/ (loss), net of tax</td><td/><td className="text-right px-6 font-mono">{formatNum(oci.c)}</td><td className="text-right px-6 font-mono">{formatNum(oci.o)}</td>
            </tr>

            <tr className="bg-indigo-600 text-white font-black border-t-2 border-indigo-800">
               <td className="py-4 px-4 text-xs font-black uppercase tracking-widest">Total comprehensive income for the year</td><td/><td className="text-right px-6 font-mono text-sm leading-none">{formatNum(tci.c)}</td><td className="text-right px-6 font-mono text-sm leading-none">{formatNum(tci.o)}</td>
            </tr>

            {renderSectionHeader("Earnings per equity share")}
            <tr className="text-[11px] text-gray-400 italic">
               <td className="px-4 py-1">Equity shares of par value ₹ 10/- each</td><td/><td/><td/>
            </tr>
            {renderRow("Basic/ diluted (in ₹)", "27", true, "pl-2")}

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
    </div>
  );
};

export default SohnaFormatPL;
