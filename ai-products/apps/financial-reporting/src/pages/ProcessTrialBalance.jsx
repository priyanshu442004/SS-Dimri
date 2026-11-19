import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { apiUrl } from "../lib/apiPath";

const messages = [
  "Initializing processing engine...",
  "Analyzing debit and credit flows...",
  "Validating ledger structure...",
  "Cross-checking balances...",
  "Preparing final output...",
];

const ProcessTrialBalance = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const file = location.state?.file;

  const [messageIndex, setMessageIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Rotate messages smoothly
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < messages.length - 1 ? prev + 1 : prev
      );
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!file) {
      navigate("/");
      return;
    }

    const processFile = async () => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(
          apiUrl("/api/trial-balance/process"),
          {
            method: "POST",
            body: formData,
          }
        );

        const data = await response.json();

        setIsComplete(true);

        setTimeout(() => {
          navigate("results", { state: { processedData: data } });
        }, 1500);
      } catch (err) {
        console.error("Processing failed:", err);
      }
    };

    processFile();
  }, [file, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-6">
      <div className="bg-white shadow-xl rounded-2xl p-12 w-full max-w-lg text-center border border-gray-100 transition-all duration-500">

        {!isComplete ? (
          <>
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-6" />

            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              Processing Trial Balance
            </h1>

            <p className="text-gray-600 text-sm transition-opacity duration-500">
              {messages[messageIndex]}
            </p>

            <div className="mt-8 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 animate-pulse w-full"></div>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4 animate-bounce" />
            <h2 className="text-xl font-semibold text-gray-900">
              Processing Complete
            </h2>
            <p className="text-gray-500 text-sm mt-2">
              Your trial balance has been successfully processed.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ProcessTrialBalance; 