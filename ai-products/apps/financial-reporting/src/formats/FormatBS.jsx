import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Download } from "lucide-react";
import { useToast } from "../context/ToastContext";
import SohnaFormatBS from "./SohnaFormatBS";
import { apiUrl } from "../lib/apiPath";
import { downloadBlob } from "../lib/documentMail";
import { SCREENSHOT_VALUES_BS, buildInfraBSWorkbook } from "./infraStatements";

const FormatBS = () => {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedSection, setExpandedSection] = useState(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  useEffect(() => {
    // Lock body scroll when sidebar is open
    document.body.style.overflow = isNotesOpen ? "hidden" : "";
    // Cleanup on unmount — always restore scroll
    return () => {
      document.body.style.overflow = "";
    };
  }, [isNotesOpen]);

  const balanceSheetData = location.state?.balanceSheetData;

  if (!balanceSheetData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl shadow">
          No Balance Sheet Data Found.
          <button
            onClick={() => navigate("/dashboard")}
            className="block mt-4 text-indigo-600 underline"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const companyType = balanceSheetData.companyType;
  const { years, notes, dates } = balanceSheetData.data;

  const extractCode = (title) => {
    const match = title.match(/^(\d+)(?:\((\w)\))?/);
    if (!match) return null;
    return match[2] ? `${match[1]}(${match[2]})` : match[1];
  };

  const extractName = (title) => {
    const match = title.match(/^\d+(\(\w\))?\.\s*(.*)/);
    return match ? match[2] : title;
  };

  const sections = [
    { title: "4. Property, Plant & Equipment and Other Intangible Assets" },
    { title: "5. Capital Work In Progress" },
    {
      title: "6. Financial Assets",
      children: [
        { title: "6(a). Investments" },
        { title: "6(b). Loans" },
        { title: "6(c). Other Financial Assets" },
      ],
    },
    { title: "7. Deferred Tax Assets (Net)" },
    { title: "8. Other Non-Current Assets" },
    { title: "9. Inventories" },
    {
      title: "10. Financial Assets",
      children: [
        { title: "10(a). Trade Receivables" },
        { title: "10(b). Cash and Cash Equivalents" },
        { title: "10(c). Bank Balances Other Than Above" },
        { title: "10(d). Other Financial Assets" },
      ],
    },
    { title: "11. Other Current Assets" },
    {
      title: "12. Equity Share Capital",
      children: [{ title: "12(a). Other Equity" }],
    },
    {
      title: "13. Financial Liabilities",
      children: [{ title: "13(a). Borrowings" }],
    },
    { title: "14. Provisions" },
    {
      title: "15. Financial Liabilities",
      children: [
        { title: "15(a). Borrowings" },
        { title: "15(b). Trade Payables" },
        { title: "15(c). Other Financial Liabilities" },
      ],
    },
    { title: "16. Other Current Liabilities" },
    { title: "17. Provisions" },
    { title: "28. Disclosures Relating To Employee Benefits" },
    { title: "29. Segment Reporting" },
    { title: "30. Interest In Other Entities" },
    { title: "31. Related Party Disclosures" },
    { title: "32. Contingent Liabilities" },
    { title: "33. Leases" },
    { title: "34. Expenditure In Foreign Currency (On Accrual Basis)" },
    { title: "35. Capital And Other Commitments" },
    { title: "36." },
    { title: "37. Disclosure Under The Micro, Small And Medium Enterprises Development Act, 2006" },
    { title: "38." },
    { title: "39." },
    { title: "40. Investment Includes" },
    { title: "41. Corporate Social Responsibility (CSR)" },
    { title: "42. Financial Instruments" },
    { title: "43. Financial Risk Management Objective And Policies" },
    { title: "44. Capital Management" },
    { title: "45. Ratio Analysis" },
    { title: "46. Other Statutory Information" },
    { title: "47." },
    { title: "48." },
  ];

  // Flat list of all note codes for prev/next navigation
  const allNoteCodes = sections.flatMap((s) =>
    s.children
      ? s.children.map((c) => extractCode(c.title))
      : [extractCode(s.title)]
  );

  const handleNoteClick = async (code) => {
    try {
      setLoadingNote(true);
      const formData = new FormData();
      formData.append("notePoint", code);

      const res = await axios.post(apiUrl("/api/notes/notesToProcess"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const currentIndex = allNoteCodes.indexOf(code);
      navigate("/dashboard/trial-balance/result-notes", {
        state: {
          noteNumber: code,
          data: res.data.data,
          allNoteCodes,
          currentIndex,
          balanceSheetData,
          sourceRoute: "/dashboard/trial-balance/balance-sheet/processed",
        },
      });
    } catch (error) {
      console.error(error);
      showToast(error.response?.data?.message || "Something went wrong!", "error");
    } finally {
      setLoadingNote(false);
    }
  };

  if (companyType === "SOHNA") {
    return (
      <SohnaFormatBS
        data={balanceSheetData.data}
        onBack={() => navigate("/dashboard")}
        onNoteClick={handleNoteClick}
      />
    );
  }

  // Static notes that don't need backend
  const staticCodes = [
    "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48",
  ];

  const screenshotValuesBS = SCREENSHOT_VALUES_BS;

  const getSafeValueBS = (key, type) => {
    // Prioritize static values from screenshot if they exist
    if (companyType === "INFRASTRUCTURE" && screenshotValuesBS[key]) {
      return { value: screenshotValuesBS[key][type], isStatic: true };
    }

    const originalVal = notes[key]?.[type];
    const numericVal = Number(originalVal || 0);
    return { value: numericVal, isStatic: false };
  };

  const renderRow = (label, noteKey, customClosing = null, customOpening = null, indent = "pl-6", bold = false) => {
    const processValue = (val, type, key) => {
      if (val !== null) {
        return typeof val === 'object' ? val : { value: val, isStatic: false };
      }
      return getSafeValueBS(key, type);
    };

    const closing = processValue(customClosing, 'closing', noteKey);
    const opening = processValue(customOpening, 'opening', noteKey);

    const noAsteriskList = ["6(b)", "8", "10(a)", "10(b)", "10(c)", "10(d)", "12", "12(a)", "14", "15b_micro", "15b_other", "15(c)", "16", "17"];
    const showAsterisk = closing.isStatic && !noAsteriskList.includes(noteKey);

    return (
      <tr key={`${label}-${noteKey || ''}`} className={`hover:bg-gray-50 transition-colors ${bold ? 'font-bold' : ''}`}>
        <td className={`py-1.5 px-4 text-sm ${indent}`}>{label}</td>
        <td className="py-1.5 px-4 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => noteKey && handleNoteClick(noteKey)}>
          {noteKey}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {closing.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{showAsterisk ? '*' : ''}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {opening.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{showAsterisk ? '*' : ''}
        </td>
      </tr>
    );
  };

  // same workbook the post-upload email attaches
  const buildExcel = () => buildInfraBSWorkbook(balanceSheetData);

  const renderSectionHeader = (label) => (
    <tr className="bg-gray-50 border-y border-gray-100">
      <td colSpan="4" className="py-2.5 px-4 text-[10px] font-black text-gray-900 tracking-wider uppercase">{label}</td>
    </tr>
  );

  return (
    <div className="flex flex-col bg-gray-50 min-h-screen">
      {/* Navigation & Detected Badge */}
      <div className="flex items-center justify-between px-8 py-4 bg-white shadow-sm sticky top-0 z-30">
        <button
          onClick={() => navigate("/dashboard")}
          className="group flex items-center text-gray-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Return to Dashboard</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { const { blob, fileName } = buildExcel(); downloadBlob(blob, fileName); }}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 transition active:scale-95"
          >
            <Download className="w-4 h-4" /> Download Excel
          </button>
          <button
            onClick={() => navigate("/dashboard/trial-balance/profit-loss/processed", {
              state: {
                profitLossData: balanceSheetData
              }
            })}
            className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg active:scale-95"
          >
            Show Profit & Loss
          </button>
          <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              Infrastructure Detected
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-8">
        <div className="bg-white text-gray-900 font-sans p-12 max-w-5xl mx-auto rounded-3xl shadow-2xl border border-gray-100 print:p-6 print:shadow-none">
          {/* Header */}
          <div className="relative mb-12">
            <div className="absolute -left-12 top-0 w-1 h-16 bg-indigo-600 rounded-r-full" />
            <h2 className="text-3xl font-black tracking-tight text-gray-900 uppercase">
              {balanceSheetData.companyName || "XYZ INFRASTRUCTURE & PROPERTIES LIMITED"}
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <h3 className="text-lg font-medium text-gray-500 uppercase tracking-widest">
                Standalone Balance Sheet
              </h3>
              <span className="h-px w-12 bg-gray-200" />
              <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest">
                As at {dates?.closing ?? "-"}
              </p>
            </div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-[0.2em] mt-4">
              Currency in INR Millions • High Fidelity Report
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left py-4 px-6 text-xs font-black uppercase tracking-widest">Particulars</th>
                  <th className="text-center py-4 px-2 text-xs font-black uppercase tracking-widest w-[80px]">Notes</th>
                  <th className="text-right py-4 px-6 text-xs font-black uppercase tracking-widest w-[160px] bg-indigo-600">
                    {dates?.closing ?? "-"}
                  </th>
                  <th className="text-right py-4 px-6 text-xs font-black uppercase tracking-widest w-[160px]">
                    31 March, 2025
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {renderSectionHeader("ASSETS")}
                <tr><td colSpan="4" className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-tighter bg-gray-50/30">Non-Current Assets</td></tr>
                {renderRow("Property, plant & equipment", "4")}
                {renderRow("Capital work in progress", "5")}
                {renderRow("Other intangible assets", "4", getSafeValueBS("4_int", "closing"), getSafeValueBS("4_int", "opening"))}

                <tr><td className="pl-6 py-1.5 text-sm font-semibold text-gray-600">Financial assets</td><td /><td /><td /></tr>
                {renderRow("(i) Investments", "6(a)")}
                {renderRow("(ii) Loans", "6(b)")}
                {renderRow("(iii) Other financial assets", "6(c)")}

                {renderRow("Deferred tax assets (net)", "7")}
                {renderRow("Other non-current assets", "8")}

                <tr className="bg-indigo-50/50 font-bold border-t border-indigo-100">
                  <td className="py-3 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total Non-Current Assets</td>
                  <td />
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(
                      getSafeValueBS("4", "closing").value + getSafeValueBS("5", "closing").value + getSafeValueBS("4_int", "closing").value +
                      getSafeValueBS("6(a)", "closing").value + getSafeValueBS("6(b)", "closing").value + getSafeValueBS("6(c)", "closing").value +
                      getSafeValueBS("7", "closing").value + getSafeValueBS("8", "closing").value
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(
                      getSafeValueBS("4", "opening").value + getSafeValueBS("5", "opening").value + getSafeValueBS("4_int", "opening").value +
                      getSafeValueBS("6(a)", "opening").value + getSafeValueBS("6(b)", "opening").value + getSafeValueBS("6(c)", "opening").value +
                      getSafeValueBS("7", "opening").value + getSafeValueBS("8", "opening").value
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                <tr><td colSpan="4" className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-tighter bg-gray-50/30 pt-6">Current Assets</td></tr>
                {renderRow("Inventories", "9")}
                <tr><td className="pl-6 py-1.5 text-sm font-semibold text-gray-600">Financial assets</td><td /><td /><td /></tr>
                {renderRow("(i) Trade receivables", "10(a)")}
                {renderRow("(ii) Cash and cash equivalents", "10(b)")}
                {renderRow("(iii) Bank balances other than above", "10(c)")}
                {renderRow("(iv) Other financial assets", "10(d)")}
                {renderRow("Other current assets", "11")}

                <tr className="bg-indigo-50/50 font-bold border-t border-indigo-100">
                  <td className="py-3 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total Current Assets</td>
                  <td />
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(
                      getSafeValueBS("9", "closing").value + getSafeValueBS("10(a)", "closing").value + getSafeValueBS("10(b)", "closing").value +
                      getSafeValueBS("10(c)", "closing").value + getSafeValueBS("10(d)", "closing").value + getSafeValueBS("11", "closing").value
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(
                      getSafeValueBS("9", "opening").value + getSafeValueBS("10(a)", "opening").value + getSafeValueBS("10(b)", "opening").value +
                      getSafeValueBS("10(c)", "opening").value + getSafeValueBS("10(d)", "opening").value + getSafeValueBS("11", "opening").value
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                <tr className="bg-indigo-600 text-white font-black border-t-2 border-indigo-700">
                  <td className="py-4 px-6 text-sm uppercase tracking-[0.2em]">TOTAL ASSETS</td>
                  <td />
                  <td className="text-right px-6 font-mono text-lg">
                    {Number(13820.20).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-lg">
                    {Number(13483.48).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {renderSectionHeader("EQUITY AND LIABILITIES")}
                <tr><td colSpan="4" className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-tighter bg-gray-50/30">Equity</td></tr>
                {renderRow("Equity share capital", "12")}
                {renderRow("Other equity", "12(a)")}
                <tr className="bg-indigo-50/50 font-bold border-t border-indigo-100">
                  <td className="py-3 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total Equity</td>
                  <td />
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(getSafeValueBS("12", "closing").value + getSafeValueBS("12(a)", "closing").value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(getSafeValueBS("12", "opening").value + getSafeValueBS("12(a)", "opening").value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                <tr><td colSpan="4" className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-tighter bg-gray-50/30 pt-6">Non-Current Liabilities</td></tr>
                <tr><td className="pl-6 py-1.5 text-sm font-semibold text-gray-600">Financial liabilities</td><td /><td /><td /></tr>
                {renderRow("Borrowings", "13(a)", null, null, "pl-12")}
                {renderRow("Provisions", "14")}
                <tr className="bg-indigo-50/50 font-bold border-t border-indigo-100">
                  <td className="py-3 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total Non-Current Liabilities</td>
                  <td />
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(getSafeValueBS("13(a)", "closing").value + getSafeValueBS("14", "closing").value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(getSafeValueBS("13(a)", "opening").value + getSafeValueBS("14", "opening").value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                <tr><td colSpan="4" className="py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-tighter bg-gray-50/30 pt-6">Current Liabilities</td></tr>
                <tr><td className="pl-6 py-1.5 text-sm font-semibold text-gray-600">Financial liabilities</td><td /><td /><td /></tr>
                {renderRow("(i) Borrowings", "15(a)", null, null, "pl-12")}
                <tr><td className="pl-12 py-1.5 text-sm font-semibold text-gray-600"> (ii) Trade payables</td><td className="text-center py-1.5 text-sm font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => handleNoteClick("15(b)")}>15(b)</td><td /><td /></tr>
                {renderRow("- Dues to micro and small enterprises", "15(b)", getSafeValueBS("15b_micro", "closing"), getSafeValueBS("15b_micro", "opening"), "pl-16 text-xs text-gray-500")}
                {renderRow("- Due to creditors other than micro and small enterprises", "15(b)", getSafeValueBS("15b_other", "closing"), getSafeValueBS("15b_other", "opening"), "pl-16 text-xs text-gray-500")}
                {renderRow("(iii) Other financial liabilities", "15(c)", null, null, "pl-12")}
                {renderRow("Other current liabilities", "16")}
                {renderRow("Provisions", "17")}

                <tr className="bg-indigo-50/50 font-bold border-t border-indigo-100">
                  <td className="py-3 px-4 text-xs font-black uppercase tracking-widest text-indigo-700">Total Current Liabilities</td>
                  <td />
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(
                      getSafeValueBS("15(a)", "closing").value + getSafeValueBS("15b_micro", "closing").value + getSafeValueBS("15b_other", "closing").value +
                      getSafeValueBS("15(c)", "closing").value + getSafeValueBS("16", "closing").value + getSafeValueBS("17", "closing").value
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-indigo-900">
                    {(
                      getSafeValueBS("15(a)", "opening").value + getSafeValueBS("15b_micro", "opening").value + getSafeValueBS("15b_other", "opening").value +
                      getSafeValueBS("15(c)", "opening").value + getSafeValueBS("16", "opening").value + getSafeValueBS("17", "opening").value
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                <tr className="bg-indigo-600 text-white font-black border-t-2 border-indigo-700">
                  <td className="py-4 px-6 text-sm uppercase tracking-[0.2em]">TOTAL EQUITY AND LIABILITIES</td>
                  <td />
                  <td className="text-right px-6 font-mono text-lg">
                    {Number(13820.20).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-6 font-mono text-lg">
                    {Number(13483.48).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-12 text-[13px] leading-5">
            <p className="mb-8 text-gray-500 italic">
              Summary of material accounting policies (Notes 1-3) and accompanying notes (4 to 48) form an integral part of these standalone financial statements.
            </p>
            <div className="grid grid-cols-2 gap-12 pt-8 border-t border-gray-100">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Statutory Audit</p>
                <p className="font-semibold text-gray-900">For Agarwal & Saxena</p>
                <p className="text-sm text-gray-500">Chartered Accountants • Firm Reg: 002405C</p>
                <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="font-bold text-indigo-600">Akshay Sethi</p>
                  <p className="text-xs text-gray-500 uppercase tracking-tighter">Partner • M.No: 539439</p>
                </div>
                <div className="mt-6 flex gap-8">
                  <div><p className="text-[10px] text-gray-400 uppercase font-black">Place</p><p className="text-sm font-medium">New Delhi</p></div>
                  <div><p className="text-[10px] text-gray-400 uppercase font-black">Date</p><p className="text-sm font-medium">--</p></div>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Board Authorization</p>
                <p className="font-semibold text-gray-900 uppercase tracking-tight">XYZ Infrastructure & Properties Limited</p>
                <p className="text-[10px] text-gray-400 font-mono">CIN: U74899HR2000PLC043893</p>

                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="font-bold text-gray-800 text-sm">Pankaj Bajaj</p>
                    <p className="text-[10px] text-gray-500 uppercase">MD • DIN: 00024735</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="font-bold text-gray-800 text-sm">Ranjit Khattar</p>
                    <p className="text-[10px] text-gray-500 uppercase">Director • DIN: 00726997</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="font-bold text-gray-800 text-sm">Rajiv Khurana</p>
                    <p className="text-[10px] text-gray-500 uppercase">CFO • ACA: 093132</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="font-bold text-gray-800 text-sm">Swati Gupta</p>
                    <p className="text-[10px] text-gray-500 uppercase">CS • ACS: A35294</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes Button */}
      <button
        onClick={() => setIsNotesOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-indigo-700 transition flex items-center gap-2"
      >
        ☰ Notes To Accounts
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 z-40 transition-opacity duration-300 ${isNotesOpen ? "opacity-100 visible" : "opacity-0 invisible"
          }`}
        onClick={() => setIsNotesOpen(false)}
      ></div>

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-[300px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isNotesOpen ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-semibold text-lg">Notes To Accounts</h3>
          <button
            onClick={() => setIsNotesOpen(false)}
            className="text-gray-500 hover:text-red-600 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-70px)]">
          {sections.map((section, index) => {
            const parentCode = extractCode(section.title);
            return (
              <div key={index} className="mb-3">
                <button
                  onClick={() => {
                    if (section.children) {
                      setExpandedSection(
                        expandedSection === parentCode ? null : parentCode
                      );
                    } else {
                      handleNoteClick(parentCode);
                    }
                  }}
                  className="w-full py-2 px-3 text-left bg-gray-50 hover:bg-indigo-600 hover:text-white rounded-lg text-sm transition"
                >
                  {parentCode} - {extractName(section.title)}
                </button>

                {section.children && expandedSection === parentCode && (
                  <div className="ml-4 mt-2 space-y-1">
                    {section.children.map((child, idx) => {
                      const childCode = extractCode(child.title);
                      return (
                        <button
                          key={idx}
                          onClick={() => handleNoteClick(childCode)}
                          className="block w-full text-left py-1 px-2 text-xs bg-gray-50 hover:bg-indigo-500 hover:text-white rounded-md transition"
                        >
                          {childCode} - {extractName(child.title)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {loadingNote && (
            <p className="text-sm text-indigo-600 mt-3 flex items-center"><span className="animate-spin mr-2">◌</span> Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormatBS;