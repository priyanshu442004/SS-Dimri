import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { MessageCircle, Mail, Send, Search, HelpCircle, ChevronDown, Loader2, Upload, FileSpreadsheet, Bot, History } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { apiUrl } from "../lib/apiPath";

const card = "bg-white p-4 sm:p-6 md:p-8 rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-[#dde3da]";
const input = "w-full px-4 py-3 border-2 border-[#dde3da] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0b1a33]/20 focus:border-[#0b1a33] transition-all";

const FAQ = [
  { q: "Which file do I upload?", a: "The raw trial balance exported from your accounting system, as Excel (.xlsx / .xls) or CSV. Upload it from Trial Balance → Summary. The header row is detected automatically." },
  { q: "What does Trial Balance generate from the trial balance?", a: "Every ledger is classified to a Schedule III head, then the Balance Sheet, Statement of Profit & Loss, the notes to accounts and the TB summary are built. Cash Flow and Statement of Changes in Equity are available under Trial Balance and Working Sheets." },
  { q: "How are ledgers classified?", a: "Known ledgers are mapped by rules; any ledger the rules can't place is classified by AI (DeepSeek) into the right Balance Sheet head and group, so the statements always balance back to the trial balance." },
  { q: "Who receives the report email?", a: "Once per uploaded trial balance, the Balance Sheet and Profit & Loss (.xlsx) are emailed to the finance team configured on the server. Re-uploading the same file within 12 hours doesn't send a duplicate. See Settings → Report email for the recipients." },
  { q: "How do I download the statements?", a: "Each statement page has a Download button for Excel. 'Download All Statements' gives one workbook with the Balance Sheet, P&L, TB summary and every note." },
  { q: "What can the AI Assistant answer?", a: "Questions about the statements generated from your current trial balance: totals, movements between periods, ratios (current ratio, debt-to-equity, ROE, margins) and board-level summaries. It cites the statement or note each figure comes from and says so when something isn't in the data." },
  { q: "Where can I see what has been processed?", a: "History lists every upload, generated statement, download and report email with its time, duration and status. The dashboard shows the same activity as totals." },
  { q: "Is my data secure?", a: "Files are processed on our server over HTTPS and are only sent to the AI model for ledger classification and assistant questions. Report emails go only to the configured recipients." },
];

const LINKS = [
  { icon: Upload, title: "Upload a trial balance", desc: "Start a new set of statements", to: "/dashboard/trial-balance/summary" },
  { icon: FileSpreadsheet, title: "Balance Sheet", desc: "View and download", to: "/dashboard/trial-balance/balance-sheet" },
  { icon: Bot, title: "AI Assistant", desc: "Ask about your financials", to: "/dashboard/ai-assistant" },
  { icon: History, title: "Activity history", desc: "Uploads, downloads and emails", to: "/dashboard/history" },
];

const SupportPage = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", topic: "General question", message: "" });
  const [sending, setSending] = useState(false);

  const faqs = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(t)) : FAQ;
  }, [q]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return showToast("Enter a valid email address so we can reply.", "error");
    if (form.message.trim().length < 10) return showToast("Please describe the issue (at least 10 characters).", "error");
    setSending(true);
    try {
      await axios.post(apiUrl("/api/mail/support"), {
        name: form.name.trim(), email: form.email.trim(), topic: form.topic, message: form.message.trim(),
      });
      showToast("Message sent. The team will reply to your email.", "success");
      setForm((f) => ({ ...f, message: "" }));
    } catch (err) {
      showToast(err.response?.data?.error || "Couldn't send your message. Please try again in a minute.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-full bg-gradient-to-br from-[#f3f5f1] via-blue-50/20 to-purple-50/20 font-sans">
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between bg-white/80 backdrop-blur-xl px-6 py-4 shadow-sm border-b border-[#dde3da]/50">
          <h1 className="text-lg font-semibold text-[#0b1a33] tracking-[-0.01em]">Support</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
          <div className="max-w-4xl mx-auto w-full space-y-6">
            <div className={card}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#566176] w-5 h-5" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help articles…" className={`${input} pl-10 py-2.5`} />
              </div>
            </div>

            <div className={card}>
              <div className="flex items-center gap-3 mb-6">
                <HelpCircle className="w-6 h-6 text-[#0b1a33]" />
                <h2 className="text-lg font-semibold text-[#0b1a33]">Frequently asked questions</h2>
              </div>
              {faqs.length === 0 && <p className="text-sm text-[#566176]">No articles match “{q}”. Send us a message below.</p>}
              <div className="space-y-3">
                {faqs.map((f) => (
                  <div key={f.q} className="border-2 border-[#dde3da] rounded-xl hover:border-[#0b1a33]/30 transition-all">
                    <button onClick={() => setOpen(open === f.q ? null : f.q)} className="w-full flex items-center justify-between gap-4 p-4 text-left">
                      <span className="font-semibold text-[#0b1a33]">{f.q}</span>
                      <ChevronDown className={`w-5 h-5 text-[#9aa7bd] flex-shrink-0 transition-transform ${open === f.q || q ? "rotate-180" : ""}`} />
                    </button>
                    {(open === f.q || q) && <p className="px-4 pb-4 -mt-1 text-sm text-[#566176] leading-[1.6]">{f.a}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <div className="flex items-center gap-3 mb-4">
                <MessageCircle className="w-6 h-6 text-[#0b1a33]" />
                <h2 className="text-lg font-semibold text-[#0b1a33]">Contact support</h2>
              </div>
              <p className="text-[#566176] mb-4 leading-[1.6]">
                Your message goes to the Agarwal & Saxena team by email; we reply to the address you enter.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold text-[#0b1a33] mb-2">Your name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} className={input} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#0b1a33] mb-2">Your email</label>
                    <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} className={input} placeholder="name@company.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0b1a33] mb-2">Topic</label>
                  <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className={input}>
                    {["General question", "Trial balance upload", "Statements / classification", "Report email", "AI Assistant", "Account & sign-in"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0b1a33] mb-2">Your message</label>
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} maxLength={5000}
                    className={`${input} resize-none`} placeholder="Describe your issue or question…" />
                </div>
                <button type="submit" disabled={sending}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#0b1a33] to-[#4fb3ac] text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50 transition-all">
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Send message
                </button>
              </form>
            </div>

            <div className={card}>
              <h2 className="text-lg font-semibold text-[#0b1a33] mb-4">Quick links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LINKS.map((l) => (
                  <button key={l.to} onClick={() => navigate(l.to)}
                    className="text-left border-2 border-[#dde3da] rounded-xl p-4 hover:bg-[#eef6f5] hover:border-[#0b1a33]/30 transition-all">
                    <div className="flex items-center gap-3 mb-1"><l.icon className="w-5 h-5 text-[#0b1a33]" /><span className="font-semibold text-[#0b1a33]">{l.title}</span></div>
                    <p className="text-sm text-[#566176]">{l.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-ink text-paper p-4 sm:p-6 md:p-8 rounded-[20px]">
              <div className="flex items-center gap-3 mb-3"><Mail className="w-6 h-6" /><h2 className="text-lg font-semibold">Still need help?</h2></div>
              <p className="leading-[1.6]">
                Use the form on this page — your message goes to the Agarwal &amp; Saxena team by email and we reply to the address you enter.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SupportPage;
