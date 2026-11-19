import { useEffect, useState } from "react";
import { useRef } from "react";

import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle, AlertCircle } from "lucide-react";
import { apiUrl } from "../lib/apiPath";

const steps = [
  "Extracting data",
  "Processing data",
  "Generating results",
];



const ProcessingPage = () => {

  const [stepStatus, setStepStatus] = useState([
    "pending",   // Extracting
    "pending",   // Processing
    "pending"    // Generating
  ]);

  const navigate = useNavigate();
  const location = useLocation();
  const files = location.state?.files || [];

  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState(null);
  const hasRun = useRef(false);
  const finished = useRef(false);


  useEffect(() => {
    if (finished.current) return;
    if (!files.length) {
      navigate("/dashboard/upload");
      return;
    }

    if (hasRun.current) return;
    hasRun.current = true;

    runPipeline();
  }, []);

  const runPipeline = async () => {
    try {
      // STEP 1 — UPLOAD + EXTRACT
      setCurrentStep(0);
      setStepStatus(["active", "pending", "pending"]);

      const uploadForm = new FormData();
      files.forEach(file => uploadForm.append("files", file));

      const uploadRes = await fetch(apiUrl("/api/v1/upload/upload"), {
        method: "POST",
        body: uploadForm
      });

      const uploadData = await uploadRes.json();

      if (!uploadData.extracted) {
        throw new Error("Failed to extract data from files");
      }

      setStepStatus(["done", "active", "pending"]);
      setCurrentStep(1);


      const processRes = await fetch(apiUrl("/api/v1/upload/process"), {
        method: "POST"
      });

      const processData = await processRes.json();

      if (!processData.processed) {
        throw new Error("Data processing failed");
      }

      setStepStatus(["done", "done", "active"]);
      setCurrentStep(2);


      const rows = processData.data;

      const totals = {
        totalSaleableArea: 0,
        totalSaleValue: 0,
        byProject: {}
      };

      rows.forEach(row => {
        const area = Number(row.saleableAreaCondition || 0);
        const value = Number(row.totalSaleConsiderationCondition || 0);
        const project = (row.project || "Unknown").toLowerCase();

        totals.totalSaleableArea += area;
        totals.totalSaleValue += value;

        if (!totals.byProject[project]) {
          totals.byProject[project] = {
            saleableArea: 0,
            saleValue: 0,
            count: 0
          };
        }

        totals.byProject[project].saleableArea += area;
        totals.byProject[project].saleValue += value;
        totals.byProject[project].count++;
      });

      // Navigate to results
      finished.current = true;
      setStepStatus(["done", "done", "done"]);

      setTimeout(() => {
        navigate("/dashboard/results", {
          replace: true,
          state: {
            result: {
              records: rows,
              totals
            },
            documentType: "sales_mis",
            fileName: "Sales_MIS.xlsx"
          }
        });

      }, 1500);

    } catch (err) {
      console.error(err);
      setError(err.message || "Processing failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20 px-4 py-12">
      <div className="w-full max-w-2xl mx-auto space-y-8">

        {/* ---------- LOADER ---------- */}
        <div className="flex flex-col items-center text-center">
          <div className="relative flex items-center justify-center mb-8">
            <div className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-[#0b1a33]/10 to-[#4fb3ac]/10 animate-pulse"></div>
            <div className="absolute w-24 h-24 rounded-full bg-gradient-to-br from-[#0b1a33]/20 to-[#4fb3ac]/20 animate-ping"></div>

            <div className="relative z-10 w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-[#dde3da]"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#0b1a33] border-r-[#4fb3ac] animate-spin"></div>
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-[#4fb3ac] animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-gradient-to-br from-[#0b1a33] to-[#4fb3ac] animate-pulse"></div>
              </div>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-[#0b1a33] mb-3">
            Processing your Sales data…
          </h1>
          <p className="text-base md:text-lg text-[#566176] flex items-center gap-2 justify-center">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
            Processing {files.length} file{files.length > 1 ? "s" : ""} in real-time
          </p>

        </div>

        {/* ---------- PROGRESS ---------- */}
        <div className="bg-white rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-[#dde3da] p-8 lg:p-10">

          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-[#dde3da]">
              <div
                className="absolute top-0 left-0 w-full bg-gradient-to-b from-[#0b1a33] to-[#4fb3ac] transition-all duration-700 ease-out"

                style={{ height: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            <ul className="space-y-8 relative">
              {steps.map((step, index) => {
                const status = stepStatus[index];

                return (
                  <li key={index} className="flex items-start gap-5 group">
                    {/* Circle */}
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500
          ${status === "done"
                          ? "bg-green-500 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)]"
                          : status === "active"
                            ? "border-blue-600 text-blue-600 bg-white shadow-[0_0_20px_rgba(37,99,235,0.4)] animate-pulse"
                            : "border-gray-300 text-gray-400 bg-white"
                        }`}
                    >
                      {status === "done" ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : status === "active" ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 pt-1">
                      <p
                        className={`text-lg font-semibold transition-all
            ${status === "done"
                            ? "text-green-600"
                            : status === "active"
                              ? "text-blue-600"
                              : "text-gray-500"
                          }`}
                      >
                        {step}
                      </p>

                      {status === "active" && (
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
                          Working on this step…
                        </p>
                      )}

                      {status === "done" && (
                        <p className="text-xs text-green-600 mt-1">Completed</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

          </div>

          {error && (
            <div className="mt-10 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
              <p className="text-red-600 font-semibold mb-4">{error}</p>
              <button
                onClick={() => navigate("/dashboard/upload")}
                className="px-6 py-2 bg-red-600 text-white rounded-xl"
              >
                Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ProcessingPage;
