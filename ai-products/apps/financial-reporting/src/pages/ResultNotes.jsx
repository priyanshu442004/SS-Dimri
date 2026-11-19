import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiUrl } from "../lib/apiPath";

const ResultNotes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state?.data;
  const allNoteCodes = location.state?.allNoteCodes ?? [];
  const currentIndex = location.state?.currentIndex ?? -1;
  const [loading, setLoading] = useState(false);

  // Save source route and data to sessionStorage whenever available
  if (location.state?.balanceSheetData) {
    sessionStorage.setItem("goBackRoute", "/dashboard/trial-balance/balance-sheet/processed");
    sessionStorage.setItem("goBackData", JSON.stringify({ balanceSheetData: location.state.balanceSheetData }));
  }
  if (location.state?.profitLossData) {
    sessionStorage.setItem("goBackRoute", "/dashboard/trial-balance/profit-loss/processed");
    sessionStorage.setItem("goBackData", JSON.stringify({ profitLossData: location.state.profitLossData }));
  }

  const staticNotePoint = location.state?.noteNumber;

  if (!data && !staticNotePoint) {
    return <div>No data available</div>;
  }

  const GoBackButton = () => (
    <div className="fixed top-4 left-4 z-50">
      <button
        onClick={() => {
          const route = sessionStorage.getItem("goBackRoute") || "/dashboard/trial-balance/balance-sheet/processed";
          const data = sessionStorage.getItem("goBackData");
          navigate(route, {
            state: data ? JSON.parse(data) : null
          });
        }}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-md transition"
      >
        ← Go back
      </button>
    </div>
  );

  const effectiveNotePoint = data?.notePoint ?? staticNotePoint;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allNoteCodes.length - 1;

  const navigateToNote = async (index) => {
    const code = allNoteCodes[index];
    if (!code) return;

    const staticCodes = ["28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"];
    if (staticCodes.includes(String(code))) {
      navigate("/dashboard/trial-balance/result-notes", {
        state: { noteNumber: code, data: null, allNoteCodes, currentIndex: index, balanceSheetData: location.state?.balanceSheetData, profitLossData: location.state?.profitLossData },
      });
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("notePoint", code);
      const res = await axios.post(
        apiUrl("/api/notes/notesToProcess"),
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      navigate("/dashboard/trial-balance/result-notes", {
        state: {
          noteNumber: code,
          data: res.data.data,
          allNoteCodes,
          currentIndex: index,
          balanceSheetData: location.state?.balanceSheetData,
          profitLossData: location.state?.profitLossData,
        },
      });
    } catch (error) {
      const message = error.response?.data?.message || "Something went wrong!";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  // ── NAV BUTTONS (shared) ─────────────────────────────────────────────────────
  const NavButtons = () => (
    <div className="flex justify-end items-center gap-3 mt-8 pt-6 border-t border-gray-200">
      <button
        onClick={() => navigateToNote(currentIndex - 1)}
        disabled={!hasPrev || loading}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition ${hasPrev && !loading
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
      >
        <ChevronLeft className="w-4 h-4" />
        Previous: Note {hasPrev ? allNoteCodes[currentIndex - 1] : ""}
      </button>
      <button
        onClick={() => navigateToNote(currentIndex + 1)}
        disabled={!hasNext || loading}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition ${hasNext && !loading
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
      >
        Next: Note {hasNext ? allNoteCodes[currentIndex + 1] : ""}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  // ── NOTE 28 – STATIC PAGE ────────────────────────────────────────────────────
  if (effectiveNotePoint === "28") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-6">28. DISCLOSURES RELATING TO EMPLOYEE BENEFITS</h2>

          {/* A) Defined Contribution Plans */}
          <p className="font-semibold mb-1">A) Defined Contribution Plans:</p>
          <p className="text-sm mb-3">Contribution to Defined Contribution Plans recognised as an expense for the year are as under:</p>
          <table className="w-full border-collapse text-sm mb-6">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Particulars</th>
                <th className="text-right py-2 px-2">September 30, 2025</th>
                <th className="text-right py-2 px-2">March 31, 2025</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1">Employer's Contribution to Provident Fund</td>
                <td className="text-right px-2">2.98</td>
                <td className="text-right px-2">5.21</td>
              </tr>
              <tr className="font-semibold border-t">
                <td className="py-1">TOTAL:</td>
                <td className="text-right px-2">2.98</td>
                <td className="text-right px-2">5.21</td>
              </tr>
            </tbody>
          </table>

          {/* B) Defined Benefit Plans */}
          <p className="font-semibold mb-1">B) Defined Benefit Plans:</p>
          <p className="text-sm mb-2">Disclosures relating to defined benefits plans are given below:</p>
          <p className="font-semibold mb-1">(a) Gratuity</p>
          <p className="text-sm mb-3">The Company provides for gratuity for employees in India as per the Payment of Gratuity Act, 1972. All permanent employees who are in continuous service for a period of 5 years are eligible for gratuity. The amount of gratuity payable on retirement/termination is the employee's last drawn basic salary per month computed proportionately for 15 days salary multiplied for the number of years of service.</p>
          <p className="font-semibold mb-1">(b) Leave Encashment</p>
          <p className="text-sm mb-4">Provision for leave encashment in respect of un-availed leaves standing to the credit of employees is made on actuarial basis. The Company does not maintain any fund to pay for leave encashment.</p>

          {/* Reusable double-header table */}
          {[
            {
              title: "(i) Changes in present value of defined benefit obligation",
              rows: [
                ["Present value of defined benefit obligation as at the beginning of the year", "32.13", "30.98", "4.92", "4.40"],
                ["Interest cost", "1.12", "2.24", "0.17", "0.32"],
                ["Current service cost", "2.25", "3.94", "0.80", "1.24"],
                ["Benefits paid", "(0.76)", "(3.69)", "(0.19)", "(0.61)"],
                ["Actuarial (gain)/loss recognized during the year", "1.36", "(1.33)", "0.89", "(0.44)"],
                ["Present value of defined benefit obligation as at the end of the year", "36.10", "32.13", "6.58", "4.92"],
              ],
            },
            {
              title: "(ii) Amount recognised in the Standalone Balance Sheet",
              rows: [
                ["Present value of obligation as at end of year", "36.10", "32.13", "6.58", "4.92"],
                ["Fair value of plan assets as at end of the year", "-", "-", "-", "-"],
                ["Net obligation as at end of the year", "36.10", "32.13", "6.58", "4.92"],
              ],
            },
            {
              title: "(iv) Present value of defined obligation as at the end of year",
              rows: [
                ["Current", "1.23", "0.97", "0.38", "0.30"],
                ["Non-Current", "34.87", "31.16", "6.21", "4.61"],
                ["Total", "36.10", "32.13", "6.59", "4.92"],
              ],
            },
          ].map(({ title, rows }) => (
            <div key={title} className="mb-6">
              <p className="font-semibold mb-2">{title}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                      <th className="text-center py-1 px-2 border-b" colSpan={2}>(a) DEFINED BENEFITS GRATUITY</th>
                      <th className="text-center py-1 px-2 border-b" colSpan={2}>(b) LEAVE ENCASHMENT</th>
                    </tr>
                    <tr className="border-b bg-gray-50">
                      {["Sep 30, 2025", "Mar 31, 2025", "Sep 30, 2025", "Mar 31, 2025"].map(h => (
                        <th key={h} className="text-right py-1 px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, ...vals], i) => (
                      <tr key={i} className={i === rows.length - 1 ? "font-semibold border-t" : ""}>
                        <td className="py-1 px-2">{label}</td>
                        {vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* (iii) Net Defined Benefit Cost */}
          <p className="font-semibold mb-2">(iii) Net Defined Benefit cost for the year</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>(a) DEFINED BENEFITS GRATUITY</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>(b) LEAVE ENCASHMENT</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  {["Sep 30, 2025", "Mar 31, 2025", "Sep 30, 2025", "Mar 31, 2025"].map(h => (
                    <th key={h} className="text-right py-1 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td className="py-1 px-2 font-medium" colSpan={5}>(a) Amount recognized in statement of profit and loss is as under:</td></tr>
                {[
                  ["Current service cost", "2.25", "3.94", "0.80", "1.24"],
                  ["Interest cost", "1.12", "2.24", "0.17", "0.32"],
                  ["Amount recognized in statement of profit and loss [Total (a)]", "3.37", "6.18", "0.97", "1.56"],
                ].map(([label, ...vals], i) => (
                  <tr key={i} className={i === 2 ? "font-semibold border-t" : ""}>
                    <td className="py-1 px-2 pl-4">{label}</td>
                    {vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                  </tr>
                ))}
                <tr><td className="py-1 px-2 font-medium" colSpan={5}>(b) Amount recognized in Other Comprehensive Income (OCI) as under:</td></tr>
                {[
                  ["Actuarial (Gain)/Loss on arising from Change in Demographic Assumption", "-", "-", "-", "-"],
                  ["Actuarial (Gain)/Loss on arising from Change in Financial Assumption", "(0.78)", "(2.42)", "(0.18)", "(0.50)"],
                  ["Actuarial (Gain)/Loss on arising from Experience Adjustment", "2.13", "1.09", "1.07", "0.07"],
                  ["Actuarial (Gain)/Loss for the year recognised in OCI [Total (b)]", "1.36", "(1.33)", "0.89", "(0.44)"],
                  ["Net Defined Benefit Cost in Total Comprehensive Income (a+b)", "4.73", "4.84", "1.86", "1.12"],
                ].map(([label, ...vals], i) => (
                  <tr key={i} className={i === 3 || i === 4 ? "font-semibold border-t" : ""}>
                    <td className="py-1 px-2 pl-4">{label}</td>
                    {vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* (v) Actuarial Assumptions */}
          <p className="font-semibold mb-2">(v) For determination of the liability in respect of gratuity and leave encashment of the Company, the following actuarial assumptions were used:</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>(a) DEFINED BENEFITS GRATUITY</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>(b) LEAVE ENCASHMENT</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  {["Sep 30, 2025", "Mar 31, 2025", "Sep 30, 2025", "Mar 31, 2025"].map(h => (
                    <th key={h} className="text-right py-1 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Discount rate", "7.21%", "6.99%", "7.21%", "6.99%"],
                  ["Expected salary escalation rate", "7.00%", "7.00%", "7.00%", "7.00%"],
                  ["Mortality rate", "100% of IALM (2012-14)", "100% of IALM (2012-14)", "100% of IALM (2012-14)", "100% of IALM (2012-14)"],
                  ["Retirement age", "60 years", "60 years", "60 years", "60 years"],
                ].map(([label, ...vals], i) => (
                  <tr key={i}><td className="py-1 px-2">{label}</td>{vals.map((v, j) => <td key={j} className="text-right px-2 text-xs">{v}</td>)}</tr>
                ))}
                <tr><td className="py-1 px-2 font-medium" colSpan={5}>Withdrawal rates</td></tr>
                <tr><td className="py-1 px-2 font-medium pl-4" colSpan={5}>Age</td></tr>
                {[
                  ["Up to 30 year", "3.00%", "3.00%", "3.00%", "3.00%"],
                  ["From 31 to 44 year", "2.00%", "2.00%", "2.00%", "2.00%"],
                  ["Above 44 year", "1.00%", "1.00%", "1.00%", "1.00%"],
                ].map(([label, ...vals], i) => (
                  <tr key={i}><td className="py-1 px-2 pl-8">{label}</td>{vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}</tr>
                ))}
                <tr><td className="py-1 px-2 font-medium" colSpan={5}>Leave</td></tr>
                {[
                  ["Leave Availment Rate", "NA", "NA", "5.00%", "5.00%"],
                  ["Leave Lapse rate while in service", "NA", "NA", "Nil", "Nil"],
                  ["Leave Lapse rate on exit", "NA", "NA", "Nil", "Nil"],
                  ["Leave encashment Rate while in service", "NA", "NA", "5.00%", "5.00%"],
                ].map(([label, ...vals], i) => (
                  <tr key={i}><td className="py-1 px-2 pl-4">{label}</td>{vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* (vi) Sensitivity Analysis */}
          <p className="font-semibold mb-2">(vi) Sensitivity Analysis of the defined benefit obligation.</p>
          {[
            {
              sub: "a) Impact of the change in discount rate", rows: [
                ["Present value of obligation at the end of the period", "36.10", "32.13", "6.59", "4.92"],
                ["a) Impact due to increase of 0.50%", "(1.69)", "(1.56)", "(0.38)", "(0.30)"],
                ["b) Impact due to decrease of 0.50 %", "1.76", "1.63", "0.42", "0.33"],
              ]
            },
            {
              sub: "b) Impact of the change in Salary", rows: [
                ["Present value of obligation at the end of the period", "36.10", "32.13", "6.59", "4.92"],
                ["a) Impact due to increase of 0.50%", "1.75", "1.62", "0.42", "0.32"],
                ["b) Impact due to decrease of 0.50 %", "(1.70)", "(1.57)", "(0.38)", "(0.30)"],
              ]
            },
          ].map(({ sub, rows }) => (
            <div key={sub} className="mb-4">
              <p className="font-medium mb-2">{sub}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                      <th className="text-center py-1 px-2 border-b" colSpan={2}>(a) DEFINED BENEFITS GRATUITY</th>
                      <th className="text-center py-1 px-2 border-b" colSpan={2}>(b) LEAVE ENCASHMENT</th>
                    </tr>
                    <tr className="border-b bg-gray-50">
                      {["Sep 30, 2025", "Mar 31, 2025", "Sep 30, 2025", "Mar 31, 2025"].map(h => (
                        <th key={h} className="text-right py-1 px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, ...vals], i) => (
                      <tr key={i} className={i === 0 ? "font-semibold" : ""}>
                        <td className="py-1 px-2">{label}</td>
                        {vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="text-sm italic mb-4">Sensitivities due to mortality &amp; withdrawals are not material &amp; hence impact of change due to these not calculated.</p>
          <p className="text-sm mb-6">The sensitivity analyses above have been determined based on a method that extrapolates the impact on defined benefit obligation as a result of reasonable changes in key assumptions occurring at the end of the reporting period. The sensitivity analyses are based on a change in a significant assumption, keeping all other assumptions constant. The sensitivity analyses may not be representative of an actual change in the defined benefit obligation as it is unlikely that changes in assumptions would occur in isolation from one another.</p>

          {/* (vii) Maturity Profile */}
          <p className="font-semibold mb-2">(vii) The expected future cash flows in respect of gratuity and Leave encashment as at March 31, 2025 and March 31, 2024 were as follows:</p>
          <p className="font-medium mb-2">Maturity Profile of Defined Benefit Obligation:</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>(a) DEFINED BENEFITS GRATUITY</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>(b) LEAVE ENCASHMENT</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  {["Sep 30, 2025", "Mar 31, 2025", "Sep 30, 2025", "Mar 31, 2025"].map(h => (
                    <th key={h} className="text-right py-1 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["0 to 1 Year", "1.23", "0.97", "0.38", "0.30"],
                  ["1 to 2 Year", "2.03", "1.84", "0.22", "0.18"],
                  ["2 to 3 Year", "1.03", "0.69", "0.16", "0.10"],
                  ["3 to 4 Year", "2.74", "0.88", "0.25", "0.11"],
                  ["4 to 5 Year", "1.15", "2.35", "0.16", "0.19"],
                  ["5 to 6 Year", "2.70", "2.18", "0.27", "0.18"],
                  ["6 Year onwards", "25.21", "23.21", "5.14", "3.85"],
                  ["Total expected payments", "36.10", "32.13", "6.59", "4.92"],
                ].map(([label, ...vals], i) => (
                  <tr key={i} className={i === 7 ? "font-semibold border-t" : ""}>
                    <td className="py-1 px-2">{label}</td>
                    {vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 29 – SEGMENT REPORTING ─────────────────────────────────────────────
  if (effectiveNotePoint === "29") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-6">29. SEGMENT REPORTING</h2>

          <p className="text-sm">
            In line with the provisions of Ind AS 108 - Operating Segments and on the basis of review of operations being done by the management of the Company, the operations of the Company fall under real estate business, which is considered to be the only reportable segment by management.
          </p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 30 – INTEREST IN OTHER ENTITIES ────────────────────────────────────
  if (effectiveNotePoint === "30") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-6">30. INTEREST IN OTHER ENTITIES</h2>

          {/* a. Subsidiaries */}
          <p className="font-semibold mb-1">a. Subsidiaries</p>
          <p className="text-sm mb-4">
            The Company's interest and share in subsidiaries (Including fellow Subsidiaries) are set out below. Unless otherwise stated, the proportion of ownership interests held equals the voting rights held by the Company, directly or indirectly, and the country of incorporation or registration is also their principal place of business.
          </p>

          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Name of entities</th>
                  <th className="text-center py-2 px-2" rowSpan={2}>Country of Incorporation</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>Ownership interest as at</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["A P Utility Services Limited", "India", "100%", "100%"],
                  ["XYZ Real Estate Limited#", "India", "30%", "30%"],
                  ["Adhikari Properties Limited", "India", "100%", "100%"],
                  ["Amazon Infra Realtors Limited", "India", "100%", "100%"],
                  ["Amazon Infracon Limited", "India", "100%", "100%"],
                  ["Amazon Real Estate Limited", "India", "100%", "100%"],
                  ["AP Projects Limited", "India", "100%", "100%"],
                  ["Chiranjiv Builders Limited", "India", "100%", "100%"],
                  ["XYZ County Limited", "India", "100%", "100%"],
                  ["XYZ Greens Limited", "India", "100%", "100%"],
                  ["XYZ Homes Projects Limited", "India", "100%", "100%"],
                  ["Ethenic Projects Private Limited", "India", "100%", "100%"],
                  ["Ethenic Real Estate Private Limited", "India", "100%", "100%"],
                  ["Green Park Buildwell Limited", "India", "100%", "100%"],
                  ["Green Park Infracon Limited", "India", "100%", "100%"],
                  ["XYZ Green Park Infrastructure Limited", "India", "100%", "100%"],
                  ["Hi Pride Infracon Limited", "India", "100%", "100%"],
                  ["Shri Ajitnath Buildcon Limited", "India", "100%", "100%"],
                  ["Maksad Estate and Hardware Limited", "India", "100%", "100%"],
                  ["XYZ Maksad Properties Limited", "India", "100%", "100%"],
                  ["Mansarover Realtors Limited", "India", "100%", "100%"],
                  ["Pigeon Infrastructure Limited", "India", "100%", "100%"],
                  ["Pigeon Properties Limited", "India", "100%", "100%"],
                  ["S M Buildcon Limited", "India", "100%", "100%"],
                  ["Savana Builders Company Limited", "India", "100%", "100%"],
                  ["Savana Infrastructure & Properties limited", "India", "100%", "100%"],
                  ["Savana Realtors Company Limited", "India", "100%", "100%"],
                  ["Swarnim Nirman Private Limited", "India", "100%", "100%"],
                  ["Alternative Habitat Private Limited", "India", "100%", "100%"],
                  ["XYZ Sohna Projects Limited", "India", "100%", "100%"],
                  ["Mehak Realtors Private Limited**", "India", "100%", "100%"],
                  ["Shramika Infrastructure Private Limited**", "India", "100%", "100%"],
                  ["Kedarnath Buildwell Private Limited**", "India", "100%", "100%"],
                  ["Ethenic Buildwell Private Limited**", "India", "100%", "100%"],
                  ["Ethenic Realtors Private Limited **", "India", "100%", "100%"],
                  ["Santur Builders Private Limited", "India", "0%", "0%"],
                  ["XYZ Homes Developers Limited", "India", "70%", "70%"],
                  ["XYZ Serendipity Limited", "India", "100%", "100%"],
                  ["XYZ Infratech Realtors Limited", "India", "100%", "100%"],
                  ["XYZ Infracon Realtors Limited", "India", "100%", "100%"],
                  ["XYZ Townships & Housing Limited", "India", "100%", "100%"],
                  ["Ability Constructions Private Limited***", "India", "100%", "100%"],
                  ["Villa Construction Private Limited", "India", "100%", "100%"],
                  ["Best View Infracon Limited", "India", "100%", "100%"],
                  ["XYZ Sidcul Industrial Park Limited", "India", "89%", "89%"],
                  ["Blueridge Retails Private Limited", "India", "70%", "70%"],
                  ["XYZ Infrabuild Limited", "India", "67%", "67%"],
                  ["Popular Infratech Private Limited*", "India", "67%", "67%"],
                  ["Welcome Infra Developers Private Limited *", "India", "67%", "67%"],
                  ["Mars Buildtech Private Limited*", "India", "67%", "67%"],
                  ["Welcome Infrabuild Private Limited *", "India", "67%", "67%"],
                  ["Coolcorp Real Infra Private Limited*", "India", "67%", "67%"],
                  ["Hope Valley Infrastructure Private Limited*", "India", "67%", "67%"],
                  ["XYZ Abode Estates Solution Limited", "India", "100%", "100%"],
                  ["Havenclass Homes Solutions Limited", "India", "100%", "100%"],
                  ["XYZ Goodliving Properties Limited", "India", "70%", "70%"],
                  ["Subhagyam Constructions Limited", "India", "100%", "100%"],
                  ["Primula Luxury Homes Private Limited", "India", "90%", "90%"],
                  ["JITF ESIPL CETP (Sitarganj) Limited ^", "India", "43.61%", "43.61%"],
                ].map(([name, country, sep, mar25], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2">{name}</td>
                    <td className="text-center px-2">{country}</td>
                    <td className="text-right px-2">{sep}</td>
                    <td className="text-right px-2">{mar25}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footnotes */}
          <div className="text-sm italic mb-6 space-y-1">
            <p>#Subsidiary of Savana Builders Company Limited</p>
            <p>*Subsidiary of XYZ Infrabuild Limited</p>
            <p>**Subsidiary of XYZ Sohna Projects Limited</p>
            <p>***Subsidiary of XYZ Townships & Housing Limited</p>
            <p>^ Joint Venture of XYZ Sidcul Industrial Park Limited</p>
          </div>

          {/* b. Joint Ventures */}
          <p className="font-semibold mb-2">b. Joint ventures</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Name of entities</th>
                  <th className="text-center py-2 px-2" rowSpan={2}>Country of Incorporation</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>Ownership interest as at</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">Wondrous Buildmart Private Limited</td>
                  <td className="text-center px-2">India</td>
                  <td className="text-right px-2">10%</td>
                  <td className="text-right px-2">10%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 31 – RELATED PARTY DISCLOSURES ─────────────────────────────────────
  if (effectiveNotePoint === "31") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">31. RELATED PARTY DISCLOSURES</h2>

          <p className="text-sm mb-6">
            Related party disclosure as required by Ind-AS 24 "Related Party Disclosures" for the period ended September 31, 2025 are given below:
          </p>

          <p className="font-semibold mb-4">Names of related parties and nature of related party relationship:</p>

          {/* (i) */}
          <p className="font-semibold italic mb-1">(i) Parties over which the Company has control</p>
          <p className="text-sm mb-6">Interest in subsidiaries, including associates and joint ventures, are set out in Note 30.</p>

          {/* (ii) KMP */}
          <p className="font-semibold italic mb-2">(ii) Key management personnel (KMP):</p>
          <table className="w-full text-sm mb-6">
            <tbody>
              {[
                ["a.", "Mr. Pankaj Bajaj", "Managing Director"],
                ["b.", "Mr. Manish Jaiswal", "Chief Executive Officer"],
                ["c.", "Mr. Rajiv Khurana", "Chief Financial Officer [w.e.f. 16 July 2025]"],
                ["d.", "Mr. Sanjay Kumar Aggarwal", "Chief Financial Officer [Upto: 15 July 2025]"],
                ["e.", "Ms. Swati Gupta", "Company Secretary and Complience Officer"],
              ].map(([sl, name, role], i) => (
                <tr key={i}>
                  <td className="py-0.5 w-8 pl-6">{sl}</td>
                  <td className="py-0.5 w-64">{name}</td>
                  <td className="py-0.5">{role}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* (iii) Relatives of KMP */}
          <p className="font-semibold italic mb-2">
            (iii) Relatives of key management personnel (KMP) (with whom transactions are entered during the period and Balances as at September 30, 2025):
          </p>
          <table className="w-full text-sm mb-6">
            <tbody>
              {[
                ["a.", "Mrs. Asha Bajaj", "Mother of Mr. Pankaj Bajaj, Managing Director"],
                ["b.", "Mrs. Bandana Kohli", "Wife of Mr. Pankaj Bajaj, Managing Director"],
              ].map(([sl, name, role], i) => (
                <tr key={i}>
                  <td className="py-0.5 w-8 pl-6">{sl}</td>
                  <td className="py-0.5 w-64">{name}</td>
                  <td className="py-0.5">{role}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* (iv) Enterprises under significant influence */}
          <p className="font-semibold italic mb-2">
            (iv) Enterprises under significant influence of key management personnel, directors and their relatives (with whom transactions are entered during the year):
          </p>
          <table className="w-full text-sm mb-6">
            <tbody>
              {[
                ["a.", "Mannat Homes Private Limited"],
                ["b.", "Kohltec Constructions"],
                ["c.", "XYZ Housing & Industries Limited"],
                ["d.", "Omni Farms Private Limited"],
              ].map(([sl, name], i) => (
                <tr key={i}>
                  <td className="py-0.5 w-8 pl-6">{sl}</td>
                  <td className="py-0.5">{name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 32 – CONTINGENT LIABILITIES ────────────────────────────────────────
  if (effectiveNotePoint === "32") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-2">32. CONTINGENT LIABILITIES</h2>
          <p className="font-semibold mb-4">Contingent liabilities not provided for in respect of:</p>

          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>For the year ended</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                {/* i. Guarantees */}
                <tr>
                  <td className="py-2 px-2 font-semibold" colSpan={3}>i. Guarantees</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-6">Bank guarantees given on behalf of the subsidiary</td>
                  <td className="text-right px-2">247.28</td>
                  <td className="text-right px-2">43.29</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-6">Corporate guarantee given on behalf of the subsidiary</td>
                  <td className="text-right px-2">14,400.70</td>
                  <td className="text-right px-2">14,400.70</td>
                </tr>

                {/* ii. Tax Matters */}
                <tr>
                  <td className="py-2 px-2 font-semibold" colSpan={3}>ii. Tax Matters</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 px-2 pl-6 text-sm">
                    Demand Raised by income tax Authorities for the Assessment Year 2008-09 in assessment framed u/sec. 143(3) of the Act, making addition based on special audit,creating liability of ₹46.55 millions, which was reduced in appeal to ₹32.88 millions. The same has been challenged before ITAT. In current period, the case is closed in Vivad se Vishwas Scheme 2024.
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 px-2 pl-6 text-sm">
                    Demand Raised by income tax Authorities for the Assessment Year 2009-10 in assessment framed u/sec. 143(3) of the Act, making addition based on special audit,creating liability of ₹323.09 millions, which was reduced in appeal to ₹76.27 millions. The same has been challenged before ITAT.
                  </td>
                  <td className="text-right px-2">111.79</td>
                  <td className="text-right px-2">111.79</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 px-2 pl-6 text-sm">
                    Demand Raised by income tax Authorities for the Assessment Year 2016-17 in assessment framed u/sec. 143(3) of the Act making additions of ₹ 335.45 millions (tax demand ₹ 211.66 millions), which was been challenged in appeal before CIT (Appeal). Eventually, CIT(A) deleted additions of ₹ 155.63 millions. For remaining additions, company filed appeal in ITAT.
                  </td>
                  <td className="text-right px-2">113.46</td>
                  <td className="text-right px-2">113.46</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 px-2 pl-6 text-sm">
                    Demand of ₹3.02 millions alongwith interest & penalty of ₹3.114 millions raised by Delhi GST Authorities for financial year (2018-19) u/s 73 of CGST Act against which appeal has been filed before Appellate Authority, Department of Trade & Taxes, New Delhi (amount deposited by the Company is ₹0.30 millions).
                  </td>
                  <td className="text-right px-2">6.14</td>
                  <td className="text-right px-2">6.14</td>
                </tr>

                {/* iii. Claims */}
                <tr className="border-b border-gray-100">
                  <td className="py-2 px-2 font-semibold">iii. Claims against the company not acknowledged as debts</td>
                  <td className="text-right px-2">303.39</td>
                  <td className="text-right px-2">188.14</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm mb-6">
            Based on the advice from independent tax experts, the Company is confident that the additional demand so created will not be sustained. Pending the final order, no provision has been made in the current year standalone financial statements for the additional tax so demanded and the same has been disclosed as contingent liability.
          </p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 33 – LEASES ─────────────────────────────────────────────────────────
  if (effectiveNotePoint === "33") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">33. LEASES</h2>
          <p className="text-sm">
            The Company has taken various commercial premises under cancelable operating leases. Terms of the lease include terms for renewal, increase in rents in future periods and terms of cancellation. The total lease rental recognised as an expense during the year under the above lease agreements amounts to ₹ 4.33 millions (March 31, 2024: ₹3.90 millions).
          </p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 34 – EXPENDITURE IN FOREIGN CURRENCY ────────────────────────────────
  if (effectiveNotePoint === "34") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">34. EXPENDITURE IN FOREIGN CURRENCY (ON ACCRUAL BASIS)</h2>

          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>For the year ended</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">Travelling expenses</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">Project consultancy fees*</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">16.69</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm italic text-red-600"> incurred on behalf of XYZ Homes Developers Limited ( Refer note 31 )</p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 35 – CAPITAL AND OTHER COMMITMENTS ──────────────────────────────────
  if (effectiveNotePoint === "35") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">35. CAPITAL AND OTHER COMMITMENTS</h2>
          <p className="text-sm mb-3">
            i) Estimated number of contracts remaining to be executed on capital account and not provided for (net of advances) ₹ Nil (March 31, 2025: ₹ Nil, March 31, 2024: ₹ Nil).
          </p>
          <p className="text-sm">
            ii) The Company has undertaken to provide continued financial support to its certain subsidiaries as and when required.
          </p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 36 ───────────────────────────────────────────────────────────────────
  if (effectiveNotePoint === "36") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">36.</h2>
          <p className="text-sm">
            The company has not entered into any derivative instrument during the year. The company does not have any foreign currency exposures towards receivables, payables or any other derivative instrument that have not been hedged.
          </p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 37 – MSMED ACT ───────────────────────────────────────────────────────
  if (effectiveNotePoint === "37") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">37. DISCLOSURE UNDER THE MICRO, SMALL AND MEDIUM ENTERPRISES DEVELOPMENT ACT,2006 ("MSMED Act, 2006") AS BELOW:</h2>

          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>For the year ended</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["i. the principal amount and the interest due thereon remaining unpaid to any supplier as at the end of each accounting year", "12.07", "26.05"],
                  ["ii. the amount of interest paid by the buyer of Section 16, along with the amounts payment made to the supplier beyond the appointment day during each accounting year.", "-", "-"],
                  ["iii. the amount of interest due and payable for the period of delay in making payment (which has been paid but beyond the appointment day during the year) but without adding interest specified under MSMED Act, 2006.", "-", "-"],
                  ["iv. the amount of interest accrued and remaining unpaid at the end of each accounting year: and", "5.55", "5.01"],
                  ["v. the amount of further interest remaining due and payable even in succeeding years, until such date when the interest dues as above are actually paid to the small enterprises, for the purpose of disallowance as a deductible expenditure under Section 23.", "-", "-"],
                ].map(([label, sep, mar25], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-sm">{label}</td>
                    <td className="text-right px-2">{sep}</td>
                    <td className="text-right px-2">{mar25}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 38 ───────────────────────────────────────────────────────────────────
  if (effectiveNotePoint === "38") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">38.</h2>
          <p className="text-sm">
            All loans, guarantees, investments and securities as disclosed in respective notes are provided for business purposes.
          </p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 39 ───────────────────────────────────────────────────────────────────
  if (effectiveNotePoint === "39") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">39.</h2>
          <p className="text-sm">
            In the opinion of the Board of Directors, current assets, loans and advances have a value on realization in the ordinary course of business at least equal to the amount at which they are stated in the balance sheet and provisions for all known/expected liabilities have been made.
          </p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 40 – INVESTMENT INCLUDES ────────────────────────────────────────────
  if (effectiveNotePoint === "40") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">40. Investment includes:</h2>

          <p className="text-sm mb-4">
            i). Investment of ₹ Nil (March 31, 2025: Nil, March 31, 2024: ₹ 203.00 millions) In series C debenture of Best View Infracon Limited. In terms of the Debenture Trust deed agreement, the Company is entitled to redemption premium subject to a maximum XIRR of 22% subject to availability of revenue generated by the Company after payment of taxes, construction and other related expenditure and other designated payments. In view of the uncertainty involved in the quantum of net revenue being generated, the Company was accordingly not recording the premium /interest income upto the end of the March 31, 2024. In year ended march 31, 2025, the debentures along with the outstanding interest was converted into Preference share.
          </p>
          <p className="text-sm mb-6">
            ii). Investment of ₹ Nil (March 31, 2025: ₹ 112.81 millions, March 31, 2024: ₹ 305.36 millions) In series B unsecured optionally convertible debentures (OCDs) of XYZ Green Park Infrastructure Limited. In terms of the Debenture Trust deed agreement, the Company is entitled to interest and shall be calculated at 16% IRR and are redeemable at 22% IRR subject to the availability of distributable cash. These debentures are redeemable after 6 years and 6 months. If the outstanding OCDs can't be redeemed in full then the promotors OCDs will be converted into equity shares of the Company, at a price which shall not be less than the fair market value of the equity shares at the time of such conversion.
          </p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 41 – CORPORATE SOCIAL RESPONSIBILITY (CSR) ──────────────────────────
  if (effectiveNotePoint === "41") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">41. CORPORATE SOCIAL RESPONSIBILITY (CSR)</h2>

          <p className="text-sm mb-4">
            As per section 135 of the Companies Act, 2013 read with relevant rules thereon, for FY 2025-26 the Company was required to spend ₹ 1 million (March 31, 2025: ₹9.62 million, March 31 2024: ₹ 6.99 million) on Corporate Social Responsibility (CSR) activities. The same has been approved by the Board to be spent during the year.
          </p>
          <p className="text-sm mb-4 font-medium">Amount spent during the year on:</p>

          {/* September 30, 2025 */}
          <p className="text-sm font-semibold mb-2">As at September 30, 2025</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-right py-2 px-2">Amount Spent in Cash</th>
                  <th className="text-right py-2 px-2">Amount yet to be paid/(excess) paid in Cash</th>
                  <th className="text-right py-2 px-2">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">(i) Construction/acquisition of any asset</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">(ii) On purposes other than (i) above</td>
                  <td className="text-right px-2">3.85</td>
                  <td className="text-right px-2">24.87</td>
                  <td className="text-right px-2 font-semibold">28.71</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Protection of flora and fauna, maintenance of ecological balance</td>
                  <td className="text-right px-2">1.70</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2 font-semibold">1.70</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Livelihood enhancement</td>
                  <td className="text-right px-2">1.90</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2 font-semibold">1.90</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Promoting health care</td>
                  <td className="text-right px-2">0.25</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2 font-semibold">0.25</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Unspent Corporate Social Responsibility Account</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">24.87</td>
                  <td className="text-right px-2 font-semibold">24.87</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* March 31, 2025 */}
          <p className="text-sm font-semibold mb-2">As at March 31, 2025</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-right py-2 px-2">Amount Spent in Cash</th>
                  <th className="text-right py-2 px-2">Amount yet to be paid/(excess) paid in Cash</th>
                  <th className="text-right py-2 px-2">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">(i) Construction/acquisition of any asset</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2">(ii) On purposes other than (i) above</td>
                  <td className="text-right px-2">2.13</td>
                  <td className="text-right px-2">15.48</td>
                  <td className="text-right px-2 font-semibold">17.61</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Protection of flora and fauna, maintenance of ecological balance</td>
                  <td className="text-right px-2">0.02</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2 font-semibold">0.02</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Livelihood enhancement</td>
                  <td className="text-right px-2">1.51</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2 font-semibold">1.51</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Promoting health care</td>
                  <td className="text-right px-2">0.60</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2 font-semibold">0.60</td>
                </tr>
                <tr className="border-b border-gray-100 italic">
                  <td className="py-1 px-2 pl-6">Unspent Corporate Social Responsibility Account</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">15.48</td>
                  <td className="text-right px-2 font-semibold">15.48</td>
                </tr>
              </tbody>
            </table>
          </div>


          {/* Unspent CSR Details Table */}
          <p className="text-sm mb-3">
            Details of Unspent Corporate Social Responsibility on ongoing projects as required under section 135(6) are disclosed below :-
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Balance as at Preceding financial year(s)</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>With the Company / In Separate CSR Unspent Account *</th>
                  <th className="text-right py-2 px-2" rowSpan={2}>Amount required to be spent during the year</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>Amount spent during the year</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>Balance as at March 31, 2025</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">With the Company</th>
                  <th className="text-right py-1 px-2">In Separate CSR Unspent Account *</th>
                  <th className="text-right py-1 px-2">From the Company's Bank Account</th>
                  <th className="text-right py-1 px-2">From Separate CSR Unspent Account</th>
                  <th className="text-right py-1 px-2">With the Company</th>
                  <th className="text-right py-1 px-2">In Separate CSR Unspent Account *</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Sept-25", "-", "11.34", "17.38", "1.90", "1.95", "15.48", "9.38"],
                  ["2024-25", "-", "6.82", "9.62", "2.13", "2.97", "7.49", "3.85"],
                  ["2023-24", "-", "6.82", "-", "-", "-", "6.82", "-"],
                  ["2022-23", "-", "1.78", "-", "-", "1.78", "-", "-"],
                ].map(([yr, wc, sep, req, fb, fsp, bc, bsp], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2">{yr}</td>
                    <td className="text-right px-2">{wc}</td>
                    <td className="text-right px-2">{sep}</td>
                    <td className="text-right px-2">{req}</td>
                    <td className="text-right px-2">{fb}</td>
                    <td className="text-right px-2">{fsp}</td>
                    <td className="text-right px-2">{bc}</td>
                    <td className="text-right px-2">{bsp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm italic text-red-600">* The unspent CSR amount (including excess provisioning of Rs. 0.015 million) of the financial year of FY 2024-25 shall be transferred to the Unspent CSR Account as per Section 135(6) of the Companies Act within 30 days of the reporting date.</p>
          <p className="text-sm italic text-red-600">* In FY 23-24 amount of Rs. 0.01 million is tranferred to PM cares fund due to shortfall in transferring amount to Unspent CSR Account as per Section 135(6) of Companies Act, 2013</p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 42 – FINANCIAL INSTRUMENTS ──────────────────────────────────────────
  if (effectiveNotePoint === "42") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">42. FINANCIAL INSTRUMENTS</h2>

          {/* (a) Financial instruments by category */}
          <p className="font-semibold mb-3">(a) Financial instruments by category</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>For the year ended</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200 font-semibold bg-gray-50">
                  <td className="py-2 px-2">Financial assets</td>
                  <td colSpan={2}></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-4 font-medium">i. FVTOCI</td>
                  <td colSpan={2}></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-8">Investments in equity share instruments</td>
                  <td className="text-right px-2">948.41</td>
                  <td className="text-right px-2">942.30</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-4 font-medium">ii. FVTPL</td>
                  <td colSpan={2}></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-8">Investments in preference share instruments</td>
                  <td className="text-right px-2">2,345.70</td>
                  <td className="text-right px-2">2,345.70</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-8">Investments in mutual fund</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-4 font-medium">iii. Amortized cost</td>
                  <td colSpan={2}></td>
                </tr>
                {[
                  ["Investments in Bonds/Debentures", "-", "112.81"],
                  ["Trade receivables", "146.77", "138.58"],
                  ["Loans", "28.31", "27.09"],
                  ["Cash and cash equivalents", "44.34", "161.37"],
                  ["Other bank balances", "643.12", "706.93"],
                  ["Other financial assets", "816.36", "441.50"],
                ].map(([label, s, m25], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 pl-8">{label}</td>
                    <td className="text-right px-2">{s}</td>
                    <td className="text-right px-2">{m25}</td>
                  </tr>
                ))}
                <tr className="border-b border-gray-300 font-semibold">
                  <td className="py-2 px-2">Total financial assets</td>
                  <td className="text-right px-2">4,973.02</td>
                  <td className="text-right px-2">4,876.29</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 px-2 font-medium">Amortized Cost</td>
                  <td colSpan={2}></td>
                </tr>
                <tr className="border-b border-gray-200 font-semibold bg-gray-50">
                  <td className="py-2 px-2">Financial liabilities</td>
                  <td colSpan={2}></td>
                </tr>
                {[
                  ["Borrowings", "4,808.61", "5,120.30"],
                  ["Trade payables", "135.85", "129.10"],
                  ["Other financial liabilities", "126.87", "124.13"],
                ].map(([label, s, m25], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 pl-8">{label}</td>
                    <td className="text-right px-2">{s}</td>
                    <td className="text-right px-2">{m25}</td>
                  </tr>
                ))}
                <tr className="border-b border-gray-300 font-semibold">
                  <td className="py-2 px-2">Total financial liabilities</td>
                  <td className="text-right px-2">5,071.33</td>
                  <td className="text-right px-2">5,373.53</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm mb-6">
            Investment of ₹ 907.39 millions (March 31, 2025: ₹ 907.39, March 31, 2024: ₹ 991.16 millions) in subsidiaries and associates are measured at cost as per Ind AS 27, 'Separate Financial Statements' and are not required to be disclosed here.
          </p>

          {/* (b) Fair value hierarchy */}
          <p className="font-semibold mb-2">(b) Fair value hierarchy</p>
          <p className="text-sm mb-2">Financial instruments are classified into three levels in order to provide an indication about the reliability of the inputs used in determining the fair values.</p>
          <p className="text-sm mb-1"><span className="underline">The categories used are as follows:</span></p>
          <p className="text-sm mb-1">Level 1: Where fair value is based on quoted prices from active market.</p>
          <p className="text-sm mb-1">Level 2: Where fair value is based on significant direct or indirect observable market inputs.</p>
          <p className="text-sm mb-4">Level 3: Where fair value is based on one or more significant input that is not based on observable market data.</p>

          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-right py-2 px-2">Level 1</th>
                  <th className="text-right py-2 px-2">Level 2</th>
                  <th className="text-right py-2 px-2">Level 3</th>
                  <th className="text-right py-2 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "As at September 30, 2025", isHeader: true },
                  { label: "Investments in equity share instruments", l1: "41.02", l2: "-", l3: "907.39", total: "948.41" },
                  { label: "Investments in preference share instruments", l1: "-", l2: "-", l3: "2,345.70", total: "2,345.70" },
                  { label: "Investments in mutual fund", l1: "-", l2: "-", l3: "-", total: "-" },
                  { label: "As at March 31, 2025", isHeader: true },
                  { label: "Investments in equity share instruments", l1: "34.91", l2: "-", l3: "907.39", total: "942.30" },
                  { label: "Investments in preference share instruments", l1: "-", l2: "-", l3: "2,345.70", total: "2,345.70" },
                  { label: "Investments in mutual fund", l1: "-", l2: "-", l3: "-", total: "-" },
                ].map((row, i) =>
                  row.isHeader ? (
                    <tr key={i} className="border-b border-gray-200 bg-gray-50">
                      <td className="py-2 px-2 font-semibold" colSpan={5}>{row.label}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 px-2 pl-6">{row.label}</td>
                      <td className="text-right px-2">{row.l1}</td>
                      <td className="text-right px-2">{row.l2}</td>
                      <td className="text-right px-2">{row.l3}</td>
                      <td className="text-right px-2 font-semibold">{row.total}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <p className="text-sm italic mb-6">There are no transfers between any levels during the year.</p>

          {/* (c) Fair value of financial instruments measured at amortized cost */}
          <p className="font-semibold mb-2">(c) Fair value of financial instruments measured at amortized cost :</p>
          <p className="text-sm mb-6">
            The carrying amounts of the financial instruments measured at amortized cost, disclosed in note (a) above, approximate to their fair values. Accordingly, the fair values of such instruments have not been disclosed separately.
          </p>

          {/* (d) Valuation techniques */}
          <p className="font-semibold mb-2">(d) Valuation techniques and processes used to determine fair value :</p>
          <p className="text-sm mb-6">Fair value of quoted investments is based on the quotation as at the reporting date.</p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 43 – FINANCIAL RISK MANAGEMENT ──────────────────────────────────────
  if (effectiveNotePoint === "43") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">43. FINANCIAL RISK MANAGEMENT OBJECTIVE AND POLICIES</h2>
          <p className="text-sm mb-2">The Company's principal financial instruments are as follows:</p>
          <p className="text-sm mb-1"><span className="font-semibold underline">Financial assets:</span> Investments, Cash and bank balance, Loans, Trade and other receivables</p>
          <p className="text-sm mb-4"><span className="font-semibold underline">Financial liabilities:</span> Borrowings, Trade and other payables.</p>

          {/* A. Credit Risk */}
          <p className="font-semibold mb-2">A. Credit risk</p>
          <p className="text-sm mb-4">
            Credit risk is the risk that a counterparty fails to discharge its obligation to the Company. The Company's exposure to credit risk is influenced mainly by cash and cash equivalents, trade receivables and financial assets measured at amortised cost. The Company continuously monitors defaults of customers and other counterparties and incorporates this information into its credit risk controls.
          </p>

          <p className="font-semibold italic mb-2 underline">A.1. Trade and Other Receivables</p>
          <p className="text-sm mb-3">
            The Company operates as a Real Estate developer primarily covering residential and commercial projects, and others at various locations. Trade receivables are contractual amounts due from these customers for after works completion. Trade receivables are non-interest bearing and are generally on 30 to 45 days credit, depending upon contractual terms. The management evaluates the outstanding receivables on a periodic basis and provides for the impairment loss based on the established policy.
          </p>
          <p className="text-sm mb-3">
            The Company follows a 'simplified approach' (i.e. based on lifetime ECL) for recognition of impairment loss allowance on its trade receivables. For the purpose of measuring lifetime ECL allowance for trade receivables, the Company estimates irrecoverable amounts based on the ageing of the receivable balances, clubbed with, historical experience with the customer and/or the industry in which the customer operates and assessment of litigation, if applicable. Receivables are written off when they are no more deemed collectible.
          </p>
          <p className="text-sm mb-4">
            Though the Company executes projects with repeat customers but there is no significant customer level concentration of the credit risk as at any of the reported periods. Further, there is no concentrated risk based on the location where the Company operates.
          </p>

          <p className="font-semibold italic mb-2 underline">A.2. Other financial assets</p>
          <p className="text-sm mb-3">
            Loans and receivable from related parties are periodically reviewed by the management in conjunction with the re-measured fair values of the Company's investments in those parties. Where the carrying amount of any receivable exceeds the re-measured fair value of investment, an impairment loss, to that extent, is provided for in the financial statements.
          </p>
          <p className="text-sm mb-3">
            Cash and bank balances are managed by the Company's treasury department. Concentration risk is constantly monitored to mitigate financial loss.
          </p>
          <p className="text-sm mb-4">
            The Company's maximum exposure to credit risk for the components of the financial assets as at September 31, 2025 and March 31, 2025 is to the extent of their respective carrying amounts as disclosed in note 10.
          </p>

          <p className="font-semibold italic mb-2 underline">A.3. Credit exposure</p>
          <p className="text-sm mb-3">The Company provides for 12 month expected credit losses for following financial assets:</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-right py-2 px-2">Estimated gross carrying</th>
                  <th className="text-right py-2 px-2">% of Expected credit loss</th>
                  <th className="text-right py-2 px-2">Expected credit losses</th>
                  <th className="text-right py-2 px-2">Net Carrying amount</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "As at September 30, 2025", isHeader: true },
                  ["Investments", "3,294.12", "-", "-", "3,294.12"],
                  ["Trade receivables", "146.77", "-", "-", "146.77"],
                  ["Loans", "28.31", "-", "-", "28.31"],
                  ["Cash and cash equivalents", "44.34", "-", "-", "44.34"],
                  ["Other bank balances", "643.12", "-", "-", "643.12"],
                  ["Other financial assets", "816.36", "-", "-", "816.36"],
                  { label: "Total", bold: true, vals: ["4,973.02", "-", "-", "4,973.02"] },
                  { label: "As at March 31, 2025", isHeader: true },
                  ["Investments", "3,400.82", "-", "-", "3,400.82"],
                  ["Trade receivables", "138.58", "-", "-", "138.58"],
                  ["Loans", "27.09", "-", "-", "27.09"],
                  ["Cash and cash equivalents", "161.37", "-", "-", "161.37"],
                  ["Other bank balances", "706.93", "-", "-", "706.93"],
                  ["Other financial assets", "441.50", "-", "-", "441.50"],
                  { label: "Total", bold: true, vals: ["4,876.29", "-", "-", "4,876.29"] },
                ].map((row, i) => {
                  if (row.isHeader) return (
                    <tr key={i} className="border-b border-gray-200 bg-gray-50">
                      <td className="py-2 px-2 font-semibold" colSpan={5}>{row.label}</td>
                    </tr>
                  );
                  if (row.bold) return (
                    <tr key={i} className="border-b border-gray-300 font-semibold">
                      <td className="py-1 px-2">{row.label}</td>
                      {row.vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                    </tr>
                  );
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 px-2 pl-6">{row[0]}</td>
                      <td className="text-right px-2">{row[1]}</td>
                      <td className="text-right px-2">{row[2]}</td>
                      <td className="text-right px-2">{row[3]}</td>
                      <td className="text-right px-2">{row[4]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* B. Liquidity Risk */}
          <p className="font-semibold mb-2">B. Liquidity risk</p>
          <p className="text-sm mb-4">
            Liquidity risk is the risk that the Company may not be able to meet its present and future cash and collateral obligations without incurring unacceptable losses. The Company's objective is to maintain optimum levels of liquidity to meet its cash and collateral requirements, both immediate and long-term. The finance needs are monitored and managed by the Company's treasury department, in consultation with the project teams and management. The Company takes support from its secured lenders to finance and support the Company's operations.
          </p>

          <p className="font-semibold mb-1 underline">Maturities of financial liabilities</p>
          <p className="text-sm mb-3">The tables below analyse the financial liabilities into relevant maturity pattern based on their contractual maturities.</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-right py-2 px-2">Less than 1 Year</th>
                  <th className="text-right py-2 px-2">1 - 2 years</th>
                  <th className="text-right py-2 px-2">2 - 5 years</th>
                  <th className="text-right py-2 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "As at September 30, 2025", isHeader: true },
                  ["Long term borrowings", "-", "24.29", "-", "24.29"],
                  ["Short term borrowings", "4,784.31", "-", "-", "4,784.31"],
                  ["Trade Payables", "135.85", "-", "-", "135.85"],
                  ["Other Financial Liabilities", "126.87", "-", "-", "126.87"],
                  { label: "Total", bold: true, vals: ["5,047.04", "24.29", "-", "5,071.33"] },
                  { label: "As at March 31, 2025", isHeader: true },
                  ["Long term borrowings", "-", "458.77", "-", "458.77"],
                  ["Short term borrowings", "4,661.53", "-", "-", "4,661.53"],
                  ["Trade Payables", "129.10", "-", "-", "129.10"],
                  ["Other Financial Liabilities", "124.13", "-", "-", "124.13"],
                  { label: "Total", bold: true, vals: ["4,914.76", "458.77", "-", "5,373.53"] },
                ].map((row, i) => {
                  if (row.isHeader) return (
                    <tr key={i} className="border-b border-gray-200 bg-gray-50">
                      <td className="py-2 px-2 font-semibold" colSpan={5}>{row.label}</td>
                    </tr>
                  );
                  if (row.bold) return (
                    <tr key={i} className="border-b border-gray-300 font-semibold">
                      <td className="py-1 px-2">{row.label}</td>
                      {row.vals.map((v, j) => <td key={j} className="text-right px-2">{v}</td>)}
                    </tr>
                  );
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 px-2 pl-6">{row[0]}</td>
                      <td className="text-right px-2">{row[1]}</td>
                      <td className="text-right px-2">{row[2]}</td>
                      <td className="text-right px-2">{row[3]}</td>
                      <td className="text-right px-2">{row[4]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* C. Market Risk */}
          <p className="font-semibold mb-2">C. Market risk</p>

          <p className="font-semibold italic mb-2 underline">C.1. Interest Rate risk</p>
          <p className="text-sm mb-3">
            The Company's policy is to minimise interest rate cash flow risk exposures on long-term financing. The Company is exposed to changes in market interest rates through bank borrowings at variable interest rates. Other borrowings are at fixed interest rates.
          </p>

          <p className="text-sm font-semibold mb-2 underline">Company's exposure to interest rate risk on borrowings is as follows:</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>As at year ended</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th></th>
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Variable rate", "332.98", "787.98"],
                  ["Fixed rate", "4,475.62", "4,345.44"],
                ].map(([label, s, m25], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2">{label}</td>
                    <td className="text-right px-2">{s}</td>
                    <td className="text-right px-2">{m25}</td>
                  </tr>
                ))}
                <tr className="border-b border-gray-300 font-semibold">
                  <td className="py-2 px-2">Total:</td>
                  <td className="text-right px-2">4,808.61</td>
                  <td className="text-right px-2">5,133.42</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm mb-4">
            The following table illustrates the sensitivity of profit and equity to a possible change in interest rates of ± 1% (March 31, 2025: ± 1%). These changes are considered to be reasonably possible based on observation of current market conditions. The calculations are based on a change in the average market interest rate for each period, and the financial instruments held at each reporting date that are sensitive to changes in interest rates. All other variables are held constant.
          </p>

          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Particulars</th>
                  <th className="text-right py-2 px-2">Profit for the year If - 1%</th>
                  <th className="text-right py-2 px-2">Loss for the year if + 1%</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["As at September 30, 2025", "3.33", "(3.33)"],
                  ["As at March 31, 2025", "7.88", "(7.88)"],
                ].map(([label, p, l], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2">{label}</td>
                    <td className="text-right px-2">{p}</td>
                    <td className="text-right px-2">{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm mb-6">
            The Company does not account for any fixed rate financial assets and liabilities at fair value through profit or loss. Therefore, a change in interest rates at the reporting date would not affect profit or loss.
          </p>

          <p className="font-semibold italic mb-2 underline">C.2. Other price risk</p>
          <p className="text-sm mb-6">
            Company's exposure to equity securities price risk arises from quoted investments held and classified in the balance sheet as fair value through OCI. Company's exposure is insignificant, since Company's investment in such securities is immaterial.
          </p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 44 – CAPITAL MANAGEMENT ─────────────────────────────────────────────
  if (effectiveNotePoint === "44") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">44. CAPITAL MANAGEMENT</h2>

          <p className="text-sm mb-3">
            The Company's capital management objectives are to ensure the Company's ability to continue as a going concern as well as to provide an adequate return to shareholders by pricing products and services commensurately with the level of risk.
          </p>
          <p className="text-sm mb-3">
            The Company monitors capital on the basis of the carrying amount of equity plus its subordinated loan, less cash and cash equivalents as presented on the face of the statement of financial position.
          </p>
          <p className="text-sm mb-4">
            The Company manages its capital structure and makes adjustments to it in the light of changes in economic conditions and the risk characteristics of the underlying assets. In order to maintain or adjust the capital structure, the Company may adjust the amount of dividends paid to shareholders, return capital to shareholders or issue new shares. The amounts managed as capital by the Company are summarised as follows:
          </p>

          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2" rowSpan={2}>Particulars</th>
                  <th className="text-center py-1 px-2 border-b" colSpan={2}>For the year ended</th>
                </tr>
                <tr className="border-b bg-gray-50">
                  <th className="text-right py-1 px-2">September 30, 2025</th>
                  <th className="text-right py-1 px-2">March 31, 2025</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-2 px-2 font-semibold">Borrowings</td>
                  <td colSpan={2}></td>
                </tr>
                {[
                  ["Long term borrowings", "24.29", "458.77"],
                  ["Short term borrowings", "4,784.31", "4,661.53"],
                  ["Less: Cash and cash equivalents", "44.34", "(161.37)"],
                ].map(([label, s, m25], i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 pl-8">{label}</td>
                    <td className="text-right px-2">{s}</td>
                    <td className="text-right px-2">{m25}</td>
                  </tr>
                ))}
                {[
                  ["Net debt", "4,852.95", "4,958.94"],
                  ["Equity", "6,578.39", "6,505.16"],
                  ["Gearing ratio (%)", "73.77%", "76.23%"],
                ].map(([label, s, m25], i) => (
                  <tr key={i} className="border-b border-gray-200 font-semibold">
                    <td className="py-2 px-2">{label}</td>
                    <td className="text-right px-2">{s}</td>
                    <td className="text-right px-2">{m25}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }
  // ── NOTE 45 – RATIO ANALYSIS ──────────────────────────────────────────────────
  if (effectiveNotePoint === "45") {
    const ratioData = [
      {
        particular: "Current ratio",
        numerator: "Total current assets",
        denominator: "Total current liabilities",
        sep: "1.08", mar25: "1.05", mar24: "1.15",
        varSep: "0.03", varMar: "(9.01%)",
        reason: "#",
      },
      {
        particular: "Debt-Equity ratio (in times)",
        numerator: "Debt Consists Long Term Borrowing, Lease Liability (Non-current & current) and current maturities",
        denominator: "Total equity",
        sep: "0.73", mar25: "0.79", mar24: "0.53",
        varSep: "-7.13%", varMar: "49.87%",
        reason: "Company has borrowed money in the current financial year which has resulted into increase in the Debt Equity ratio.",
      },
      {
        particular: "Debt service coverage ratio (in times)",
        numerator: "Earning before Interest, Tax and Depreciation",
        denominator: "Debt service = Interest and lease payments + Principal repayments",
        sep: "0.48", mar25: "2.12", mar24: "2.36",
        varSep: "-", varMar: "-9.98%",
        reason: "#",
      },
      {
        particular: "Return on equity ratio (in %)",
        numerator: "Profit for the year less Preference dividend (if any)",
        denominator: "Average total equity",
        sep: "0.31%", mar25: "19.19%", mar24: "10.17%",
        varSep: "-", varMar: "88.72%",
        reason: "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio.",
      },
      {
        particular: "Inventory turnover ratio (in times)",
        numerator: "Revenue from Sale of Product",
        denominator: "Average inventory",
        sep: "0.07", mar25: "0.29", mar24: "0.44",
        varSep: "-", varMar: "(33.46%)",
        reason: "The decline is primarily due to an increase in average inventory levels maintained as the company has brought land for the upcoming projects.",
      },
      {
        particular: "Trade receivables turnover ratio (in times)",
        numerator: "Revenue from Sale of Product",
        denominator: "Average trade receivables",
        sep: "2.44", mar25: "10.23", mar24: "15.46",
        varSep: "-", varMar: "(33.82%)",
        reason: "Increase in other income has resulted into higher Trade receivable in the reported period which has resulted into detoriation in ratio in the reported period.",
      },
      {
        particular: "Trade payables turnover ratio (in times)",
        numerator: "Purchases",
        denominator: "Average trade payables",
        sep: "7.19", mar25: "18.84", mar24: "15.14",
        varSep: "-", varMar: "24.45%",
        reason: "#",
      },
      {
        particular: "Net capital turnover ratio (in times)",
        numerator: "Revenue from Sale of Product",
        denominator: "Working Capital = Total Current Asset - Total Current Liability",
        sep: "0.64", mar25: "4.02", mar24: "4.42",
        varSep: "-", varMar: "(8.95%)",
        reason: "#",
      },
      {
        particular: "Net profit ratio (in %)",
        numerator: "Total Comprehensive Income for the year",
        denominator: "Revenue from operations",
        sep: "24.10%", mar25: "93.77%", mar24: "46.49%",
        varSep: "-", varMar: "101.71%",
        reason: "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio.",
      },
      {
        particular: "Return on capital employed (in %)",
        numerator: "Earning before Interest and Tax",
        denominator: "Average Capital Employed = Tangible Net Worth + Total Debt + Deferred Tax Laibility",
        sep: "1.89%", mar25: "11.35%", mar24: "10.98%",
        varSep: "-", varMar: "3.34%",
        reason: "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio.",
      },
      {
        particular: "Return on investment (in %)",
        numerator: "Earning After Tax",
        denominator: "Total Assets",
        sep: "0.58%", mar25: "8.46%", mar24: "5.45%",
        varSep: "-", varMar: "55.17%",
        reason: "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio.",
      },
    ];

    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">45. RATIO ANALYSIS</h2>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2 w-32">Particulars</th>
                  <th className="text-left py-2 px-2 w-40">Numerator</th>
                  <th className="text-left py-2 px-2 w-40">Denominator</th>
                  <th className="text-right py-2 px-2">September 30, 2025</th>
                  <th className="text-right py-2 px-2">March 31, 2025</th>
                  <th className="text-right py-2 px-2">March 31, 2024</th>
                  <th className="text-right py-2 px-2">Variance (Sep. 25)*%</th>
                  <th className="text-right py-2 px-2">Variance (March 25)*%</th>
                  <th className="text-left py-2 px-2">Reasons for Variances</th>
                </tr>
              </thead>
              <tbody>
                {ratioData.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 align-top">
                    <td className="py-2 px-2 font-medium">{row.particular}</td>
                    <td className="py-2 px-2 text-gray-600">{row.numerator}</td>
                    <td className="py-2 px-2 text-gray-600">{row.denominator}</td>
                    <td className="text-right px-2 py-2">{row.sep}</td>
                    <td className="text-right px-2 py-2">{row.mar25}</td>
                    <td className="text-right px-2 py-2">{row.mar24}</td>
                    <td className="text-right px-2 py-2">{row.varSep}</td>
                    <td className="text-right px-2 py-2">{row.varMar}</td>
                    <td className="py-2 px-2 text-gray-600">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm italic text-red-600">*Variance not more than 25%</p>
          <p className="text-sm italic text-red-600">** Variance in realtion to earnings, expenses and profit for six months period ended 30th September, 2025 is not computed as the numbers for corresponding period in the previous year are not available.</p>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 46 – OTHER STATUTORY INFORMATION ────────────────────────────────────
  if (effectiveNotePoint === "46") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">46. OTHER STATUTORY INFORMATION</h2>
          <div className="space-y-3 text-sm">
            <p>(i) The Company has not traded or invested in Crypto currency or Virtual Currency during the financial year.</p>
            <p>(ii) The Company has not been declared wilful defaulter by any bank or financial institution or government or any government authority.</p>
            <p>(iii) The Company has not any such transaction which is not recorded in the books of accounts that has been surrendered or disclosed as income during the year in the tax assessments under the Income Tax Act, 1961 (such as, search or survey or any other relevant provisions of the Income Tax Act, 1961).</p>
            <p>(iv) The Company do not have any transactions with struck-off companies.</p>
            <p>(v) The Company does not have any Benami Property, where any proceedings has been initiated or pending against the company for holding any benami property.</p>
            <p>(vi) The Company has not advanced or loaned or invested funds to any other person(s) or entity(ies), including foreign entities (Intermediaries) with the understanding that the Intermediary shall:</p>
            <p className="pl-6">(a) directly or indirectly lend or invest in other persons or entities identified in any manner whatsoever by or on behalf of the company (Ultimate Beneficiaries) or</p>
            <p className="pl-6">(b) provide any guarantee, security or the like to or on behalf of the Ultimate Beneficiaries</p>
            <p>(vii) The Company has not received any fund from any person(s) or entity(ies), including foreign entities (Funding Party) with the understanding (whether recorded in writing or otherwise) that the Company shall:</p>
            <p className="pl-6">(a) directly or indirectly lend or invest in other persons or entities identified in any manner whatsoever by or on behalf of the Funding Party (Ultimate Beneficiaries) or</p>
            <p className="pl-6">(b) provide any guarantee, security or the like on behalf of the Ultimate Beneficiaries.</p>
          </div>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 47 ───────────────────────────────────────────────────────────────────
  if (effectiveNotePoint === "47") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">47.</h2>
          <p className="text-sm">
            Cash and Cash Equivalents and Bank Balances includes balances in Escrow Account which shall be used only for specified purposes as defined under Real Estate (Regulation and Development) Act, 2016.
          </p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── NOTE 48 ───────────────────────────────────────────────────────────────────
  if (effectiveNotePoint === "48") {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20" style={{ overflowY: "auto" }}>
        <GoBackButton />
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-4">48.</h2>
          <p className="text-sm mb-8">
            The figures for the previous year have been regrouped/ reclassified to correspond with current year's classification/ disclosures.
          </p>

          <div className="border-t pt-6 text-sm">
            <p className="mb-4">As per our report of even date</p>
            <div className="grid grid-cols-2 gap-8 mb-6">
              <div>
                <p className="font-semibold">for Agarwal & Saxena</p>
                <p>Chartered Accountants</p>
                <p>Firm Registration No.: 002405C</p>
              </div>
              <div>
                <p>for and on behalf of Board of Directors</p>
                <p className="font-semibold">XYZ Infrastructure & Properties Limited</p>
                <p>CIN: U74899HR2000PLC043893</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-6">
              <div>
                <p className="font-semibold">Akshay Sethi</p>
                <p>Partner</p>
                <p>Membership No.: 539439</p>
              </div>
              <div>
                <p className="font-semibold">Pankaj Bajaj</p>
                <p>Managing Director</p>
                <p>DIN: 00024735</p>
              </div>
              <div>
                <p className="font-semibold">Ranjit Khattar</p>
                <p>Director</p>
                <p>DIN: 00726997</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div>
                <p>Place: New Delhi</p>
                <p>Date: {new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}</p>
              </div>
              <div>
                <p className="font-semibold">Rajiv Khurana</p>
                <p>Chief Financial Officer</p>
                <p>ACA M.No.: 093132</p>
              </div>
              <div>
                <p className="font-semibold">Swati Gupta</p>
                <p>Company Secretary</p>
                <p>ACS M.No.: A35294</p>
              </div>
            </div>
          </div>

          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── PLACEHOLDER for notes 37-48 ──────────────────────────────────────────────
  const placeholderNotes = [];
  if (placeholderNotes.includes(String(effectiveNotePoint))) {
    const noteTitles = {
      "29": "Segment Reporting", "30": "Interest In Other Entities", "31": "Related Party Disclosures",
      "32": "Contingent Liabilities", "33": "Leases", "34": "Expenditure In Foreign Currency (On Accrual Basis)",
      "35": "Capital And Other Commitments", "36": "", "37": "Disclosure Under The Micro, Small And Medium Enterprises Development Act, 2006",
      "38": "", "39": "", "40": "Investment Includes", "41": "Corporate Social Responsibility (CSR)",
      "42": "Financial Instruments", "43": "Financial Risk Management Objective And Policies",
      "44": "Capital Management", "45": "Ratio Analysis", "46": "Other Statutory Information", "47": "", "48": "",
    };
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20">
        <GoBackButton />
        <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-md p-8">
          <h2 className="text-xl font-bold mb-6">{effectiveNotePoint}. {noteTitles[effectiveNotePoint] ?? ""}</h2>
          <p className="text-gray-500 italic">Content coming soon.</p>
          <NavButtons />
          {loading && <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>}
        </div>
      </div>
    );
  }


  // ── ORIGINAL DYNAMIC NOTES ───────────────
  console.log("Received data for notes:", data);

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20">
      <GoBackButton />
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-md p-8">

        <h2 className="text-xl font-bold mb-4">
          {data.notePoint}. {data.title}
        </h2>


        <table className="w-full border-collapse">
          <thead>
            <tr>
              {/* <th className="text-left border-b pb-2">Particulars</th> */}
              <th className="text-right border-b pb-2">
                {/* {data.dates?.closing ?? "-"} */}
              </th>
              <th className="text-right border-b pb-2">
                {/* {data.dates?.opening ?? "-"} */}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ========= NOTE 6b ========= */}
            {(data.notePoint === "6(b)" || data.notePoint === "10(a)") && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.particulars.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.closing}</td>
                    <td className="text-right">{item.opening}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.totalClosing}</td>
                  <td className="text-right">{data.totalOpening}</td>
                </tr>
              </>
            )}

            {/* ========= NOTE 8 ========= */}
            {data.notePoint === "8" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="font-medium">
                    Advances other than capital advances – Unsecured
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-4">(a). Advances to Related parties*</td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-8">Advance to subsidiary companies</td>
                  <td className="text-right">
                    {data.sections.relatedParties.subsidiary.closing || "-"}
                  </td>
                  <td className="text-right">
                    {data.sections.relatedParties.subsidiary.opening || "-"}
                  </td>
                </tr>

                <tr>
                  <td className="pl-8">Advance to Other Parties</td>
                  <td className="text-right">
                    {data.sections.relatedParties.otherParties.closing || "-"}
                  </td>
                  <td className="text-right">
                    {data.sections.relatedParties.otherParties.opening || "-"}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">
                    (b). Parties other than related parties
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-8">Advances for Land</td>
                  <td className="text-right">
                    {data.sections.others.land.closing || "-"}
                  </td>
                  <td className="text-right">
                    {data.sections.others.land.opening || "-"}
                  </td>
                </tr>

                <tr>
                  <td className="pl-8">Advance to Other Parties.</td>
                  <td className="text-right">
                    {data.sections.others.otherParties.closing || "-"}
                  </td>
                  <td className="text-right">
                    {data.sections.others.otherParties.opening || "-"}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">
                    (c). Amount recoverable from government authorities:
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-8">Value Added Tax</td>
                  <td className="text-right">
                    {data.sections.government.vat.closing || "-"}
                  </td>
                  <td className="text-right">
                    {data.sections.government.vat.opening || "-"}
                  </td>
                </tr>

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totalClosing}</td>
                  <td className="text-right">{data.totalOpening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "10(b)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="py-2 font-medium">{data.sectionTitle}</td>
                  <td></td>
                  <td></td>
                </tr>

                {/* Only one summarized line */}
                <tr>
                  <td className="pl-6">- in current accounts</td>

                  <td className="text-right">{data.totals.closing}</td>

                  <td className="text-right">{data.totals.opening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "10(c)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="py-2 font-medium">{data.sectionTitle}</td>
                  <td></td>
                  <td></td>
                </tr>

                {data.lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="pl-6">{item.name}</td>
                    <td className="text-right">{item.closing}</td>
                    <td className="text-right">{item.opening}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals.closing}</td>
                  <td className="text-right">{data.totals.opening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "10(d)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.closing || "-"}</td>
                    <td className="text-right">{item.opening || "-"}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals.closing}</td>
                  <td className="text-right">{data.totals.opening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "11" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="py-2 font-medium">{data.sectionTitle}</td>
                  <td></td>
                  <td></td>
                </tr>

                {data.lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="pl-6">{item.name}</td>
                    <td className="text-right">{item.closing || "-"}</td>
                    <td className="text-right">{item.opening || "-"}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals.closing}</td>
                  <td className="text-right">{data.totals.opening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "13(a)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="font-medium">A. Non-Convertible Debentures</td>
                  <td className="text-right">
                    {data.sections?.debentures?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.sections?.debentures?.opening ?? 0}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">
                    Less: Unamortized ancillary borrowing cost
                  </td>
                  <td className="text-right">
                    ({data.sections?.ancillaryCost?.closing ?? 0})
                  </td>
                  <td className="text-right">
                    ({data.sections?.ancillaryCost?.opening ?? 0})
                  </td>
                </tr>

                <tr>
                  <td className="font-medium pt-4">B. Term Loan (secured)</td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-4">From banks - Non-current</td>
                  <td className="text-right">
                    {data.sections?.banks?.nonCurrent?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.sections?.banks?.nonCurrent?.opening ?? 0}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">From banks - Current</td>
                  <td className="text-right">
                    {data.sections?.banks?.current?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.sections?.banks?.current?.opening ?? 0}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">From NBFC - Non-current</td>
                  <td className="text-right">
                    {data.sections?.nbfc?.nonCurrent?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.sections?.nbfc?.nonCurrent?.opening ?? 0}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">From NBFC - Current</td>
                  <td className="text-right">
                    {data.sections?.nbfc?.current?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.sections?.nbfc?.current?.opening ?? 0}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">Less: Short Term Borrowings</td>
                  <td className="text-right">
                    ({data.sections?.shortTermAdj?.closing ?? 0})
                  </td>
                  <td className="text-right">
                    ({data.sections?.shortTermAdj?.opening ?? 0})
                  </td>
                </tr>

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals?.closing ?? 0}</td>
                  <td className="text-right">{data.totals?.opening ?? 0}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-sm italic pt-2 text-red-600">
                    Variance in Balance as per TB and Balance as per Notes to Accounts
                  </td>
                </tr>
              </>
            )}


            {data.notePoint === "14" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.particulars.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.closing}</td>
                    <td className="text-right">{item.opening}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totalClosing}</td>
                  <td className="text-right">{data.totalOpening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "15(a)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="font-medium">(A) Secured</td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-4">
                    Overdraft facilities (bank overdrafts)
                  </td>
                  <td className="text-right">
                    {data.sections.secured.overdraft.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.secured.overdraft.opening}
                  </td>
                </tr>

                <tr>
                  <td className="font-medium pt-4">(B) Unsecured</td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-4">Loans from related parties</td>
                  <td className="text-right">
                    {data.sections.unsecured.relatedPartyLoans.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.unsecured.relatedPartyLoans.opening}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">Loans from Director</td>
                  <td className="text-right">
                    {data.sections.unsecured.directorLoans.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.unsecured.directorLoans.opening}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">Loans from body corporates</td>
                  <td className="text-right">
                    {data.sections.unsecured.bodyCorporateLoans.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.unsecured.bodyCorporateLoans.opening}
                  </td>
                </tr>

                <tr>
                  <td className="font-medium pt-4">
                    (C) Current maturities of long-term borrowings
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                <tr>
                  <td className="pl-4">Debentures</td>
                  <td className="text-right">
                    {data.sections.currentMaturities.debentures.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.currentMaturities.debentures.opening}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">From Banks</td>
                  <td className="text-right">
                    {data.sections.currentMaturities.banks.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.currentMaturities.banks.opening}
                  </td>
                </tr>

                <tr>
                  <td className="pl-4">From NBFC</td>
                  <td className="text-right">
                    {data.sections.currentMaturities.nbfc.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.currentMaturities.nbfc.opening}
                  </td>
                </tr>

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals.closing}</td>
                  <td className="text-right">{data.totals.opening}</td>
                </tr>
              </>
            )}

            {data.notePoint === "15(b)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="font-medium">
                    Total outstanding dues of micro enterprises and small
                    enterprises
                  </td>
                  <td className="text-right">
                    {data.particulars[0]?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.particulars[0]?.opening ?? 0}
                  </td>
                </tr>

                <tr>
                  <td className="font-medium">
                    Total outstanding dues of creditors other than micro
                    enterprises and small enterprises
                  </td>
                  <td className="text-right">
                    {data.particulars[1]?.closing ?? 0}
                  </td>
                  <td className="text-right">
                    {data.particulars[1]?.opening ?? 0}
                  </td>
                </tr>

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals?.closing ?? 0}</td>
                  <td className="text-right">{data.totals?.opening ?? 0}</td>
                </tr>
              </>
            )}

            {data.notePoint === "15(c)" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.closing || "-"}</td>
                    <td className="text-right">{item.opening || "-"}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals?.closing ?? 0}</td>
                  <td className="text-right">{data.totals?.opening ?? 0}</td>
                </tr>
              </>
            )}

            {data.notePoint === "16" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.closing || "-"}</td>
                    <td className="text-right">{item.opening || "-"}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals?.closing ?? 0}</td>
                  <td className="text-right">{data.totals?.opening ?? 0}</td>
                </tr>
              </>
            )}

            {data.notePoint === "17" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>

                {data.lineItems.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.closing || "-"}</td>
                    <td className="text-right">{item.opening || "-"}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td>TOTAL</td>
                  <td className="text-right">{data.totals?.closing ?? 0}</td>
                  <td className="text-right">{data.totals?.opening ?? 0}</td>
                </tr>
              </>
            )}

            {data.notePoint === "18" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="py-2">
                    (a). Revenue from constructed properties
                  </td>
                  <td className="text-right">
                    {data.sections.revenueFromProperties.value}
                  </td>
                  <td className="text-right">-</td>
                </tr>

                <tr>
                  <td className="py-2 font-medium">
                    (b). Other Operating Revenues
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                {data.sections.otherOperatingRevenues.items.map((item, i) => (
                  <tr key={i}>
                    <td className="pl-6 py-1">{item.name}</td>
                    <td className="text-right">{item.value}</td>
                    <td className="text-right">-</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.total}</td>
                  <td className="text-right">-</td>
                </tr>
              </>
            )}

            {/* ========= NOTE 19 – OTHER INCOME ========= */}
            {data.notePoint === "19" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="py-2 font-medium">(a). Interest Income</td>
                  <td></td>
                  <td></td>
                </tr>
                {data.sections.interestIncome.items.map((item, i) => (
                  <tr key={i}>
                    <td className="pl-6 py-1">{item.name}</td>
                    <td className="text-right">{item.closing}</td>
                    <td className="text-right">{item.opening}</td>
                  </tr>
                ))}

                <tr>
                  <td className="py-2 font-medium">(b). Dividend Income</td>
                  <td className="text-right">
                    {data.sections.dividendIncome.closing}
                  </td>
                  <td className="text-right">
                    {data.sections.dividendIncome.opening}
                  </td>
                </tr>

                <tr>
                  <td className="py-2 font-medium">
                    (c). Other Non Operating Income
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                {data.sections.otherNonOperating.items.map((item, i) => (
                  <tr key={i}>
                    <td className="pl-6 py-1">{item.name}</td>
                    <td className="text-right">{item.closing}</td>
                    <td className="text-right">{item.opening}</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.total.closing}</td>
                  <td className="text-right">{data.total.opening}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="pt-3 text-sm italic text-red-600">
                    Value mismatch as per trial balance.
                  </td>
                </tr>
              </>

            )}

            {/* ========= NOTE 22 – EMPLOYEE BENEFIT EXPENSE ========= */}
            {data.notePoint === "22" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.particulars.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.value}</td>
                    <td className="text-right">-</td>
                  </tr>
                ))}

                {data.lessTransferredToProjectCost > 0 && (
                  <tr>
                    <td className="py-2 pl-4 italic text-gray-500">
                      Less: Employee benefits expense transferred to project
                      cost
                    </td>
                    <td className="text-right">
                      {data.lessTransferredToProjectCost}
                    </td>
                    <td className="text-right">-</td>
                  </tr>
                )}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.total}</td>
                  <td className="text-right">-</td>
                </tr>

                {/* ── NOTE LINE ── */}
                <tr>
                  <td colSpan={3} className="pt-3 text-sm italic text-red-500">
                    The value is not derived from TB.
                  </td>
                </tr>
              </>
            )}

            {/* ========= NOTE 23 – FINANCE COSTS ========= */}
            {data.notePoint === "23" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr className="border-b">
                  <th className="text-left">Particulars</th>
                  <th className="text-right">{data.dates?.closing}</th>
                  <th className="text-right">{data.dates?.opening}</th>
                </tr>
                <tr>
                  <td className="py-2">{data.sections.interest.name}</td>
                  <td className="text-right">{data.sections.interest.value}</td>
                  <td className="text-right">-</td>
                </tr>

                <tr>
                  <td className="py-2 font-medium">
                    {data.sections.otherBorrowingCost.label}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                {data.sections.otherBorrowingCost.items.map((item, i) => (
                  <tr key={i}>
                    <td className="pl-6 py-1">{item.name}</td>
                    <td className="text-right">{item.value}</td>
                    <td className="text-right">-</td>
                  </tr>
                ))}

                {data.lessFinanceCostTransferred > 0 && (
                  <tr>
                    <td className="py-2 pl-4 italic text-gray-500">
                      Less: Finance cost transferred to project cost
                    </td>
                    <td className="text-right">
                      {data.lessFinanceCostTransferred}
                    </td>
                    <td className="text-right">-</td>
                  </tr>
                )}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.total}</td>
                  <td className="text-right">-</td>
                </tr>
              </>
            )}

            {/* ========= NOTE 25 – OTHER EXPENSES ========= */}
            {data.notePoint === "25" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                {data.particulars.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.value}</td>
                    <td className="text-right">-</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.total}</td>
                  <td className="text-right">-</td>
                </tr>
              </>
            )}

            {/* ========= NOTE 26 – TAX EXPENSE ========= */}
            {data.notePoint === "26" && (
              <>  <tr className="border-b">
                <th className="text-left">Particulars</th>
                <th className="text-right">{data.dates?.closing}</th>
                <th className="text-right">{data.dates?.opening}</th>
              </tr>
                <tr>
                  <td className="py-2 font-medium">
                    {data.sections.incomeTaxExpense.label}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                {data.sections.incomeTaxExpense.items.map((item, i) => (
                  <tr key={i}>
                    <td className="pl-6 py-1">{item.name}</td>
                    <td className="text-right">{item.value}</td>
                    <td className="text-right">-</td>
                  </tr>
                ))}

                <tr className="font-semibold border-t">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right">{data.total}</td>
                  <td className="text-right">-</td>
                </tr>
              </>
            )}
            {data.notePoint === "4" && (
              <>
                {(() => {
                  const cost = {
                    asOnApr2023: [
                      316.04,
                      "-",
                      0.2,
                      1.42,
                      15.54,
                      9.14,
                      29.99,
                      2.21,
                      15.14,
                      389.68,
                      91.8,
                      19.5,
                      111.3,
                    ],
                    additions_FY24: [
                      "-",
                      "-",
                      "-",
                      "-",
                      1.05,
                      0.28,
                      1.2,
                      "-",
                      "-",
                      2.53,
                      "-",
                      0.14,
                      0.14,
                    ],
                    disposals_FY24: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      -8.54,
                      -8.54,
                      "-",
                      "-",
                      "-",
                    ],
                    asOnMar2024: [
                      316.04,
                      "-",
                      0.2,
                      1.42,
                      16.59,
                      9.42,
                      31.19,
                      2.21,
                      6.61,
                      383.67,
                      91.8,
                      19.65,
                      111.45,
                    ],
                    additions_FY25: [
                      "-",
                      1.06,
                      "-",
                      "-",
                      1.08,
                      0.25,
                      2.39,
                      "-",
                      "-",
                      4.79,
                      "-",
                      "-",
                      "-",
                    ],
                    disposals_FY25: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                    ],
                    asOnMar2025: [
                      316.04, 1.06, 0.2, 1.42, 17.67, 9.67, 33.59, 2.21, 6.61,
                      388.46, 91.8, 19.65, 111.45,
                    ],
                    additions_H1: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      1.36,
                      "-",
                      "-",
                      1.36,
                      "-",
                      0.05,
                      0.05,
                    ],
                    disposals_H1: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                    ],
                    asOnSep2025: [
                      316.04, 1.06, 0.2, 1.42, 17.67, 9.67, 34.94, 2.21, 6.61,
                      389.82, 91.8, 19.7, 111.5,
                    ],
                  };

                  const dep = {
                    asOnApr2023: [
                      73.35,
                      "-",
                      "-",
                      1.42,
                      14.71,
                      8.08,
                      24.75,
                      2.1,
                      13.52,
                      137.91,
                      91.8,
                      16.95,
                      108.75,
                    ],
                    charge_FY24: [
                      5.0,
                      "-",
                      "-",
                      "-",
                      0.09,
                      0.24,
                      2.49,
                      0.0,
                      0.36,
                      8.19,
                      "-",
                      0.68,
                      0.68,
                    ],
                    disposals_FY24: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      -8.11,
                      -8.11,
                      "-",
                      "-",
                      "-",
                    ],
                    asOnMar2024: [
                      78.35,
                      "-",
                      "-",
                      1.42,
                      14.79,
                      8.32,
                      27.24,
                      2.1,
                      5.77,
                      138.0,
                      91.8,
                      17.63,
                      109.43,
                    ],
                    charge_FY25: [
                      5.0,
                      0.1,
                      "-",
                      "-",
                      0.14,
                      0.28,
                      1.92,
                      0.0,
                      0.23,
                      7.68,
                      "-",
                      0.69,
                      0.69,
                    ],
                    disposals_FY25: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                    ],
                    asOnMar2025: [
                      83.35,
                      0.1,
                      "-",
                      1.42,
                      14.93,
                      8.6,
                      29.16,
                      2.11,
                      6.01,
                      145.67,
                      91.8,
                      18.32,
                      110.12,
                    ],
                    charge_H1: [
                      2.51,
                      0.17,
                      "-",
                      "-",
                      0.1,
                      0.14,
                      0.93,
                      0.0,
                      0.1,
                      3.95,
                      "-",
                      0.35,
                      0.35,
                    ],
                    disposals_H1: [
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      "-",
                      0.0,
                      "-",
                      0.0,
                      "-",
                      "-",
                      "-",
                    ],
                    asOnSep2025: [
                      85.86,
                      0.27,
                      "-",
                      1.42,
                      15.03,
                      8.73,
                      30.09,
                      2.11,
                      6.11,
                      149.62,
                      91.8,
                      18.67,
                      110.47,
                    ],
                  };

                  const nbv = {
                    asOnApr2023: [
                      242.69,
                      "-",
                      0.2,
                      "-",
                      0.84,
                      1.06,
                      5.25,
                      0.11,
                      1.62,
                      251.77,
                      "-",
                      2.55,
                      2.55,
                    ],
                    asOnMar2024: [
                      237.69,
                      "-",
                      0.2,
                      "-",
                      1.8,
                      1.1,
                      3.95,
                      0.11,
                      0.84,
                      245.68,
                      "-",
                      2.02,
                      2.02,
                    ],
                    asOnMar2025: [
                      232.69,
                      0.96,
                      0.2,
                      "-",
                      2.74,
                      1.07,
                      4.42,
                      0.11,
                      0.6,
                      242.79,
                      "-",
                      1.33,
                      1.33,
                    ],
                    asOnSep2025: [
                      230.18,
                      0.79,
                      0.2,
                      "-",
                      2.64,
                      0.94,
                      4.85,
                      0.1,
                      0.5,
                      240.2,
                      "-",
                      1.03,
                      1.03,
                    ],
                  };

                  const renderRow = (label, values, isBold = false) => (
                    <tr
                      key={label}
                      className={
                        isBold ? "font-semibold border-t border-b" : ""
                      }
                    >
                      <td className="py-1">{label}</td>
                      {values.map((v, i) => (
                        <td key={i} className="text-right px-1">
                          {v}
                        </td>
                      ))}
                    </tr>
                  );

                  return (
                    <>  <tr className="border-b">
                      <th className="text-left">Particulars</th>
                      <th className="text-right">{data.dates?.closing}</th>
                      <th className="text-right">{data.dates?.opening}</th>
                    </tr>
                      {/* Column Headers */}
                      <tr className="text-xs font-semibold bg-yellow-100 border-t border-b">
                        <td className="py-1">Particulars</td>
                        <td className="text-right px-1">Office buildings</td>
                        <td className="text-right px-1">Temporary Structure</td>
                        <td className="text-right px-1">Freehold land</td>
                        <td className="text-right px-1">
                          Leasehold improvement
                        </td>
                        <td className="text-right px-1">
                          Furniture & Fixtures
                        </td>
                        <td className="text-right px-1">Office equipments</td>
                        <td className="text-right px-1">Computers</td>
                        <td className="text-right px-1">
                          Electrical installations
                        </td>
                        <td className="text-right px-1">Vehicles</td>
                        <td className="text-right px-1 font-bold">Total</td>
                        <td className="text-right px-1">Trademark</td>
                        <td className="text-right px-1">Software licenses</td>
                        <td className="text-right px-1 font-bold">Total</td>
                      </tr>

                      {/* COST */}
                      <tr>
                        <td
                          colSpan={14}
                          className="font-semibold underline pt-3 pb-1"
                        >
                          Cost
                        </td>
                      </tr>
                      {renderRow(
                        "As on April 01, 2023",
                        cost.asOnApr2023,
                        true,
                      )}
                      {renderRow("Additions", cost.additions_FY24)}
                      {renderRow("Disposals", cost.disposals_FY24)}
                      {renderRow(
                        "As at March 31, 2024",
                        cost.asOnMar2024,
                        true,
                      )}
                      {renderRow("Additions", cost.additions_FY25)}
                      {renderRow("Disposals", cost.disposals_FY25)}
                      {renderRow(
                        "As at March 31, 2025",
                        cost.asOnMar2025,
                        true,
                      )}
                      {renderRow("Additions", cost.additions_H1)}
                      {renderRow("Disposals", cost.disposals_H1)}
                      {renderRow(
                        "As at September 30, 2025",
                        cost.asOnSep2025,
                        true,
                      )}

                      {/* DEPRECIATION */}
                      <tr>
                        <td
                          colSpan={14}
                          className="font-semibold underline pt-3 pb-1"
                        >
                          Accumulated Depreciation
                        </td>
                      </tr>
                      {renderRow("As on April 01, 2023", dep.asOnApr2023, true)}
                      {renderRow("Charge for the period", dep.charge_FY24)}
                      {renderRow("Disposals", dep.disposals_FY24)}
                      {renderRow("As at March 31, 2024", dep.asOnMar2024, true)}
                      {renderRow("Charge for the period", dep.charge_FY25)}
                      {renderRow("Disposals", dep.disposals_FY25)}
                      {renderRow("As at March 31, 2025", dep.asOnMar2025, true)}
                      {renderRow("Charge for the period", dep.charge_H1)}
                      {renderRow("Disposals", dep.disposals_H1)}
                      {renderRow(
                        "As at September 30, 2025",
                        dep.asOnSep2025,
                        true,
                      )}

                      {/* NET BOOK VALUE */}
                      <tr>
                        <td
                          colSpan={14}
                          className="font-semibold underline pt-3 pb-1"
                        >
                          Net book value
                        </td>
                      </tr>
                      {renderRow("As on April 01, 2023", nbv.asOnApr2023, true)}
                      {renderRow("As at March 31, 2024", nbv.asOnMar2024, true)}
                      {renderRow("As at March 31, 2025", nbv.asOnMar2025, true)}
                      {renderRow(
                        "As at September 30, 2025",
                        nbv.asOnSep2025,
                        true,
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {data.notePoint === "5" && (
              <>
                {/* ── MAIN CWIP TABLE ── */}
                <tr className="font-semibold bg-yellow-100 border-t border-b">
                  <td></td>
                  <td colSpan={3} className="text-center py-1">
                    As at
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                  <td className="text-right px-2">March 31, 2024</td>
                </tr>

                <tr>
                  <td className="py-1">Opening work in progress</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>
                <tr>
                  <td className="py-1">Additions</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr>
                  <td className="py-1">Capitalized during the year</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr className="font-semibold border-t border-b">
                  <td className="py-1">Closing work in progress</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>

                {/* ── CWIP AGEING - Sep 2025 ── */}
                <tr>
                  <td colSpan={6} className="font-semibold underline pt-4 pb-1">
                    Capital Work in progress (CWIP) Ageing
                  </td>
                </tr>
                <tr className="text-sm">
                  <td></td>
                  <td colSpan={5} className="text-center font-medium border-b">
                    Amount in CWIP for a period
                  </td>
                </tr>
                <tr className="font-semibold text-sm border-b">
                  <td>As at September 30, 2025</td>
                  <td className="text-right px-2">Less than 1 year</td>
                  <td className="text-right px-2">1-2 years</td>
                  <td className="text-right px-2">2-3 years</td>
                  <td className="text-right px-2">More than 3 years</td>
                  <td className="text-right px-2 font-bold">Total</td>
                </tr>
                <tr>
                  <td className="py-1">Projects in progress</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr>
                  <td className="py-1">Projects temporarily suspended *</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>
                <tr className="font-semibold border-t border-b">
                  <td className="py-1">Total:</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>

                {/* ── CWIP AGEING - Mar 2025 ── */}
                <tr>
                  <td colSpan={6} className="font-semibold underline pt-4 pb-1">
                    Capital Work in progress (CWIP) Ageing
                  </td>
                </tr>
                <tr className="text-sm">
                  <td></td>
                  <td colSpan={5} className="text-center font-medium border-b">
                    Amount in CWIP for a period
                  </td>
                </tr>
                <tr className="font-semibold text-sm border-b">
                  <td>As at March 31, 2025</td>
                  <td className="text-right px-2">Less than 1 year</td>
                  <td className="text-right px-2">1-2 years</td>
                  <td className="text-right px-2">2-3 years</td>
                  <td className="text-right px-2">More than 3 years</td>
                  <td className="text-right px-2 font-bold">Total</td>
                </tr>
                <tr>
                  <td className="py-1">Projects in progress</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr>
                  <td className="py-1">Projects temporarily suspended *</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>
                <tr className="font-semibold border-t border-b">
                  <td className="py-1">Total:</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>

                {/* ── CWIP AGEING - Mar 2024 ── */}
                <tr>
                  <td colSpan={6} className="font-semibold underline pt-4 pb-1">
                    Capital Work in progress (CWIP) Ageing
                  </td>
                </tr>
                <tr className="text-sm">
                  <td></td>
                  <td colSpan={5} className="text-center font-medium border-b">
                    Amount in CWIP for a period
                  </td>
                </tr>
                <tr className="font-semibold text-sm border-b">
                  <td>As at March 31, 2024</td>
                  <td className="text-right px-2">Less than 1 year</td>
                  <td className="text-right px-2">1-2 years</td>
                  <td className="text-right px-2">2-3 years</td>
                  <td className="text-right px-2">More than 3 years</td>
                  <td className="text-right px-2 font-bold">Total</td>
                </tr>
                <tr>
                  <td className="py-1">Projects in progress</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr>
                  <td className="py-1">Projects temporarily suspended *</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>
                <tr className="font-semibold border-t border-b">
                  <td className="py-1">Total:</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">52.00</td>
                  <td className="text-right px-2">52.00</td>
                </tr>

                {/* ── FOOTNOTE ── */}
                <tr>
                  <td colSpan={6} className="text-sm italic pt-3 text-red-600">
                    Note: Pertains to XYZ Green Meadows (Club house)
                  </td>
                </tr>
              </>
            )}

            {data.notePoint === "6a" && (
              <>
                {/* Header */}
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={2} className="text-center py-1">
                    As at
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                </tr>

                {/* QUOTED */}
                <tr>
                  <td colSpan={3} className="font-semibold py-1">
                    Quoted, carried at fair market value
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="underline text-sm pl-2">
                    (i) In equity investments - quoted at fair market value,
                    fully paid up
                  </td>
                </tr>

                <tr>
                  <td className="pl-4 py-1">
                    XYZ Housing & Industries Limited
                    <br />
                    <span className="text-xs font-normal">
                      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000)
                      equity shares of ₹2 each
                    </span>
                  </td>
                  <td className="text-right px-2">41.02</td>
                  <td className="text-right px-2">34.91</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">41.02</td>
                  <td className="text-right px-2">34.91</td>
                </tr>

                {/* UNQUOTED */}
                <tr>
                  <td colSpan={3} className="font-semibold pt-3 pb-1">
                    Unquoted, carried at cost less impairment
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="underline text-sm pl-2">
                    (i) In equity investments - unquoted at cost, fully paid up
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="font-semibold underline text-sm pl-4">
                    (a) Investment in Subsidiary:
                  </td>
                </tr>

                {[
                  { name: "A P Utility Services Limited", desc: "1,00,000 (March 31, 2025: 1,00,000, March 31, 2024: 1,00,000) Equity shares of ₹10 each", sep: "1.00", mar25: "1.00" },
                  { name: "XYZ Real Estate Limited", desc: "15,000 (March 31, 2025: 15,000, March 31, 2024: 15,000) Equity shares of ₹10 each", sep: "0.15", mar25: "0.15" },
                  { name: "Adhikari Properties Limited", desc: "5,19,720 (March 31, 2025: 5,19,720, March 31, 2024: 5,19,720) Equity shares of ₹10 each", sep: "3.05", mar25: "3.05" },
                  { name: "Amazon Infra Realtors Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Amazon Infracon Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Amazon Real Estate Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "AP Projects Limited", desc: "11,790 (March 31, 2025: 11,790, March 31, 2024: 11,790) Equity shares of ₹100 each", sep: "7.79", mar25: "7.79" },
                  { name: "XYZ Infrabuild Limited", desc: "33,327 (March 31, 2025: 33,327, March 31, 2024: 33,327) Equity shares of ₹10 each", sep: "0.33", mar25: "0.33" },
                  { name: "Best View Infracon Limited", desc: "50,010 (March 31, 2025: 50,010, March 31, 2024: 50,010) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Chiranijiv Builders Limited", desc: "49,994 (March 31, 2025: 49,994, March 31, 2024: 49,994) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "XYZ County Limited", desc: "3,40,000 (March 31, 2025: 3,40,000, March 31, 2024: 3,40,000) Equity shares of ₹10 each", sep: "95.33", mar25: "95.33" },
                  { name: "XYZ Greens Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "XYZ Homes Projects Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "XYZ SIDCUL Industrial Park Limited", desc: "2,49,999 (March 31, 2025: 2,49,999, March 31, 2024: 2,49,999) Equity shares of ₹10 each", sep: "2.50", mar25: "2.50" },
                  { name: "XYZ Sohna Projects Limited", desc: "61,00,000 (March 31, 2025: 61,00,000, March 31, 2024: 61,00,000) Equity shares of ₹10 each", sep: "710.44", mar25: "710.44" },
                  { name: "XYZ Townships and Housing Limited", desc: "5,45,980 (March 31, 2025: 5,45,980, March 31, 2024: 5,45,980) Equity shares of ₹10 each", sep: "25.39", mar25: "25.39" },
                  { name: "Ethenic Projects Private Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "Ethenic Real Estate Private Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "Green Park Buildwell Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Green Park Infracon Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "XYZ Green Park Infrastructure Limited", desc: "50,00,000 (March 31, 2025: 50,00,000, March 31, 2024: 50,00,000) Equity shares of ₹10 each", sep: "50.00", mar25: "50.00" },
                  { name: "Hi-Pride Infracon Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Maksad Estate and Hardware Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "XYZ Maksad Properties Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Mansarover Realtors Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Pigeon Infrastructure Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Pigeon Properties Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "S M Buildcon Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Sayana Builders Company Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Sayana Infrastructure & Properties Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Sayana Realtors Company Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Shri Ajitnath Buildcon Limited", desc: "50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each", sep: "0.50", mar25: "0.50" },
                  { name: "Alternative Habitat Private Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "Santur Builders Private Limited", desc: "Nil (March 31, 2025: Nil, March 31, 2024: 80,00,000) Equity shares of ₹10 each", sep: "-", mar25: "-" },
                  { name: "Blueridge Retails Private Limited", desc: "7,000 (March 31, 2025: 7,000, March 31, 2024: 7,000) Equity shares of ₹10 each", sep: "0.07", mar25: "0.07" },
                  { name: "Swarnim Nirman Private Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "XYZ Homes Developers Limited", desc: "7,000 (March 31, 2025: 7,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.07", mar25: "0.07" },
                  { name: "XYZ Serendipity Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "XYZ Infratech Realtors Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "XYZ Infracon Realtors Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "Villa Construction Private Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "Havenclass Homes Solutions Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "XYZ Abode Estates Solutions Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "XYZ Goodliving Properties Limited", desc: "7,000 (March 31, 2025: 7,000, March 31, 2024: Nil) Equity shares of ₹10 each", sep: "0.07", mar25: "0.07" },
                  { name: "Subhagyam Constructions Limited", desc: "10,000 (March 31, 2025: 10,000, March 31, 2024: Nil) Equity shares of ₹10 each", sep: "0.10", mar25: "0.10" },
                  { name: "Primula Luxury Homes Private Limited", desc: "9,000 (March 31, 2025: 9,000, March 31, 2024: Nil) Equity shares of ₹10 each", sep: "0.09", mar25: "0.09" },
                ].map((item, i) => (
                  <tr key={i}>
                    <td className="pl-4 py-1">
                      {item.name}
                      <br />
                      <span className="text-xs font-normal">{item.desc}</span>
                    </td>
                    <td className="text-right px-2">{item.sep}</td>
                    <td className="text-right px-2">{item.mar25}</td>
                  </tr>
                ))}

                {/* Subsidiary Subtotal */}
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">907.38</td>
                  <td className="text-right px-2">907.38</td>
                </tr>

                {/* JOINT VENTURES */}
                <tr>
                  <td colSpan={3} className="font-semibold underline text-sm pl-4 pt-2">
                    (b) Investment in Joint Ventures:
                  </td>
                </tr>
                <tr>
                  <td className="pl-4 py-1">
                    Wondrous Buildmart Private Limited
                    <br />
                    <span className="text-xs font-normal">
                      1,120 (March 31, 2025: 1,120, March 31, 2024: 1,120)
                      Equity shares of ₹10 each
                    </span>
                  </td>
                  <td className="text-right px-2">0.01</td>
                  <td className="text-right px-2">0.01</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">0.01</td>
                  <td className="text-right px-2">0.01</td>
                </tr>

                {/* PREFERENCE INVESTMENTS */}
                <tr>
                  <td colSpan={3} className="underline text-sm pl-2 pt-3">
                    (ii) In preference investments - unquoted at cost, fully paid up
                  </td>
                </tr>
                <tr>
                  <td className="pl-4 py-1">
                    Best View Infracon Limited
                    <br />
                    <span className="text-xs font-normal">
                      2,34,57,036 (March 31, 2025: 2,34,57,036, March 31, 2024:
                      Nil) Preference shares of ₹100 each
                    </span>
                  </td>
                  <td className="text-right px-2">2,345.70</td>
                  <td className="text-right px-2">2,345.70</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">2,345.70</td>
                  <td className="text-right px-2">2,345.70</td>
                </tr>

                {/* DEBENTURE INVESTMENTS */}
                <tr>
                  <td colSpan={3} className="underline text-sm pl-2 pt-3">
                    (iii) In debenture investments
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="font-semibold underline text-sm pl-4">
                    (a) Investment in Subsidiary:
                  </td>
                </tr>
                <tr>
                  <td className="pl-4 py-1">
                    Fully Non-convertible debentures (NCDs) in Best View Infracon Limited
                    <br />
                    <span className="text-xs font-normal">
                      Nil (March 31, 2025: Nil, March 31, 2024: 203) Debentures of ₹10,00,000 each
                    </span>
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>
                </tr>
                <tr>
                  <td className="pl-4 py-1">
                    Optional Convertible debentures (OCDs) in XYZ Green Park Infra. Ltd.
                    <br />
                    <span className="text-xs font-normal">
                      Nil (March 31, 2025: Nil, 11,281, March 31, 2024: 30,536) Debentures of ₹10,000 each
                    </span>
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">112.81</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">112.81</td>
                </tr>

                {/* GRAND TOTAL */}
                <tr className="font-bold border-t-2 border-b-2">
                  <td className="py-2">TOTAL:</td>
                  <td className="text-right px-2">3,294.12</td>
                  <td className="text-right px-2">3,400.82</td>
                </tr>

                {/* AGGREGATE INFO */}
                <tr>
                  <td colSpan={3} className="pt-3"></td>
                </tr>
                <tr>
                  <td className="py-1 text-sm">Aggregated cost of quoted investments</td>
                  <td className="text-right px-2 text-sm">1.40</td>
                  <td className="text-right px-2 text-sm">1.40</td>
                </tr>
                <tr>
                  <td className="py-1 text-sm">Aggregated market value of quoted investments</td>
                  <td className="text-right px-2 text-sm">41.02</td>
                  <td className="text-right px-2 text-sm">34.91</td>
                </tr>
                <tr>
                  <td className="py-1 text-sm">Aggregated cost of unquoted investment</td>
                  <td className="text-right px-2 text-sm">3,253.10</td>
                  <td className="text-right px-2 text-sm">3,365.91</td>
                </tr>
                <tr>
                  <td className="py-1 text-sm">Aggregate amount of impairment in value of investments</td>
                  <td className="text-right px-2 text-sm">-</td>
                  <td className="text-right px-2 text-sm">-</td>
                </tr>
              </>
            )}
            {data.notePoint === "6c" && (
              <>
                {/* Header */}
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={2} className="text-center py-1">
                    As at
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                </tr>

                {/* Fixed Deposits */}
                <tr>
                  <td className="py-1 underline font-medium">
                    Fixed Deposits:
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1">
                    Bank Deposit with maturity remaining more than 12 months
                  </td>
                  <td className="text-right px-2">51.12</td>
                  <td className="text-right px-2">3.34</td>
                </tr>

                {/* Total */}
                <tr className="font-semibold border-t border-b">
                  <td className="py-1">TOTAL:</td>
                  <td className="text-right px-2">51.12</td>
                  <td className="text-right px-2">3.34</td>
                </tr>
              </>
            )}
            {data.notePoint === "7" && (
              <>
                {/* Header */}
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={2} className="text-center py-1">
                    As at
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                </tr>

                {/* Deferred Tax Liabilities */}
                <tr>
                  <td className="py-1 font-semibold underline">
                    Deferred tax liabilities
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1">
                    Property, plant and equipments, investment property &
                    intangible assets
                  </td>
                  <td className="text-right px-2">42.65</td>
                  <td className="text-right px-2">43.11</td>
                </tr>
                <tr>
                  <td className="py-1">
                    Financial assets carried at FVTOCI and FVTPL
                  </td>
                  <td className="text-right px-2">1.07</td>
                  <td className="text-right px-2">(0.86)</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td className="py-1">Total Deferred tax liabilities</td>
                  <td className="text-right px-2">43.71*</td>
                  <td className="text-right px-2">42.24*</td>
                </tr>

                {/* Deferred Tax Assets */}
                <tr>
                  <td className="py-2 font-semibold underline">
                    Deferred tax assets
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 text-sm">
                    Impact of expenditure charged to the statement of profit and
                    loss in the current year but allowable for tax purposes on
                    payment basis
                  </td>
                  <td className="text-right px-2">0.57</td>
                  <td className="text-right px-2">0.44</td>
                </tr>
                <tr>
                  <td className="py-1">
                    Disallowances under section 40(a)(ia) of the Income Tax Act,
                    1961
                  </td>
                  <td className="text-right px-2">0.27</td>
                  <td className="text-right px-2">(1.46)</td>
                </tr>
                <tr>
                  <td className="py-1">Others</td>
                  <td className="text-right px-2">90.10</td>
                  <td className="text-right px-2">79.69</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td className="py-1">Total Deferred tax assets</td>
                  <td className="text-right px-2">90.94</td>
                  <td className="text-right px-2">78.67</td>
                </tr>

                {/* Net */}
                <tr className="font-bold border-t-2 border-b-2">
                  <td className="py-2">DEFERRED TAX ASSETS (NET):</td>
                  <td className="text-right px-2">47.23*</td>
                  <td className="text-right px-2">36.43*</td>
                </tr>
              </>
            )}
            {data.notePoint === "9" && (
              <>
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={2} className="text-center py-1">
                    As at
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                </tr>

                <tr>
                  <td className="py-1">Raw materials</td>
                  <td className="text-right px-2">12.05</td>
                  <td className="text-right px-2">11.05</td>
                </tr>
                <tr>
                  <td className="py-1">Finished goods</td>
                  <td className="text-right px-2">809.65</td>
                  <td className="text-right px-2">372.66</td>
                </tr>
                <tr>
                  <td className="py-1">Project Units in progress</td>
                  <td className="text-right px-2">4,794.29</td>
                  <td className="text-right px-2">4,564.15</td>
                </tr>

                <tr className="font-semibold border-t border-b">
                  <td className="py-1">TOTAL:</td>
                  <td className="text-right px-2">5,615.99 *</td>
                  <td className="text-right px-2">4,947.86 *</td>
                </tr>

                <tr>
                  <td colSpan={3} className="text-sm italic pt-2 text-red-600">
                    All Inventories are valued at cost or net realizable value,
                    whichever is lower.
                  </td>
                </tr>
              </>
            )}

            {data.notePoint === "12a" && (
              <>
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={2} className="text-center py-1">
                    As at
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                </tr>

                {/* (i) Retained Earnings */}
                <tr>
                  <td className="py-1 font-medium">(i) Retained Earnings / surplus</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Balance as per last balance sheet</td>
                  <td className="text-right px-2">5,556.96</td>
                  <td className="text-right px-2">4,788.44</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Add:- Profit for the year as per Statement of Profit & Loss</td>
                  <td className="text-right px-2">80.70</td>
                  <td className="text-right px-2">780.80</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Add:- Other Comprehensive Income (net of taxes)</td>
                  <td className="text-right px-2">(1.68)</td>
                  <td className="text-right px-2">(1.46)</td>
                </tr>
                <tr className="border-t">
                  <td></td>
                  <td className="text-right px-2">5,635.97</td>
                  <td className="text-right px-2">5,567.78</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Less:- Dividend & tax paid</td>
                  <td className="text-right px-2">10.83</td>
                  <td className="text-right px-2">10.83</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">5,625.15</td>
                  <td className="text-right px-2">5,556.96</td>
                </tr>

                {/* (ii) OCI for FVTOCI */}
                <tr>
                  <td className="py-1 font-medium pt-3">(ii) OCI for FVTOCI</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Balance as per last balance sheet</td>
                  <td className="text-right px-2">29.52</td>
                  <td className="text-right px-2">33.59</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Items that will not be reclassified to profit and loss (net of taxes)</td>
                  <td className="text-right px-2">5.04</td>
                  <td className="text-right px-2">(4.07)</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">34.56</td>
                  <td className="text-right px-2">29.52</td>
                </tr>

                {/* (iii) Capital redemption reserve */}
                <tr>
                  <td className="py-1 font-medium pt-3">(iii) Capital redemption reserve</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Balance as per last balance sheet</td>
                  <td className="text-right px-2">12.52</td>
                  <td className="text-right px-2">12.52</td>
                </tr>

                {/* (iv) Share premium */}
                <tr>
                  <td className="py-1 font-medium pt-3">(iv) Share premium</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Balance as per last balance sheet</td>
                  <td className="text-right px-2">763.28</td>
                  <td className="text-right px-2">763.28</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Bonus Issue</td>
                  <td className="text-right px-2">(216.50)</td>
                  <td className="text-right px-2">0.00</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td></td>
                  <td className="text-right px-2">546.78</td>
                  <td className="text-right px-2">763.28</td>
                </tr>

                {/* (v) General reserve */}
                <tr>
                  <td className="py-1 font-medium pt-3">(v) General reserve</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Balance as per last balance sheet</td>
                  <td className="text-right px-2">34.63</td>
                  <td className="text-right px-2">34.63</td>
                </tr>

                {/* TOTAL */}
                <tr className="font-bold border-t-2 border-b-2">
                  <td className="py-2">TOTAL:</td>
                  <td className="text-right px-2">6,253.64 *</td>
                  <td className="text-right px-2">6,396.91 *</td>
                </tr>

                {/* ── NOTE LINE ── */}
                <tr>
                  <td colSpan={3} className="text-sm italic pt-2 text-red-600">
                    Due to absence of TB linkage, balances for previous year have been taken as static.
                  </td>
                </tr>
              </>
            )}
            {data.notePoint === "20" && (
              <>
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={3} className="text-center py-1">
                    For the Period/year ended
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>

                </tr>

                <tr>
                  <td className="py-1">Land/Development Right</td>
                  <td className="text-right px-2">269.51</td>
                  <td className="text-right px-2">1,314.24</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Construction Material, Labour and other costs
                  </td>
                  <td className="text-right px-2">281.02</td>
                  <td className="text-right px-2">409.97</td>

                </tr>
                <tr>
                  <td className="py-1">Architect Fees</td>
                  <td className="text-right px-2">21.77</td>
                  <td className="text-right px-2">10.76</td>

                </tr>
                <tr>
                  <td className="py-1">Finance Cost</td>
                  <td className="text-right px-2">288.76</td>
                  <td className="text-right px-2">405.16</td>

                </tr>
                <tr>
                  <td className="py-1">Indirect Expenses</td>
                  <td className="text-right px-2">91.55</td>
                  <td className="text-right px-2">120.95</td>

                </tr>

                <tr className="font-bold border-t-2 border-b-2">
                  <td className="py-1">TOTAL:</td>
                  <td className="text-right px-2">952.62*</td>
                  <td className="text-right px-2">2,261.08*</td>

                </tr>
              </>
            )}

            {data.notePoint === "21" && (
              <>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>
                </tr>

                {/* Opening Values */}
                <tr>
                  <td className="py-1 font-medium">Opening Values: (A)</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Construction material</td>
                  <td className="text-right px-2">11.05</td>
                  <td className="text-right px-2">5.82</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Completed Units</td>
                  <td className="text-right px-2">372.66</td>
                  <td className="text-right px-2">372.66</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Project in progress</td>
                  <td className="text-right px-2">4,564.15</td>
                  <td className="text-right px-2">2,998.96</td>
                </tr>

                {/* Closing Values */}
                <tr>
                  <td className="py-1 font-medium pt-2">
                    Less: Closing Values:(B)
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Construction material</td>
                  <td className="text-right px-2">12.05</td>
                  <td className="text-right px-2">11.05</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Completed Units</td>
                  <td className="text-right px-2">809.65</td>
                  <td className="text-right px-2">372.66</td>
                </tr>
                <tr>
                  <td className="py-1 pl-4">Project in progress</td>
                  <td className="text-right px-2">4,794.29</td>
                  <td className="text-right px-2">4,564.15</td>
                </tr>

                {/* Total */}
                <tr className="font-bold border-t-2 border-b-2">
                  <td className="py-1">Total (A)-(B)</td>
                  <td className="text-right px-2">(668.14)</td>
                  <td className="text-right px-2">(1,570.42)</td>
                </tr>

                {/* ── NOTE LINE ── */}
                <tr>
                  <td colSpan={3} className="pt-3 text-sm italic text-red-600">
                    Value is being populated from RM working and not from TB.
                  </td>
                </tr>
              </>
            )}
            {data.notePoint === "24" && (
              <>
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={3} className="text-center py-1">
                    For the Period/year ended
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>

                </tr>

                <tr>
                  <td className="py-1">Depreciation expense</td>
                  <td className="text-right px-2">3.95</td>
                  <td className="text-right px-2">7.68</td>

                </tr>
                <tr>
                  <td className="py-1">Amortization expense</td>
                  <td className="text-right px-2">0.35</td>
                  <td className="text-right px-2">0.69</td>

                </tr>

                <tr className="font-bold border-t-2 border-b-2">
                  <td className="py-1">TOTAL:</td>
                  <td className="text-right px-2">4.30*</td>
                  <td className="text-right px-2">8.37*</td>

                </tr>
              </>
            )}

            {data.notePoint === "27" && (
              <>
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={3} className="text-center py-1">
                    For the Period/year ended
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>

                </tr>

                <tr>
                  <td className="py-1 font-medium">
                    Net profit after tax attributable to equity shareholders
                  </td>
                  <td className="text-right px-2">80.70</td>
                  <td className="text-right px-2">780.80</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Weighted average number of equity shares outstanding during
                    the year (Nos.)
                  </td>
                  <td className="text-right px-2">64,951,062</td>
                  <td className="text-right px-2">64,951,062</td>

                </tr>
                <tr>
                  <td className="py-1 font-medium">
                    Basic EPS (₹) (For continued operation)
                  </td>
                  <td className="text-right px-2">1.24</td>
                  <td className="text-right px-2">12.02</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Adjustment for calculation of diluted EPS on account of
                    stock options
                  </td>
                  <td className="text-right px-2">80.70</td>
                  <td className="text-right px-2">780.80</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Weighted average number of equity shares for calculating
                    diluted EPS (Nos.)
                  </td>
                  <td className="text-right px-2">64,951,062</td>
                  <td className="text-right px-2">64,951,062</td>

                </tr>
                <tr>
                  <td className="py-1 font-medium">
                    Diluted EPS (₹) (For continued operation)
                  </td>
                  <td className="text-right px-2">1.24</td>
                  <td className="text-right px-2">12.02</td>

                </tr>
                <tr>
                  <td className="py-1">Nominal value per equity share (₹)</td>
                  <td className="text-right px-2">5.00</td>
                  <td className="text-right px-2">5.00</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Basic EPS (₹) (For discontinued operation)
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Diluted EPS (For discontinued operation)
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>

                </tr>
              </>
            )}

            {data.notePoint === "27" && (
              <>
                <tr className="font-semibold border-b">
                  <td></td>
                  <td colSpan={3} className="text-center py-1">
                    For the Period/year ended
                  </td>
                </tr>
                <tr className="font-semibold border-b">
                  <td>Particulars</td>
                  <td className="text-right px-2">September 30, 2025</td>
                  <td className="text-right px-2">March 31, 2025</td>

                </tr>

                <tr>
                  <td className="py-1 font-medium">
                    Net profit after tax attributable to equity shareholders
                  </td>
                  <td className="text-right px-2">80.70</td>
                  <td className="text-right px-2">780.80</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Weighted average number of equity shares outstanding during
                    the year (Nos.)
                  </td>
                  <td className="text-right px-2">64,951,062</td>
                  <td className="text-right px-2">64,951,062</td>

                </tr>
                <tr>
                  <td className="py-1 font-medium">
                    Basic EPS (₹) (For continued operation)
                  </td>
                  <td className="text-right px-2">1.24</td>
                  <td className="text-right px-2">12.02</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Adjustment for calculation of diluted EPS on account of
                    stock options
                  </td>
                  <td className="text-right px-2">80.70</td>
                  <td className="text-right px-2">780.80</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Weighted average number of equity shares for calculating
                    diluted EPS (Nos.)
                  </td>
                  <td className="text-right px-2">64,951,062</td>
                  <td className="text-right px-2">64,951,062</td>

                </tr>
                <tr>
                  <td className="py-1 font-medium">
                    Diluted EPS (₹) (For continued operation)
                  </td>
                  <td className="text-right px-2">1.24</td>
                  <td className="text-right px-2">12.02</td>

                </tr>
                <tr>
                  <td className="py-1">Nominal value per equity share (₹)</td>
                  <td className="text-right px-2">5.00</td>
                  <td className="text-right px-2">5.00</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Basic EPS (₹) (For discontinued operation)
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>

                </tr>
                <tr>
                  <td className="py-1">
                    Diluted EPS (For discontinued operation)
                  </td>
                  <td className="text-right px-2">-</td>
                  <td className="text-right px-2">-</td>

                </tr>
              </>
            )}
          </tbody>

        </table>

        {/* ── PREV / NEXT NAVIGATION ── */}
        <div className="flex justify-end items-center gap-3 mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => navigateToNote(currentIndex - 1)}
            disabled={!hasPrev || loading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition ${hasPrev && !loading
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous: Note {hasPrev ? allNoteCodes[currentIndex - 1] : ""}
          </button>

          <button
            onClick={() => navigateToNote(currentIndex + 1)}
            disabled={!hasNext || loading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition ${hasNext && !loading
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            Next: Note {hasNext ? allNoteCodes[currentIndex + 1] : ""}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <p className="text-center text-blue-600 text-sm mt-3">Loading...</p>
        )}

      </div>
    </div>
  );
};

export default ResultNotes;