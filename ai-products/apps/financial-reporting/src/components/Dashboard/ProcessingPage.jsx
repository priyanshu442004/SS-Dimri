import React, { useState, useEffect } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

const ProcessingPage = () => {
  // Simulate progressing steps over time
  const steps = [
    "Text extraction",
    "Table detection",
    "Transaction identification",
    "Categorization",
    "Document generation",
  ];

  const [currentStep, setCurrentStep] = useState(0);

  // Automatically advance steps (for demo)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < steps.length ? prev + 1 : prev));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      {/* ---------- LOADER SECTION ---------- */}
      <div className="flex flex-col items-center text-center mb-12">
        <div className="relative flex items-center justify-center">
          {/* Outer Pulse Ring */}
          <div className="absolute w-24 h-24 rounded-full bg-blue-200 opacity-50 animate-ping"></div>
          {/* Loader Icon */}
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin relative z-10" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mt-6">
          Processing Your Document…
        </h1>
        <p className="text-gray-600 mt-2 max-w-md">
          Extracting data, detecting tables, cleaning entries, generating output…
        </p>
      </div>

      {/* ---------- PROGRESS STEPS ---------- */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-6 text-center">
          Processing Steps
        </h3>

        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

          {/* Steps List */}
          <ul className="space-y-8 relative">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;

              return (
                <li key={index} className="flex items-start relative">
                  <div className="flex flex-col items-center mr-4 mt-0.5">
                    {/* Step Circle */}
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        isCompleted
                          ? "bg-green-500 border-green-500 text-white"
                          : isCurrent
                          ? "border-blue-600 text-blue-600 animate-pulse"
                          : "border-gray-300 text-gray-400"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-bold">
                          {index + 1}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        isCompleted
                          ? "text-green-600"
                          : isCurrent
                          ? "text-blue-600"
                          : "text-gray-700"
                      }`}
                    >
                      {step}
                    </p>
                    {isCurrent && (
                      <p className="text-sm text-gray-500 mt-1 animate-pulse">
                        Working on this step…
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Status Message */}
        {currentStep >= steps.length && (
          <div className="mt-8 text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="font-semibold text-green-600">
              Processing Completed Successfully!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingPage;