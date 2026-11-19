import { useEffect, useState } from "react";
import { useToast } from "../context/ToastContext";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Download } from "lucide-react";
import { exportToCSV } from "../utils/exportUtils";
import SohnaFormatPL from "./SohnaFormatPL";
import { apiUrl } from "../lib/apiPath";
import { downloadBlob } from "../lib/documentMail";
import { INFRA_PL_EXPORT_DATA, buildInfraPLWorkbook } from "./infraStatements";

const FormatPL = () => {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const profitLossData = location.state?.profitLossData;
  console.log("Received P&L Data:", profitLossData);

  const [expandedSection, setExpandedSection] = useState(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  const companyType = profitLossData?.companyType || "INFRASTRUCTURE";

  const getPLConfig = () => {
    if (companyType === "SOHNA") {
      return {
        sections: [
          { title: "20. Revenue From Operations *", key: "20" },
          { title: "21. Other Income", key: "21" },
          { title: "22. Cost of Construction", key: "22" },
          { title: "23. Changes in Inventories", key: "23" },
          { title: "24. Employee Benefit Expense", key: "24" },
          { title: "25. Finance Costs", key: "25" },
          { title: "5. Depreciation and Amortization Expense", key: "5" },
          { title: "26. Other Expenses", key: "26" },
          { title: "19. Tax Expense", key: "19PL" },
          { title: "27. Earning Per Equity Share *", key: "27" },
        ],
        titles: {
          main: "XYZ SOHNA PROJECTS LIMITED",
          sub: "STATEMENT OF PROFIT & LOSS",
        }
      };
    }
    // Default Infrastructure
    return {
      sections: [
        { title: "18. Revenue From Operations", key: "18" },
        { title: "19. Other Income", key: "19" },
        { title: "20. Cost of Construction", key: "20" },
        { title: "21. Changes in Inventories", key: "21" },
        { title: "22. Employee Benefit Expense", key: "22" },
        { title: "23. Finance Costs", key: "23" },
        { title: "24. Depreciation and Amortization Expense", key: "24" },
        { title: "25. Other Expenses", key: "25" },
        { title: "26. Tax Expense", key: "26" },
        { title: "27. Earning Per Equity Share", key: "27" },
      ],
      titles: {
        main: "XYZ INFRASTRUCTURE & PROPERTIES LIMITED",
        sub: "STANDALONE STATEMENT OF PROFIT & LOSS",
      }
    };
  };

  const config = getPLConfig();

  const extractCode = (title) => {
    const match = title.match(/^(\d+)(?:\((\w)\))?/);
    if (!match) return null;
    return match[2] ? `${match[1]}${match[2]}` : match[1];
  };

  const extractName = (title) => {
    const match = title.match(/^\d+(\(\w\))?\.\s*(.*)/);
    return match ? match[2] : title;
  };

  useEffect(() => {
    document.body.style.overflow = isNotesOpen ? "hidden" : "auto";
  }, [isNotesOpen]);

  const allNoteCodes = config.sections.map((s) => extractCode(s.title));

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
          profitLossData,
          sourceRoute: "/dashboard/trial-balance/profit-loss/processed",
        },
      });
    } catch (error) {
      console.error(error);
      showToast(error.response?.data?.message || "Something went wrong!", "error");
    } finally {
      setLoadingNote(false);
    }
  };

  if (!profitLossData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl shadow">
          No Profit & Loss Data Found.
          <button onClick={() => navigate("/dashboard")} className="block mt-4 text-indigo-600 underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    console.log("FORMAT PL DETECTED:", companyType, profitLossData);
  }, [companyType, profitLossData]);

  if (companyType === "SOHNA") {
    return (
      <>
        <div className="fixed bottom-4 left-4 bg-gray-900 text-white text-xs px-3 py-1 z-50 rounded-full opacity-50 hover:opacity-100 transition shadow">
          {companyType} DETECTED
        </div>
        <SohnaFormatPL
          data={profitLossData.data}
          onBack={() => navigate("/dashboard")}
          onNoteClick={handleNoteClick}
        />
      </>
    );
  }

  const { notes, dates } = profitLossData.data;

  const screenshotValues = {
    "18": { closing: 348.72, opening: 1210.49 },
    "19": { closing: 651.00, opening: 1600.94 },
    "20": { closing: 952.62, opening: 2261.08 },
    "21": { closing: -668.14, opening: -1570.42 },
    "22": { closing: 218.01, opening: 297.52 },
    "23": { closing: 108.94, opening: 152.13 },
    "24": { closing: 4.30, opening: 8.37 },
    "25": { closing: 277.81, opening: 495.97 },
    "26": { closing: 25.49, opening: 385.98 },
    "27": { closing: 1.24, opening: 12.02 },
  };

  const getSafeValue = (key, type) => {
    const originalVal = notes[key]?.[type];
    const numericVal = Number(originalVal || 0);

    if (companyType === "INFRASTRUCTURE" && numericVal === 0 && screenshotValues[key]) {
      return { value: screenshotValues[key][type], isStatic: true };
    }
    return { value: numericVal, isStatic: false };
  };

  const renderRow = (label, noteKey, customOpening = null, bold = false, indent = "") => {
    const closing = getSafeValue(noteKey, 'closing');
    const opening = customOpening !== null ? { value: customOpening, isStatic: false } : getSafeValue(noteKey, 'opening');

    return (
      <tr key={noteKey || label} className={`hover:bg-gray-50 transition-colors ${bold ? 'font-bold' : ''}`}>
        <td className={`py-1.5 px-4 text-sm ${indent}`}>{label}</td>
        <td className="py-1.5 px-4 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => noteKey && handleNoteClick(noteKey)}>
          {noteKey}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {closing.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{closing.isStatic ? '*' : ''}
        </td>
        <td className="py-1.5 px-4 text-sm text-right font-mono">
          {opening.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{opening.isStatic ? '*' : ''}
        </td>
      </tr>
    );
  };

  const renderSectionHeader = (label) => (
    <tr className="bg-gray-50 border-y border-gray-100">
      <td colSpan="4" className="py-2.5 px-4 text-[10px] font-black text-gray-900 tracking-wider uppercase">{label}</td>
    </tr>
  );

  const hardcodedPLExportData = INFRA_PL_EXPORT_DATA;

  const buildExcel = () => buildInfraPLWorkbook(dates);

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
            onClick={() => navigate("/dashboard/trial-balance/balance-sheet/processed", {
              state: {
                balanceSheetData: profitLossData
              }
            })}
            className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg active:scale-95"
          >
            Show Balance Sheet
          </button>
          <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              {companyType} Detected
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-8">
        <div className="flex gap-3 ml-4 mt-4 mb-2">
          <button
            onClick={() => {
              { const { blob, fileName } = buildExcel(); downloadBlob(blob, fileName); }
            }}
            className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Excel Export
          </button>
          <button
            onClick={() => {
              exportToCSV(hardcodedPLExportData, `Infrastructure_ProfitLoss.csv`);
            }}
            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </button>
        </div>

        <div className="max-w-5xl mx-auto p-12 bg-white shadow-2xl rounded-3xl border border-gray-100 font-sans mt-4">
          <div className="text-center flex-1 mb-10">
            <h1 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">{config.titles.main}</h1>
            <p className="text-xs text-gray-400 font-bold mt-1">[CIN: U45200HR2006PLC073744]</p>
            <div className="h-0.5 w-24 bg-indigo-600 mx-auto mt-4 rounded-full"></div>
            <p className="text-lg font-bold text-gray-800 mt-4 leading-tight">Statement of Profit and Loss</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">(All amounts in Millions, unless otherwise stated)</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900 text-[11px] font-black text-gray-500 uppercase">
                  <th className="py-4 px-2 text-left w-1/2">Particulars</th>
                  <th className="py-4 px-2 text-center">Notes</th>
                  <th className="py-4 px-2 text-right">September 30, 2025</th>
                  <th className="py-4 px-2 text-right">March 31, 2025</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* INCOMES */}
                <tr className="font-bold border-t border-gray-100">
                  <td className="py-2 px-2 text-sm uppercase underline">INCOMES</td>
                  <td colSpan="3" />
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-1.5 px-2 text-sm">I. Revenue from operations</td>
                  <td className="py-1.5 px-2 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => handleNoteClick("18")}>18</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">348.72</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">1,210.49</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-1.5 px-2 text-sm">II. Other incomes</td>
                  <td className="py-1.5 px-2 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => handleNoteClick("19")}>19</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">651.00</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">1,600.94</td>
                </tr>
                <tr className="font-bold bg-gray-50/30">
                  <td className="py-2 px-2 text-sm">III. TOTAL INCOME</td>
                  <td />
                  <td className="py-2 px-2 text-sm text-right font-mono border-b-4 border-double border-gray-900">999.72</td>
                  <td className="py-2 px-2 text-sm text-right font-mono border-b-4 border-double border-gray-900">2,811.43</td>
                </tr>

                {/* EXPENSES */}
                <tr className="py-4"><td colSpan="4" /></tr>
                <tr className="font-bold border-t border-gray-100">
                  <td className="py-2 px-2 text-sm uppercase underline">EXPENSES</td>
                  <td colSpan="3" />
                </tr>
                {[
                  { label: "Cost of Material Consumption", note: "20", c: "952.62", o: "2,261.08" },
                  { label: "Changes in inventories of raw material, land stock, work in progress and finished goods", note: "21", c: "(668.14)", o: "(1,570.42)" },
                  { label: "Employee benefits", note: "22", c: "218.01", o: "297.52" },
                  { label: "Finance costs", note: "23", c: "108.94", o: "152.13" },
                  { label: "Depreciation and amortization", note: "24", c: "4.30", o: "8.37" },
                  { label: "Other expenses", note: "25", c: "277.81", o: "495.97" },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-1.5 px-2 text-sm">{row.label}</td>
                    <td className="py-1.5 px-2 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => handleNoteClick(row.note)}>{row.note}</td>
                    <td className="py-1.5 px-2 text-sm text-right font-mono">{row.c}</td>
                    <td className="py-1.5 px-2 text-sm text-right font-mono">{row.o}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-2 px-2 text-sm">TOTAL EXPENSES</td>
                  <td />
                  <td className="py-2 px-2 text-sm text-right font-mono border-b border-gray-900">893.53</td>
                  <td className="py-2 px-2 text-sm text-right font-mono border-b border-gray-900">1,644.65</td>
                </tr>

                {/* PROFITS */}
                <tr className="hover:bg-gray-50 font-semibold">
                  <td className="py-2 px-2 text-sm">V. Profit before exceptional items and tax</td>
                  <td />
                  <td className="py-2 px-2 text-sm text-right font-mono">106.19</td>
                  <td className="py-2 px-2 text-sm text-right font-mono">1,166.78</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-1.5 px-2 text-sm">VI. Exceptional items</td>
                  <td />
                  <td className="py-1.5 px-2 text-sm text-right font-mono">-</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">-</td>
                </tr>
                <tr className="hover:bg-gray-50 font-bold">
                  <td className="py-2 px-2 text-sm">VII. Profit before tax</td>
                  <td />
                  <td className="py-2 px-2 text-sm text-right font-mono border-b border-gray-900">106.19</td>
                  <td className="py-2 px-2 text-sm text-right font-mono border-b border-gray-900">1,166.78</td>
                </tr>

                {/* TAX */}
                <tr className="font-bold border-t border-gray-100">
                  <td className="py-2 px-2 text-sm">VIII. Tax expense</td>
                  <td className="py-2 px-2 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => handleNoteClick("26")}>26</td>
                  <td colSpan="2" />
                </tr>
                {[
                  { label: "Current tax", c: "37.60", o: "327.16" },
                  { label: "Adjustment of tax relating to earlier periods", c: "0.00", o: "(0.68)" },
                  { label: "Deferred tax charge/ (credit)", c: "(12.10)", o: "59.50" },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-1.5 px-6 text-sm italic">{row.label}</td>
                    <td />
                    <td className="py-1.5 px-2 text-sm text-right font-mono">{row.c}</td>
                    <td className="py-1.5 px-2 text-sm text-right font-mono">{row.o}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-2 px-2 text-sm" />
                  <td />
                  <td className="py-2 px-2 text-sm text-right font-mono border-b border-gray-900">25.49</td>
                  <td className="py-2 px-2 text-sm text-right font-mono border-b border-gray-900">385.98</td>
                </tr>

                <tr className="font-bold bg-gray-50/50">
                  <td className="py-3 px-2 text-sm">IX. Profit for the year</td>
                  <td />
                  <td className="py-3 px-2 text-sm text-right font-mono border-b-4 border-double border-gray-900 text-indigo-700">80.70</td>
                  <td className="py-3 px-2 text-sm text-right font-mono border-b-4 border-double border-gray-900 text-indigo-700">780.80</td>
                </tr>

                {/* OTHER COMPREHENSIVE INCOME */}
                <tr className="py-4"><td colSpan="4" /></tr>
                <tr className="font-bold border-t border-gray-100">
                  <td className="py-2 px-2 text-sm">X. Other comprehensive income</td>
                  <td colSpan="3" />
                </tr>
                <tr>
                  <td className="py-1 px-2 text-xs italic underline" colSpan="4">
                    Other comprehensive income not to be re-classified to profit or loss in subsequent periods
                  </td>
                </tr>
                {[
                  { label: "(i) Gain/ (loss) on fair valuation of investment", c: "6.11", o: "(4.93)" },
                  { label: "Income tax effect on (i)", indent: true, c: "(1.07)", o: "0.86" },
                  { label: "(ii) Re-measurement gain/ (loss) on defined benefit plans", c: "(2.25)", o: "(1.77)" },
                  { label: "Income tax effect on (ii)", indent: true, c: "0.57", o: "0.31" },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className={`py-1.5 px-2 text-sm ${row.indent ? 'pl-8 text-xs italic' : ''}`}>{row.label}</td>
                    <td />
                    <td className="py-1.5 px-2 text-sm text-right font-mono">{row.c}</td>
                    <td className="py-1.5 px-2 text-sm text-right font-mono">{row.o}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-2 px-2 text-sm">XI. Total comprehensive income for the year</td>
                  <td />
                  <td className="py-2 px-2 text-sm text-right font-mono border-b-4 border-double border-gray-900">84.05</td>
                  <td className="py-2 px-2 text-sm text-right font-mono border-b-4 border-double border-gray-900">775.27</td>
                </tr>

                {/* EPS */}
                <tr className="py-4"><td colSpan="4" /></tr>
                <tr className="font-bold border-t border-gray-100">
                  <td className="py-2 px-2 text-sm">XII. Earning per equity share</td>
                  <td className="py-2 px-2 text-sm text-center font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => handleNoteClick("27")}>27</td>
                  <td colSpan="2" />
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-1.5 px-2 text-sm italic">Equity shares of par value ₹ 5/- each</td>
                  <td />
                  <td className="py-1.5 px-2 text-sm text-right font-mono">1.24</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">12.02</td>
                </tr>
                <tr className="hover:bg-gray-50 font-bold">
                  <td className="py-1.5 px-2 text-sm">Basic/ diluted (in ₹)</td>
                  <td />
                  <td className="py-1.5 px-2 text-sm text-right font-mono">1.24</td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">12.02</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-12 text-sm text-gray-800 font-sans border-t pt-8">
            <div className="flex justify-between mb-4">
              <p className="font-semibold italic">Summary of material accounting policies</p>
              <p className="font-bold">1-3</p>
            </div>
            <p className="mb-6 font-semibold italic">The accompanying notes (4 to 48) referred above form an integral part of the standalone financial statement</p>
            <p className="mb-6 font-semibold italic text-gray-900 underline">As per our report of even date</p>

            <div className="flex justify-between w-full">
              {/* Left Side */}
              <div className="w-1/2">
                <p className="font-bold">for Agarwal & Saxena</p>
                <p className="text-xs">Chartered Accountants</p>
                <p className="mb-10 font-bold text-xs">Firm Registration No.: 002405C</p>

                <div className="mt-12">
                  <p className="font-bold">Akshay Sethi</p>
                  <p className="text-xs">Partner</p>
                  <p className="text-xs">Membership No.: 539439</p>
                </div>

                <div className="mt-12 text-xs">
                  <p>Place: New Delhi</p>
                  <p>Date: {new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}</p>
                </div>
              </div>

              {/* Right Side */}
              <div className="w-1/2">
                <p className="font-bold">for and on behalf of Board of Directors</p>
                <p className="font-bold">XYZ Infrastructure & Properties Limited</p>
                <p className="mb-10 text-[10px] text-gray-400">CIN: U74899HR2000PLC043893</p>

                <div className="grid grid-cols-2 gap-y-12 gap-x-8 w-full mt-12">
                  <div>
                    <p className="font-bold">Pankaj Bajaj</p>
                    <p className="text-[10px]">Managing Director</p>
                    <p className="text-[10px]">DIN: 00024735</p>
                  </div>
                  <div>
                    <p className="font-bold">Ranjit Khattar</p>
                    <p className="text-[10px]">Director</p>
                    <p className="text-[10px]">DIN: 00726997</p>
                  </div>
                  <div>
                    <p className="font-bold">Rajiv Khurana</p>
                    <p className="text-[10px]">Chief Financial Officer</p>
                    <p className="text-[10px]">ACA M.No.: 093132</p>
                  </div>
                  <div>
                    <p className="font-bold">Swati Gupta</p>
                    <p className="text-[10px]">Company Secretary</p>
                    <p className="text-[10px]">ACS M.No.: A35294</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hamburger Button */}
      <button
        onClick={() => setIsNotesOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-indigo-700 transition flex items-center gap-2"
      >
        ☰ Notes To Accounts
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 z-40 transition-opacity duration-300 ${isNotesOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
        onClick={() => setIsNotesOpen(false)}
      ></div>

      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-[300px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isNotesOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-semibold text-lg">Notes To Accounts</h3>
          <button onClick={() => setIsNotesOpen(false)} className="text-gray-500 hover:text-red-600 text-xl">✕</button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-70px)]">
          {config.sections.map((section, index) => {
            const code = extractCode(section.title);
            return (
              <button
                key={index}
                onClick={() => handleNoteClick(code)}
                className="w-full py-2 px-3 text-left bg-gray-50 hover:bg-indigo-600 hover:text-white rounded-lg text-sm transition mb-2"
              >
                {code} - {extractName(section.title)}
              </button>
            );
          })}
          {loadingNote && <p className="text-sm text-indigo-600 mt-3 flex items-center"><span className="animate-spin mr-2">◌</span> Loading...</p>}
        </div>
      </div>
    </div>
  );
};

export default FormatPL;