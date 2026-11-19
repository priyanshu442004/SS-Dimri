import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";

const ResultsPage = () => {
  const [page, setPage] = useState(1);
const pageSize = 20;

  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state?.result;




  if (!data) {
    navigate("/dashboard/upload");
    return null;
  }

  const { records, totals } = data;

  const [selectedProject, setSelectedProject] = useState(null);
  const [search, setSearch] = useState("");


  useEffect(() => {
  setPage(1);
}, [search, selectedProject]);

const filtered = records.filter(r => {
  const matchesProject = selectedProject
    ? (r.project || "").toLowerCase() === selectedProject
    : true;

  const q = search.toLowerCase();
  const matchesSearch =
    r.allotNo?.toLowerCase().includes(q) ||
    r.name?.toLowerCase().includes(q) ||
    r.unitNo?.toLowerCase().includes(q);

  return matchesProject && matchesSearch;
});
  const filteredSumArea = filtered.reduce(
  (sum, r) => sum + (r.saleableArea || 0),
  0
);

const filteredTotalSale = filtered.reduce(
  (sum, r) => sum + (r.totalSaleConsideration || 0),
  0
);
const visibleRows = filtered.slice(0, page * pageSize);
const hasMore = visibleRows.length < filtered.length;


  return (
    <div className="min-h-screen bg-slate-50 p-8">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button className="hover:cursor-pointer" onClick={() => navigate("/dashboard")}>
          <ArrowLeft />
        </button>
        <h1 className="text-3xl font-bold">Sales MIS Summary</h1>
      </div>

      {/* Totals */}
     {/* Totals */}
<div className="grid grid-cols-2 gap-6 mb-8">
  <StatCard
    label="Sum of Area Sold"
    value={filteredSumArea.toLocaleString()}
  />
  <StatCard
    label="Total Sale Consideration"
    value={`₹ ${filteredTotalSale.toLocaleString()}`}
  />
</div>


      {/* Project Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Object.entries(totals.byProject).map(([project, info]) => (
          <div
            key={project}
            onClick={() =>
              setSelectedProject(
                selectedProject === project ? null : project
              )
            }
            className={`p-5 rounded-xl border cursor-pointer transition-all
              ${
                selectedProject === project
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white hover:shadow-lg"
              }`}
          >
            <h3 className="font-semibold capitalize">{project}</h3>
            <p className="text-sm mt-2">Units: {info.count}</p>
            <p className="text-sm">Area: {info.saleableArea.toLocaleString()}</p>
            <p className="text-sm">
              Value: ₹ {info.saleValue.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-3 bg-white px-4 py-3 rounded-xl shadow">
        <Search className="text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Allot No, Name or Unit No"
          className="flex-1 outline-none text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100 text-gray-700">
            <tr>
              {[
                "Sr. No",
                "Allot No",
                "Name",
                "Project",
                "Unit No",
                "Saleable Area (sq. ft.)",
                "Total Sale Consideration",
                "Total Amount Due till 31 March 2026",
                "Amount Received till 31 March 2026",
                "Outstanding as on 31 March 2026",
                "Amount Received %",
                "Saleable Area",
                "Total Sale Consideration"
              ].map(h => (
                <th key={h} className="p-3 border text-left whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => (
              <tr key={i} className="border-t hover:bg-slate-50">
                <td className="p-3">{r.srNo}</td>
                <td className="p-3">{r.allotNo}</td>
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.project}</td>
                <td className="p-3">{r.unitNo}</td>
                <td className="p-3 text-right">{r.saleableArea}</td>
                <td className="p-3 text-right">₹ {r.totalSaleConsideration}</td>
                <td className="p-3 text-right">₹ {r.totalAmountDue}</td>
                <td className="p-3 text-right">₹ {r.amountReceived}</td>
                <td className="p-3 text-right">₹ {r.outstanding}</td>
                <td className="p-3 text-right">{r.amountReceivedPercent}%</td>
                <td className="p-3 text-right">{r.saleableAreaCondition}</td>
                <td className="p-3 text-right">
                  ₹ {r.totalSaleConsiderationCondition}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
{hasMore && (
  <div className="flex justify-center py-10">
    <button
      onClick={() => setPage(p => p + 1)}
      className="
        group relative flex items-center gap-3 px-10 py-4
        rounded-2xl font-semibold text-white
        bg-gradient-to-r from-[#0b1a33] to-[#4fb3ac]
        shadow-[0_10px_30px_rgba(30,64,175,0.35)]
        hover:shadow-[0_15px_40px_rgba(30,64,175,0.5)]
        transition-all duration-300 ease-out
        hover:-translate-y-1 active:translate-y-0
        overflow-hidden
      "
    >
      {/* Glow animation */}
      <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 blur-xl transition" />

      {/* Text */}
      <span className="relative text-lg tracking-wide">
        View More Records
      </span>

      {/* Counter pill */}
      <span className="
        relative px-3 py-1 rounded-full text-sm
        bg-white/20 backdrop-blur
        border border-white/30
      ">
        {filtered.length - visibleRows.length} left
      </span>
    </button>
  </div>
)}



        {filtered.length === 0 && (
          <p className="text-center p-10 text-gray-500">
            No matching records found
          </p>
        )}

        
      </div>
      <div className="mt-16 flex flex-col items-center gap-6">

  {/* Divider */}
  <div className="w-full max-w-2xl flex items-center gap-4">
    <div className="flex-1 h-px bg-slate-200" />
    <span className="text-slate-400 text-sm font-medium">Next</span>
    <div className="flex-1 h-px bg-slate-200" />
  </div>

  {/* CTA Card */}
  <div className="
    w-full max-w-3xl
    bg-gradient-to-br from-[#eef6f5] to-[#eef6f5]
    border border-[#eef6f5]
    rounded-3xl
    p-10
    shadow-[0_20px_50px_rgba(99,102,241,0.15)]
    flex flex-col md:flex-row items-center justify-between
    gap-8
  ">
    <div>
      <h3 className="text-2xl font-bold text-[#0b1a33] mb-2">
        Upload another Sales Data
      </h3>
      <p className="text-[#1d7a73]/80 max-w-md">
        Process another Excel or CSV file and generate a fresh MIS instantly with AI-powered validation.
      </p>
    </div>

    <button
      onClick={() => navigate("/dashboard/upload")}
      className="
        px-10 py-4 rounded-2xl font-semibold text-white
        bg-gradient-to-r from-[#0b1a33] to-[#4fb3ac]
        shadow-[0_10px_30px_rgba(30,64,175,0.35)]
        hover:shadow-[0_15px_40px_rgba(30,64,175,0.5)]
        transition-all duration-300
        hover:-translate-y-1
        active:translate-y-0
      "
    >
      Upload Next Document
    </button>

  </div>
</div>

    </div>
  );
};

const StatCard = ({ label, value }) => (
  <div className="bg-white rounded-xl shadow p-6">
    <p className="text-gray-500 text-sm">{label}</p>
    <p className="text-2xl font-bold mt-2">{value}</p>

    
  </div>
);

export default ResultsPage;
