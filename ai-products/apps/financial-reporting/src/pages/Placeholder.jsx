import { useNavigate, useParams } from "react-router-dom";
import { Construction, SearchX } from "lucide-react";

const SHEET_NAMES = { ae: "Adjustment Entries (AE)", wip: "Work in Progress (WIP)", dta: "Deferred Tax Asset (DTA)" };

/** Shown for working sheets that aren't built yet, and for unknown URLs (notFound). */
const Placeholder = ({ notFound = false }) => {
  const navigate = useNavigate();
  const { sheet } = useParams();
  const Icon = notFound ? SearchX : Construction;
  const title = notFound ? "Page not found" : `${SHEET_NAMES[sheet] || "This working sheet"} is in progress`;
  const body = notFound
    ? "The link may be old or mistyped."
    : "This working sheet is being built. Its figures are already applied inside the generated Balance Sheet and Profit & Loss.";

  return (
    <div className="flex-1 min-h-[70vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center bg-white rounded-3xl shadow-xl border border-gray-100 p-10">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Icon className="w-7 h-7 text-indigo-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{body}</p>
        <button
          onClick={() => navigate("/dashboard")}
          className="mt-6 inline-flex items-center px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
};

export default Placeholder;
