import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { ChevronLeft } from "lucide-react";
import { useToast } from "../context/ToastContext";

ModuleRegistry.registerModules([AllCommunityModule]);

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { apiUrl } from "../lib/apiPath";

const TrialBalancePreview = () => {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const rawData = location.state?.tableData || [];

  const tableData = useMemo(() => {
    return rawData.filter((row) => {
      // Define numeric columns here
      const numericFields = [
        "Debit Opening",
        "Credit Opening",
        "Debit",
        "Credit",
      ];

      return numericFields.every((field) => {
        const value = row[field];

        // Remove row if value is null, empty, or not a valid number
        if (value === null || value === undefined || value === "") {
          return false;
        }

        return !isNaN(Number(value));
      });
    });
  }, [rawData]);

  const columnDefs = useMemo(() => {
    if (!tableData.length) return [];

    return Object.keys(tableData[0]).map((key) => ({
      headerName: key,
      field: key,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      sortable: true,
      resizable: true,
    }));
  }, [tableData]);

  return (
    <div className="min-h-screen bg-gray-50 px-8 py-10">
      <div className="max-w-7xl mx-auto">

        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center text-gray-600 hover:cursor-pointer bg-white border border-gray-200 rounded-md shadow-sm px-4 py-2 text-sm font-medium hover:bg-gray-100 transition"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </button>

          <button
            onClick={async () => {
              if (!window.confirm("Are you sure you want to delete this Trial Balance?")) return;
              try {
                const res = await fetch(apiUrl("/api/trial-balance/delete"), { method: "DELETE" });
                const data = await res.json();
                if (data.success) {
                  showToast("Deleted successfully", "success");
                  navigate("/dashboard/trial-balance-summary");
                }
              } catch (e) {
                console.error("Delete failed", e);
              }
            }}
            className="inline-flex items-center text-red-600 hover:cursor-pointer bg-white border border-red-200 rounded-md shadow-sm px-4 py-2 text-sm font-medium hover:bg-red-50 transition ml-2"
          >
            Delete File
          </button>

          <button
            onClick={() => {
              navigate("/process/trialBalance", { state: { file: location.state?.file } });

            }}
            className="inline-flex items-center bg-indigo-600 text-white px-5 hover:cursor-pointer py-2.5 rounded-md text-sm font-medium shadow-sm hover:bg-indigo-700 transition"
          >
            Process File →
          </button>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            File Preview
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review the uploaded trial balance before processing.
          </p>
        </div>

        {/* Grid Container */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div
            className="ag-theme-alpine rounded-md overflow-hidden"
            style={{ height: "70vh", width: "100%" }}
          >
            <AgGridReact theme="legacy"
              rowData={tableData}
              columnDefs={columnDefs}
              pagination
              paginationPageSize={20}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialBalancePreview;