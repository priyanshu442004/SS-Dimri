import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import axios from "axios";
import { LayoutGrid, Upload, Settings, HelpCircle, FileSpreadsheet, Trash2, Bot, Scale } from "lucide-react";
import BrandMark from "./BrandMark";
import { useToast } from "../context/ToastContext";
import { apiUrl } from "../lib/apiPath";
import logoLight from "../../../_shared/src/assets/agarwal-saxena-logo-light.svg";

// Navy sidebar — same shell as the other Agarwal & Saxena product apps (apps/_shared AppShell).

const ActivePill = () => <span className="absolute inset-0 -z-10 rounded-xl bg-white/[0.08] ring-1 ring-white/10" />;

const SidebarLink = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14.5px] transition-colors ${active ? "text-paper" : "text-mist hover:text-paper"}`}
  >
    {active && <ActivePill />}
    <span className="shrink-0">{icon}</span>
    <span className="flex-1">{label}</span>
  </button>
);

const SidebarDropdown = ({ icon, label, items, navigate, currentPath }) => {
  const isActive = items.some((item) => currentPath === item.path);
  const [open, setOpen] = useState(isActive);
  const shown = open || isActive;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={shown}
        className={`relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14.5px] transition-colors ${isActive ? "text-paper" : "text-mist hover:text-paper"}`}
      >
        {isActive && <ActivePill />}
        <span className="shrink-0">{icon}</span>
        <span className="flex-1">{label}</span>
        <svg viewBox="0 0 20 20" className={`size-4 transition-transform ${shown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 8 4 4 4-4" /></svg>
      </button>
      {shown && (
        <div className="mb-1 ml-[22px] mt-1 space-y-0.5 border-l border-white/10 pl-3">
          {items.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${currentPath === item.path ? "bg-white/[0.08] text-lime" : "text-mist hover:text-paper"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SideBar = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(false);
  const [delLoading, setDelLoading] = useState(false);

  const handleDownload = async () => {
    try {
      setLoading(true);
      const response = await axios.get(apiUrl("/api/download/download-financials"), { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "Financial_Statements.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(error);
      showToast("Couldn't download the statements. Upload a trial balance first.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTB = async () => {
    if (!window.confirm("Are you sure you want to delete the current Trial Balance? All calculations will be cleared.")) return;
    try {
      setDelLoading(true);
      const response = await axios.delete(apiUrl("/api/trial-balance/delete"));
      if (response.data.success) {
        showToast("Trial Balance deleted successfully", "success");
        navigate("/dashboard/trial-balance/summary");
      } else {
        showToast("Delete failed: " + (response.data.message || "Unknown error"), "error");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      showToast("An error occurred while deleting the Trial Balance.", "error");
    } finally {
      setDelLoading(false);
    }
  };

  const spinner = <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;

  return (
    <aside className="sticky top-0 isolate flex h-screen w-[264px] shrink-0 flex-col overflow-y-auto bg-ink px-3 py-5 text-paper">
      <div className="grid-bg absolute inset-0 -z-10 opacity-60" aria-hidden />
      <div className="flex-1">
        <div className="px-2"><BrandMark /></div>

        <nav className="mt-7 space-y-1" aria-label="Main">
          <SidebarLink icon={<LayoutGrid className="size-[18px]" />} label="Dashboard" active={pathname === "/dashboard"} onClick={() => navigate("/dashboard")} />
          <SidebarLink icon={<Upload className="size-[18px]" />} label="Sales MIS" active={pathname === "/dashboard/upload"} onClick={() => navigate("/dashboard/upload")} />
          <SidebarDropdown
            icon={<Scale className="size-[18px]" />}
            label="Financial Statements"
            currentPath={pathname}
            navigate={navigate}
            items={[
              { label: "Trial Balance Summary", path: "/dashboard/trial-balance/summary" },
              { label: "Balance Sheet", path: "/dashboard/trial-balance/balance-sheet" },
              { label: "Profit & Loss Statement", path: "/dashboard/trial-balance/profit-loss" },
              { label: "Cash Flow Statement", path: "/dashboard/trial-balance/cash-flow" },
            ]}
          />
          <SidebarDropdown
            icon={<FileSpreadsheet className="size-[18px]" />}
            label="Working Sheets"
            currentPath={pathname}
            navigate={navigate}
            items={[
              { label: "AE", path: "/dashboard/working-sheets/ae" },
              { label: "WIP", path: "/dashboard/working-sheets/wip" },
              { label: "DTA", path: "/dashboard/working-sheets/dta" },
              { label: "SOCE", path: "/dashboard/working-sheets/soce" },
            ]}
          />
          <SidebarLink icon={<Bot className="size-[18px]" />} label="Ask AI" active={pathname === "/dashboard/ai-assistant"} onClick={() => navigate("/dashboard/ai-assistant")} />
          <SidebarLink icon={<HelpCircle className="size-[18px]" />} label="Support" active={pathname === "/dashboard/support"} onClick={() => navigate("/dashboard/support")} />
          <SidebarLink icon={<Settings className="size-[18px]" />} label="Settings" active={pathname === "/dashboard/settings"} onClick={() => navigate("/dashboard/settings")} />
        </nav>

        <div className="mx-1 mt-6 space-y-2">
          <button
            onClick={handleDownload}
            disabled={loading}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-transform ${loading ? "cursor-not-allowed bg-white/10 text-mist" : "bg-lime text-ink active:scale-[0.98]"}`}
          >
            {loading ? spinner : <FileSpreadsheet className="size-4" />}
            {loading ? "Downloading…" : "Download all statements"}
          </button>
          <button
            onClick={handleDeleteTB}
            disabled={delLoading}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm transition-colors ${delLoading ? "cursor-not-allowed border-white/10 text-mist" : "border-white/15 text-mist hover:border-[#f0a093]/60 hover:text-[#f0a093]"}`}
          >
            {delLoading ? spinner : <Trash2 className="size-4" />}
            {delLoading ? "Deleting…" : "Delete current TB"}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-1 border-t border-white/10 pt-4">
        <a href="/app/ai-products" target="_top" className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] text-mist transition-colors hover:text-paper">
          <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
          AI products
        </a>
        <div className="px-3 pt-1">
          <img src={logoLight} alt="Agarwal & Saxena — Chartered Accountants" className="h-7 w-auto opacity-90" width="2600" height="350" />
        </div>
      </div>
    </aside>
  );
};

export default SideBar;
