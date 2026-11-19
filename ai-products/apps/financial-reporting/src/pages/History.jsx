import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, RefreshCw, Upload, Mail, Download, Trash2, FileSpreadsheet, AlertCircle } from "lucide-react";
import { useActivity, formatDuration } from "../lib/activity";

const KINDS = {
  upload: { label: "Upload", plural: "Uploads", icon: Upload, cls: "bg-blue-50 text-blue-700 border-blue-200" },
  process: { label: "Statement", plural: "Statements", icon: FileSpreadsheet, cls: "bg-violet-50 text-violet-700 border-violet-200" },
  download: { label: "Download", plural: "Downloads", icon: Download, cls: "bg-slate-50 text-slate-700 border-slate-200" },
  email: { label: "Email", plural: "Emails", icon: Mail, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  delete: { label: "Removed", plural: "Removals", icon: Trash2, cls: "bg-orange-50 text-orange-700 border-orange-200" },
};
const fmt = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const HistoryPage = () => {
  const navigate = useNavigate();
  const { data, error, refresh } = useActivity();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");

  const rows = useMemo(() => (data?.events || []).filter((e) =>
    (kind === "all" || e.kind === kind) &&
    (!q || `${e.title} ${e.file} ${e.detail}`.toLowerCase().includes(q.toLowerCase()))), [data, q, kind]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20 font-sans">
      <header className="flex items-center justify-between bg-white/80 backdrop-blur-xl px-6 lg:px-8 py-4 lg:py-5 shadow-sm border-b border-[#dde3da]/50">
        <div>
          <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-[#0b1a33] tracking-[-0.01em] leading-[1.3]">Activity History</h1>
          <p className="text-sm text-[#566176] mt-0.5">Every upload, generated statement, download and report email, newest first.</p>
        </div>
        <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#3a4659] border border-[#dde3da] rounded-lg hover:bg-white">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name or activity…"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-[#dde3da] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="px-3 py-2.5 text-sm bg-white border border-[#dde3da] rounded-lg focus:outline-none">
              <option value="all">All activity</option>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.plural}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#dde3da]/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[#3a4659] bg-[#f3f5f1] border-b border-[#dde3da]">
                    {["Activity", "File", "Type", "When", "Duration", "Status"].map((h) => (
                      <th key={h} className="py-3 px-5 font-semibold text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dde3da]">
                  {!data && (
                    <tr><td colSpan={6} className="py-10 text-center text-[#566176]">Loading activity…</td></tr>
                  )}
                  {data && rows.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center">
                      <FileText className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="text-[#3a4659] font-medium">{data.events.length ? "No activity matches your filters." : "No activity yet."}</p>
                      {!data.events.length && (
                        <button onClick={() => navigate("/dashboard/trial-balance/summary")} className="mt-3 text-sm text-blue-600 font-medium hover:underline">
                          Upload a trial balance
                        </button>
                      )}
                    </td></tr>
                  )}
                  {rows.map((e) => {
                    const K = KINDS[e.kind] || KINDS.upload;
                    return (
                      <tr key={e.id} className="hover:bg-blue-50/30">
                        <td className="py-3 px-5 font-medium text-[#0b1a33]">
                          <span className="inline-flex items-center gap-2"><K.icon className="w-4 h-4 text-[#9aa7bd]" />{e.title}</span>
                          {e.detail && <span className="block text-xs font-normal text-[#566176] mt-0.5">{e.detail}</span>}
                        </td>
                        <td className="py-3 px-5 text-[#3a4659] max-w-[280px] truncate" title={e.file}>{e.file || "Current trial balance"}</td>
                        <td className="py-3 px-5"><span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full border ${K.cls}`}>{K.label}</span></td>
                        <td className="py-3 px-5 text-[#3a4659] whitespace-nowrap">{fmt(e.at)}</td>
                        <td className="py-3 px-5 text-[#3a4659] whitespace-nowrap">{e.ms != null ? formatDuration(e.ms) : "Not timed"}</td>
                        <td className="py-3 px-5">
                          <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full border ${e.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                            {e.ok ? "Completed" : "Failed"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {data && <p className="text-xs text-[#9aa7bd]">{rows.length} of {data.events.length} recent events shown.</p>}
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
