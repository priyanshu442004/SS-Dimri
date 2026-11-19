import { ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { apiUrl } from "../lib/apiPath";


interface Section {
  title: string;
  children?: {
    title: string;
  }[];
}

const Notes = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const sections: Section[] = [
    { title: "4. Property, Plant & Equipment and Other Intangible Assets" },
    { title: "5. Capital Work In Progress" },
    {
      title: "6. Financial Assets",
      children: [
        { title: "6(a). Investments" },
        { title: "6(b). Loans" },
        { title: "6(c). Other Financial Assets" },
      ],
    },
    { title: "7. Deferred Tax Assets (Net)" },
    { title: "8. Other Non-Current Assets" },
    { title: "9. Inventories" },
    {
      title: "10. Financial Assets",
      children: [
        { title: "10(a). Trade Receivables" },
        { title: "10(b). Cash and Cash Equivalents" },
        { title: "10(c). Bank Balances Other Than Above" },
        { title: "10(d). Other Financial Assets" },
      ],
    },
    { title: "11. Other Current Assets" },
    {
      title: "12. Equity Share Capital",
      children: [{ title: "12(a). Other Equity" }],
    },
    {
      title: "13. Financial Liabilities",
      children: [{ title: "13(a). Borrowings" }],
    },
    { title: "14. Provisions" },
    {
      title: "15. Financial Liabilities",
      children: [
        { title: "15(a). Borrowings" },
        { title: "15(b). Trade Payables" },
        { title: "15(c). Other Financial Liabilities" },
      ],
    },
    { title: "16. Other Current Liabilities" },
    { title: "17. Provisions" },

    // ── P&L Notes ──
    { title: "18. Revenue From Operations" },
    { title: "19. Other Income" },
    { title: "20. Cost of Construction" },
    { title: "21. Changes in Inventories" },
    { title: "22. Employee Benefit Expense" },
    { title: "23. Finance Costs" },
    { title: "24. Depreciation and Amortization Expense" },
    { title: "25. Other Expenses" },
    { title: "26. Tax Expense" },
  ];

  // Extract "6" or "6a" or "10c"
  const extractSectionCode = (title: string): string | null => {
    const match = title.match(/^(\d+)(?:\((\w)\))?/);
    if (!match) return null;

    return match[2] ? `${match[1]}${match[2]}` : match[1];
  };

  const handleOpenModal = (title: string) => {
    const code = extractSectionCode(title);
    if (code) setSelectedSection(code);
    setIsModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "csv"].includes(ext || "")) {
      showToast("Only Excel (.xlsx) or CSV (.csv) files are allowed.", "error");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedSection) {
      showToast("Please select a file and section.", "error");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("notePoint", selectedSection);

    try {
      const res = await fetch(
        apiUrl("/api/notes/notesToProcess"),
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.log(errorText);
        throw new Error("Upload failed");
      }

      const data = await res.json();

      setIsModalOpen(false);
      setSelectedFile(null);
      navigate("/dashboard/trial-balance/result-notes", {
        state: { data: data.data }
      });
    } catch (err) {
      console.error(err);
      showToast("Upload error. Please try again.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#0b1a33] mb-8">
          Trial Balance Sections
        </h1>

        <div className="space-y-5">
          {sections.map((section, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-[#dde3da] shadow-sm"
            >
              <div
                onClick={() => handleOpenModal(section.title)}
                className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[#f3f5f1]"
              >
                <span className="font-medium text-[#0b1a33]">
                  {section.title}
                </span>
                <ChevronRight className="w-5 h-5 text-[#9aa7bd]" />
              </div>

              {section.children && (
                <div className="border-t border-[#dde3da] bg-[#f3f5f1]/50">
                  {section.children.map((child, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleOpenModal(child.title)}
                      className="flex items-center justify-between px-10 py-3 text-sm cursor-pointer hover:bg-white"
                    >
                      <span className="text-[#3a4659]">
                        {child.title}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#9aa7bd]" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>

            <h2 className="text-2xl font-semibold mb-6">
              Upload Excel or CSV File
            </h2>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileChange}
              />

              {selectedFile && (
                <p className="text-sm text-green-600 mt-3">
                  Selected: {selectedFile.name}
                </p>
              )}

              <p className="text-sm text-gray-500 mt-3">
                Supported formats: .xlsx, .csv
              </p>
            </div>

            <button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className={`mt-6 w-full py-3 rounded-xl text-lg font-medium ${!selectedFile || isUploading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
            >
              {isUploading ? "Uploading..." : "Upload & Continue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notes;