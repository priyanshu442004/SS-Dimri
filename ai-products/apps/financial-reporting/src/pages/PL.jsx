import React, { useState, useEffect } from "react";
import axios from "axios";
import { UploadCloud, FileText, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/apiPath";

import { mailFinancialReport } from "../lib/financialReportMail";
const PL = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [responseData, setResponseData] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setResponseData(null);
    setError(null);
  };

  const removeFile = (index) => {
    const updated = [...files];
    updated.splice(index, 1);
    setFiles(updated);
  };


  const [checkUploadFolder, setCheckingFolder] = useState("true")


  const handleAutoProcess = async () => {


    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();

      const res = await axios.post(
        apiUrl("/api/trial-balance/process/PL"),
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      navigate(
        "/dashboard/trial-balance/profit-loss/processed",
        {
          state: {
            profitLossData: res.data
          }
        }
      );
    } catch (err) {
      setError("Upload failed. Please check your file format.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const checkFolder = async () => {
      try {
        const res = await axios.get(
          apiUrl("/api/trial-balance/check-upload")
        );

        if (!res.data.isEmpty) {
          // If file exists → auto process
          handleAutoProcess();
        }
      } catch (error) {
        console.error("Folder check failed:", error);
      } finally {
        setCheckingFolder(false);
      }
    };

    checkFolder();
  }, []);

  const handleUpload = async () => {
    if (!files.length) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();

      files.forEach((file) => {
        formData.append("file", file);
      });

      const res = await axios.post(
        apiUrl("/api/trial-balance/process/PL"),
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      // new trial balance uploaded → one email with Balance Sheet + P&L (background)
      mailFinancialReport();

      navigate(
        "/dashboard/trial-balance/profit-loss/processed",
        {
          state: {
            profitLossData: res.data
          }
        }
      );
    } catch (err) {
      setError("Upload failed. Please check your file format.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <header className="flex items-center justify-between bg-white/80 backdrop-blur-xl px-6 py-4 shadow-sm border-b border-[#dde3da]/50">
        <h1 className="text-lg font-semibold text-[#0b1a33]">Profit & Loss Generator</h1>
      </header>
      <div className="p-8">
        <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-8">

          {/* Header */}
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Profit-Loss Generator
          </h1>
          <p className="text-gray-600 mb-6">
            Upload your Trial Balance file(s) in <strong>Excel (.xlsx, .xls)</strong>
            or <strong>CSV (.csv)</strong> format. You may upload multiple files.
          </p>

          {/* Upload Area */}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-2xl p-10 cursor-pointer hover:bg-indigo-50 transition relative">

            {loading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="animate-spin text-indigo-600 w-10 h-10 mb-3" />
                <p className="text-indigo-600 font-medium">
                  Processing Profit-Loss...
                </p>
              </div>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-indigo-500 mb-4" />
                <p className="text-gray-700 font-medium">
                  Click to upload or drag & drop
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Excel or CSV files only
                </p>
              </>
            )}

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* File List */}
          {files.length > 0 && !loading && (
            <div className="mt-6 space-y-3">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center bg-indigo-50 px-4 py-3 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="text-indigo-600 w-5 h-5" />
                    <span className="text-gray-700 text-sm">
                      {file.name}
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          {files.length > 0 && !loading && (
            <button
              onClick={handleUpload}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition shadow-lg"
            >
              Generate Profit-Loss Statement
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 text-red-600 bg-red-50 p-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Success Response */}
          {responseData && (
            <div className="mt-6 bg-green-50 p-4 rounded-xl">
              <h2 className="font-semibold text-green-700 mb-2">
                Processing Successful
              </h2>
              <pre className="text-xs bg-white p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(responseData, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="mt-16 space-y-16">

          {/* Section 1 - How It Works */}
          <div className="bg-white rounded-3xl shadow-xl p-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              How It Works
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-indigo-50 p-6 rounded-2xl">
                <h3 className="font-semibold text-indigo-700 mb-2">1. Upload Trial Balance</h3>
                <p className="text-gray-600 text-sm">
                  Upload your trial balance in Excel or CSV format. Multiple files are supported.
                </p>
              </div>

              <div className="bg-indigo-50 p-6 rounded-2xl">
                <h3 className="font-semibold text-indigo-700 mb-2">2. Automatic Classification</h3>
                <p className="text-gray-600 text-sm">
                  The system classifies accounts and maps them to notes automatically.
                </p>
              </div>

              <div className="bg-indigo-50 p-6 rounded-2xl">
                <h3 className="font-semibold text-indigo-700 mb-2">3. Instant Profit-Loss Statement</h3>
                <p className="text-gray-600 text-sm">
                  Notes 18-26 are calculated and structured into a clean Profit-Loss Statement.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2 - Supported Formats */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-3xl p-10 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">
              Supported File Format
            </h2>

            <ul className="space-y-3 text-indigo-100 text-sm">
              <li>• Excel (.xlsx, .xls)</li>
              <li>• CSV (.csv)</li>
              <li>• UTF-8 Encoding Recommended</li>
              <li>• First sheet should contain Trial Balance</li>
              <li>• Columns required: Account Head, Debit Opening, Credit Opening, Debit Closing, Credit Closing</li>
            </ul>
          </div>

          {/* Section 3 - Important Notes */}
          <div className="bg-gray-50 rounded-3xl p-10 shadow-inner">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Important Instructions
            </h2>

            <div className="space-y-4 text-gray-600 text-sm">
              <p>
                ✔ Ensure no manual editing is done after exporting from accounting software.
              </p>
              <p>
                ✔ Make sure all balances are final and reconciled.
              </p>
              <p>
                ✔ Remove empty rows before uploading.
              </p>
              <p>
                ✔ Large files may take a few seconds to process.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PL;