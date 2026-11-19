import React, { useState } from "react";
import { Upload, FileText, XCircle } from "lucide-react";

const UploadDocument = () => {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Handle file input
  const handleFileChange = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
    }
  };

  // Handle drag & drop
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const uploadedFile = e.dataTransfer.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  // Remove file
  const removeFile = () => setFile(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f3f5f1] via-blue-50/30 to-purple-50/30 flex flex-col items-center justify-center px-4 py-12">
      {/* ---------- PAGE TITLE ---------- */}
      <div className="text-center max-w-2xl mb-12">
        <h1 className="text-4xl lg:text-5xl font-bold text-[#0b1a33] mb-4 tracking-tight">
          Upload Your Financial Document
        </h1>
        <p className="text-lg text-[#3a4659]">
          Supported formats: <span className="font-semibold text-[#0b1a33]">PDF</span>,{" "}
          <span className="font-semibold text-[#0b1a33]">Excel</span>,{" "}
          <span className="font-semibold text-[#0b1a33]">CSV</span>, Bank Statements, Invoices
        </p>
      </div>

      {/* ---------- UPLOAD BOX ---------- */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`w-full max-w-2xl border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-300 p-12 ${
          dragOver
            ? "border-[#1d7a73] bg-gradient-to-br from-blue-50 to-purple-50 shadow-premium-colored-lg scale-[1.02]"
            : "border-[#dde3da] bg-[#FFFFFF] hover:border-[#1d7a73] hover:shadow-premium-lg"
        }`}
      >
        {!file ? (
          <>
            <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl">
              <Upload className="w-16 h-16 text-blue-600" />
            </div>
            <p className="text-[#0b1a33] font-semibold text-lg mb-2">
              Drag & Drop your document here
            </p>
            <span className="text-[#9aa7bd] text-sm my-4 font-medium">OR</span>
            <label className="cursor-pointer bg-gradient-to-r from-[#1d7a73] to-[#4fb3ac] hover:from-[#1b315e] hover:to-[#1b315e] text-white px-8 py-3 rounded-xl text-base font-semibold shadow-lg shadow-[#1d7a73]/30 hover:shadow-xl hover:shadow-[#1d7a73]/40 transform hover:scale-105 transition-all duration-300">
              Browse Files
              <input
                type="file"
                accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,.jpg,.png"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-center space-y-6 w-full">
            <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200">
              <FileText className="w-14 h-14 text-green-600" />
            </div>
            <div>
              <p className="text-[#0b1a33] font-bold text-xl mb-2">{file.name}</p>
              <p className="text-[#9aa7bd] text-sm font-medium">
                {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={removeFile}
                className="flex items-center px-6 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 border border-red-200 transition-all duration-200 hover:shadow-md"
              >
                <XCircle className="w-5 h-5 mr-2" /> Remove
              </button>
              <label className="flex items-center px-6 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 border border-blue-200 transition-all duration-200 hover:shadow-md cursor-pointer">
                <Upload className="w-5 h-5 mr-2" />
                Re-upload
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ---------- PROCESS BUTTON ---------- */}
      <div className="mt-10 w-full max-w-2xl">
        <button
          disabled={!file}
          className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all duration-300 ${
            file
              ? "bg-gradient-to-r from-[#1d7a73] to-[#4fb3ac] hover:from-[#1b315e] hover:to-[#1b315e] hover:shadow-xl hover:shadow-[#1d7a73]/40 transform hover:scale-[1.02]"
              : "bg-[#dde3da] cursor-not-allowed"
          }`}
        >
          Start AI Processing
        </button>
      </div>
    </div>
  );
};

export default UploadDocument;