import React, { useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { Download, Upload, Edit3, ArrowLeft } from "lucide-react";
import * as XLSX from "xlsx";
import { FileBarChart2, TrendingUp } from "lucide-react";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
 const mergeByAccountHead = (rows) => {
  const grouped = {};

  rows.forEach((row) => {
    const key = row.accountHead?.trim().toLowerCase();
    if (!key) return;

    if (!grouped[key]) {
      grouped[key] = {
        ...row,
        netOpeningBalance: Number(row.netOpeningBalance) || 0,
        netFY: Number(row.netFY) || 0,
        netClosingBalance: Number(row.netClosingBalance) || 0,
      };
    } else {
      grouped[key].netOpeningBalance += Number(row.netOpeningBalance) || 0;
      grouped[key].netFY += Number(row.netFY) || 0;
      grouped[key].netClosingBalance += Number(row.netClosingBalance) || 0;
    }
  });

  return Object.values(grouped);
};

const ResultTrialBalance = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialData = location.state?.processedData?.tableData || [];
  const [rowData, setRowData] = useState(() =>
  mergeByAccountHead(initialData)
);

const [showNA, setShowNA] = useState(false);
const processedRows = useMemo(() => {
  // First filter NA if needed
  let filtered = showNA
    ? rowData
    : rowData.filter((row) => row.NATURE !== "NA");

  // Then sort: BS first, PL second
  const order = { BS: 1, PL: 2, NA: 3 };

  filtered.sort((a, b) => {
    return (order[a.NATURE] || 99) - (order[b.NATURE] || 99);
  });

  return filtered;
}, [rowData, showNA]);
  const gridRef = useRef();
const [visibleCount, setVisibleCount] = useState(50);
 


  const columnDefs = useMemo(() => [
    {
      headerName: "Account Head",
      field: "accountHead",
      editable: true,
      filter: true,
      sortable: true,
      flex: 2,
    },
    {
    headerName: "Nature",
    field: "NATURE",   
    editable: true,
    filter: true,
    sortable: true,
    flex: 1,
  },
  {
    headerName: "Balance Sheet Head",
    field: "Balance Sheet Head", 
    editable: true,
    filter: true,
    sortable: true,
    flex: 1.5,
  },
  {
    headerName: "Group Heads",
    field: "Group heads", 
    editable: true,
    filter: true,
    sortable: true,
    flex: 1.5,
  },
    {
      headerName: "Net Opening Balance",
      field: "netOpeningBalance",
      editable: true,
      filter: "agNumberColumnFilter",
      sortable: true,
      valueFormatter: (params) =>
        params.value?.toLocaleString("en-IN"),
      flex: 1,
    },
    {
      headerName: "Net FY",
      field: "netFY",
      editable: true,
      filter: "agNumberColumnFilter",
      sortable: true,
      valueFormatter: (params) =>
        params.value?.toLocaleString("en-IN"),
      flex: 1,
    },
    {
      headerName: "Net Closing Balance",
      field: "netClosingBalance",
      editable: true,
      filter: "agNumberColumnFilter",
      sortable: true,
      valueFormatter: (params) =>
        params.value?.toLocaleString("en-IN"),
      flex: 1,
    },
   {
  headerName: "Adjustment",
  field: "adjustment",
  editable: true,
  flex: 1,
  valueFormatter: (params) => params.value?.toLocaleString("en-IN") ?? "-",
},
{
  headerName: "Regrouping",
  field: "regrouping",
  editable: true,
  flex: 1,
  valueFormatter: (params) => params.value?.toLocaleString("en-IN") ?? "-",
},
{
  headerName: "Ind AS",
  field: "indAS",
  editable: true,
  flex: 1,
  valueFormatter: (params) => params.value?.toLocaleString("en-IN") ?? "-",
},
{
  headerName: "Net CLS Balance",
  field: "netClsBalance",
  // Remove the valueGetter — use the field directly
  editable: true,
  flex: 1,
  valueFormatter: (params) =>
    params.value != null ? Number(params.value).toFixed(2) : "-",
},

  ], []);



const onCellValueChanged = () => {
  const updatedData = [];
  gridRef.current.api.forEachNode((node) => {
    updatedData.push(node.data);
  });

  // Merge again after editing
  const merged = mergeByAccountHead(updatedData);
  setRowData(merged);
};

const getGridData = () => {
  return processedRows; // full filtered & sorted dataset
};

const exportExcel = () => {
  const data = getGridData(); // get latest grid data
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Trial Balance");
  XLSX.writeFile(workbook, "Updated_Trial_Balance.xlsx");
};

const exportCSV = () => {
  const data = getGridData(); // get latest grid data
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Updated_Trial_Balance.csv";
  link.click();
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 px-8 py-10">
      <div className="w-full mx-auto">
<div className="flex flex-row justify-between">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Processed Trial Balance
          </h1>
          <p className="text-gray-600 mt-2 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-indigo-600" />
            Double click any cell to edit values before exporting.
            
            
          </p>
          <span className="text-sm text-gray-500">Press Enter to save changes.</span>
        </div>
        <div className="flex gap-3 h-10">
            <button
              onClick={exportExcel}
              className="flex items-center bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shadow-md"
            >
              <Download className="w-4 h-4 mr-2" />
              Export as Excel
            </button>

            <button
              onClick={exportCSV}
              className="flex items-center bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md"
            >
              <Download className="w-4 h-4 mr-2" />
              Export as CSV
            </button>

            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center bg-gray-300 text-gray-800 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-400 transition"
            >
              {/* left arrow icon */}
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go back
            </button>
          </div>
</div>
        {/* Header */}

        {/* Action Buttons */}
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-gray-500">
            Total Rows: {rowData.length}
          </div>

          
        </div>

        {/* Grid */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
          <div
            className="ag-theme-alpine"
            style={{ height: "70vh", width: "100%" }}
          >
           <AgGridReact theme="legacy"
  ref={gridRef}
  rowData={processedRows.slice(0, visibleCount)}
  columnDefs={columnDefs}
  animateRows
  defaultColDef={{
    resizable: true,
    editable: true,
    sortable: true,
    filter: true,
    floatingFilter: true,
  }}
  onCellValueChanged={onCellValueChanged}
/>
          </div>
          <div className="flex items-center justify-between mt-6">
  
  {/* Show NA Checkbox */}
  <label className="flex items-center gap-2 text-sm text-gray-600">
    <input
      type="checkbox"
      checked={showNA}
      onChange={(e) => setShowNA(e.target.checked)}
      className="w-4 h-4"
    />
    Show NA values
  </label>

  {/* Show More Button */}
  {visibleCount < processedRows.length && (
    <button
      onClick={() => setVisibleCount(processedRows.length)}
      className="text-indigo-600 text-sm font-medium hover:underline"
    >
      Show More ({processedRows.length - visibleCount} more)
    </button>
  )}
</div>
        </div>

        {/* Final Actions Section */}
<div className="mt-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white">
  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
    
    <div>
      <h2 className="text-2xl font-semibold">
        Ready to Generate Financial Statements?
      </h2>
      <p className="text-indigo-100 mt-2">
        Review your processed trial balance and proceed to generate reports.
      </p>
    </div>

    <div className="flex gap-4">
     <button
        onClick={() => navigate("/dashboard/trial-balance/balance-sheet")}
        className="flex items-center gap-2 bg-white text-indigo-700 px-6 py-3 rounded-xl font-semibold shadow-md hover:scale-105 transition transform hover:cursor-pointer"
      >
        <FileBarChart2 className="w-5 h-5" />
        View Balance Sheet
      </button>

      <button
        onClick={() => navigate("/dashboard/trial-balance/profit-loss")}
        className="flex items-center gap-2 bg-black bg-opacity-20 backdrop-blur text-white px-6 py-3 rounded-xl font-semibold border border-white hover:bg-opacity-30 transition  hover:cursor-pointer"
      >
        <TrendingUp className="w-5 h-5" />
        View Profit & Loss
      </button>

    </div>
  </div>
</div>
      </div>
    </div>
  );
};

export default ResultTrialBalance;
