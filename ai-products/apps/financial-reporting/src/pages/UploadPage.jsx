import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Upload as UploadIcon,
  History,
  Settings,
  HelpCircle,
  LogOut,
  FileText,
  XCircle,
  ChevronDown,
  Scale,
} from "lucide-react";
import SideBar from "../components/SideBar";
import { useToast } from "../context/ToastContext";
import axios from "axios";
import { useEffect } from "react";
import { apiUrl } from "../lib/apiPath";




const ALLOWED_EXTENSIONS = ["xlsx", "csv"];


const UploadPage = () => {
  const { showToast } = useToast();
  const SidebarDropdown = ({ icon, label, items, navigate }) => {
    return (
      <div className="relative group">
        <div className="flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg text-[#566176] hover:text-[#0b1a33] hover:bg-[#f3f5f1] transition-all duration-200 cursor-pointer">
          <span className="flex-shrink-0 mr-3 text-[#9aa7bd] group-hover:text-[#3a4659]">
            {icon}
          </span>
          <span className="flex-1">{label}</span>
        </div>

        {/* Dropdown */}
        <div className="hidden group-hover:block ml-10 mt-1 space-y-1">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className="block w-full text-left px-4 py-2 text-sm rounded-lg text-[#566176] hover:text-[#1d7a73] hover:bg-[#eef6f5] transition-all duration-150"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  };
  const [isProcessing, setIsProcessing] = useState(false);
  const [showError, setShowError] = useState(false);

  const navigate = useNavigate();
  const [files, setFiles] = useState([]);

  const [existingTB, setExistingTB] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const checkTB = async () => {
      try {
        const res = await axios.get(apiUrl("/api/trial-balance/check-upload"));
        if (!res.data.isEmpty) {
          setExistingTB(res.data.fileName);
        }
      } catch (err) {
        console.error("Error checking TB:", err);
      }
    };
    checkTB();
  }, []);

  const isValidFile = (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  };




  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);

    const validFiles = selectedFiles.filter(isValidFile);

    if (validFiles.length !== selectedFiles.length) {
      showToast("Some files were rejected. Only Excel (.xlsx) or CSV (.csv) files are allowed.", "error");
    }

    setFiles(prev => [...prev, ...validFiles]);
  };



  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(isValidFile);

    if (validFiles.length !== droppedFiles.length) {
      showToast("Some files were rejected. Only Excel (.xlsx) or CSV (.csv) files are allowed.", "error");
    }

    setFiles(prev => [...prev, ...validFiles]);
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
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };





  const handleStartProcessing = () => {
    if (files.length === 0) {
      setShowError(true);
      return;
    }

    setShowError(false);
    setIsProcessing(true);

    // Small delay so user sees "Processing..."
    setTimeout(() => {
      navigate("/dashboard/processing", {
        state: { files }
      });
    }, 600);
  };





  // Check if regular form is valid
  const isFormValid = () => files.length > 0;



  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* ---------- TOP BAR ---------- */}
      <header className="flex items-center justify-between bg-white/80 backdrop-blur-xl px-6 py-4 shadow-sm border-b border-[#dde3da]/50">
        <h1 className="text-lg font-semibold text-[#0b1a33] tracking-[-0.01em]">
          Upload Document
        </h1>
      </header>

      {/* ---------- UPLOAD CONTENT ---------- */}
      <div className={`flex-1 overflow-y-auto flex flex-col px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8 lg:py-12 
          "items-center justify-center"

        `}>
        {/* ---------- PAGE TITLE ---------- */}
        <div className={`text-center mb-6 lg:mb-8 w-full px-2 sm:px-4 max-w-2xl mx-auto`}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#0b1a33] mb-3 tracking-[-0.01em] leading-[1.15] break-words">
            Upload Your Sales Data
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-[#566176] leading-[1.6] break-words whitespace-normal px-2">
            Supported formats: {" "}
            <span className="font-semibold text-[#0b1a33]">Excel (.xlsx)</span>,{" "}
            <span className="font-semibold text-[#0b1a33]">CSV (.csv)</span>
          </p>
        </div>

        {/* ---------- UPLOAD CARD CONTAINER ---------- */}
        <div className={`w-full px-2 sm:px-4 max-w-2xl mx-auto`}>
          <div className="bg-white rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-[#dde3da] p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 overflow-visible">
            <h1 className="text-gray-600 font-semibold text-center text-xl mb-5">
              Upload Your Sales Data
            </h1>
            {existingTB && (
              <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-xs text-indigo-500 font-medium uppercase tracking-wider">Current Trial Balance Found</p>
                    <p className="text-sm font-semibold text-indigo-900">{existingTB}</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/dashboard/processing", { state: { resume: true } })}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition shadow-sm"
                >
                  Use Existing
                </button>
              </div>
            )}

            {/* ---------- UPLOAD SECTION (Conditional based on document type) ---------- */}

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`w-full min-h-72 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ease-out cursor-pointer ${dragOver
                ? "border-[#0b1a33] bg-gradient-to-br from-[#eef6f5] to-[#dcefec] shadow-[0_8px_24px_rgba(30,64,175,0.25),0_2px_8px_rgba(30,64,175,0.15)] scale-[1.01]"
                : "border-[#c5ccc6] bg-[#f3f5f1] hover:border-[#0b1a33]/60 hover:bg-gradient-to-br hover:from-[#f3f5f1] hover:to-[#e8ece5] hover:shadow-[0_4px_16px_rgba(30,64,175,0.1)] hover:-translate-y-0.5"
                }`}
            >
              {files.length === 0 ? (
                <>
                  <div className={`mb-6 p-5 rounded-2xl transition-all duration-300 ease-out ${dragOver
                    ? "bg-white/80 shadow-[0_4px_12px_rgba(30,64,175,0.15)] scale-110"
                    : "bg-white/50 hover:bg-white/70 hover:scale-105 hover:-translate-y-1"
                    }`}>
                    <UploadIcon className={`w-12 h-12 transition-all duration-300 ease-out ${dragOver ? "text-[#0b1a33] scale-110" : "text-[#566176]"
                      }`} />
                  </div>
                  <p className={`text-sm sm:text-base font-semibold mb-2 transition-all duration-300 ease-out break-words whitespace-normal px-3 sm:px-4 text-center ${dragOver ? "text-[#0b1a33] scale-105" : "text-[#0b1a33]"
                    }`}>
                    Drag & Drop your document here
                  </p>
                  <p className="text-[#566176] text-xs sm:text-sm mb-4 transition-opacity duration-300 break-words whitespace-normal px-3 sm:px-4 text-center">
                    or click to browse
                  </p>
                  <span className="text-[#c5ccc6] text-xs font-medium my-2 flex items-center gap-2 w-full max-w-[200px] px-4">
                    <span className="flex-1 h-px bg-[#dde3da]"></span>
                    OR
                    <span className="flex-1 h-px bg-[#dde3da]"></span>
                  </span>
                  <label className="cursor-pointer bg-gradient-to-r from-[#0b1a33] to-[#4fb3ac] hover:from-[#0b1a33] hover:to-[#4fb3ac] text-white px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold shadow-[0_4px_12px_rgba(30,64,175,0.3)] hover:shadow-[0_6px_16px_rgba(30,64,175,0.4)] transform hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-200 ease-out mt-2 active:scale-[0.98] active:translate-y-0 break-words whitespace-normal">
                    Browse Files
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </>
              ) : (
                <div className="w-full space-y-4 px-4">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-[#f3f5f1] border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-[#0b1a33]" />
                        <div className="truncate">
                          <p className="text-sm font-semibold text-[#0b1a33] truncate">{file.name}</p>
                          <p className="text-xs text-[#566176]">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => removeFile(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ))}

                  {/* Add more files */}
                  <label className="cursor-pointer text-[#0b1a33] text-sm font-semibold flex items-center justify-center gap-2 border-2 border-dashed border-[#c5ccc6] rounded-xl py-4 hover:bg-[#eef6f5]">
                    <UploadIcon className="w-4 h-4" />
                    Add more files
                    <input
                      type="file"
                      multiple
                      accept=".xlsx,.csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
              )}
            </div>
            {showError && (
              <p className="text-red-600 text-sm font-medium mb-4 text-center">
                Please upload at least one file before continuing.
              </p>
            )}


            {/* ---------- PROCESS BUTTON ---------- */}
            <div className="mt-6 sm:mt-8 md:mt-10 pt-6 sm:pt-8 border-t border-[#dde3da]">
              <button
                onClick={handleStartProcessing}
                disabled={!isFormValid() || isProcessing}
                className={`w-full py-3 sm:py-4 rounded-xl text-white font-semibold text-sm sm:text-base transition-all duration-200 ease-out
  focus:outline-none focus:ring-2 focus:ring-[#0b1a33]/30 focus:ring-offset-2
  ${!isFormValid()
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-gradient-to-r from-[#0b1a33] to-[#4fb3ac] hover:opacity-95 hover:cursor-pointer"
                  }
  ${isProcessing ? "cursor-wait" : ""}
  `}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-3">
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    Processing…
                  </div>
                ) : (
                  <div>

                    Start AI Processing
                  </div>
                )}
              </button>



            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- Sidebar Link Component ---
const SidebarLink = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 text-left group ${active
      ? "text-[#1d7a73] bg-[#eef6f5]/60"
      : "text-[#566176] hover:text-[#0b1a33] hover:bg-[#f3f5f1]"
      }`}
  >
    {/* Subtle active indicator */}
    {active && (
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#1d7a73] rounded-r-full"></div>
    )}
    <span className={`flex-shrink-0 mr-3 transition-colors duration-200 ${active ? 'text-[#1d7a73]' : 'text-[#9aa7bd] group-hover:text-[#3a4659]'
      }`}>
      {icon}
    </span>
    <span className="flex-1">{label}</span>
  </button>
);

export default UploadPage;
