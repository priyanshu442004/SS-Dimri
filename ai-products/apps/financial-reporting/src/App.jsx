import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import DashboardPage from "./pages/DashboardPage";
import UploadPage from "./pages/UploadPage";
import ProcessingPage from "./pages/ProcessingPage";
import ResultsPage from "./pages/ResultsPage";
import HistoryPage from "./pages/History";
import SettingsPage from "./pages/Settings";
import SupportPage from "./pages/Support";
import TrialBalancePreview from "./pages/TrialBalancePreview";
import ProcessTrialBalance from "./pages/ProcessTrialBalance";
import ResultTrialBalance from "./pages/ResultTrialBalance";
import FormatPL from "./formats/FormatPL";
import FormatCFS from "./formats/FormatCFS";
import FormatSOCE from "./formats/FormatSOCE";
import TBSummary from "./components/TBSummary";
import FormatBS from "./formats/FormatBS";
import Notes from "./pages/Notes";
import ResultNotes from "./pages/ResultNotes";
import BalanceSheet from "./pages/BalanceSheet";
import PL from "./pages/PL";
import AIAssistantPage from "./pages/AIAssistantPage";
import { ToastProvider } from "./context/ToastContext";
import Placeholder from "./pages/Placeholder";

// Trial Balance opens straight into the dashboard — there is no separate
// sign-in (access is through the Workflow Automation portal). Old landing / login URLs redirect.
const toDashboard = <Navigate to="/dashboard" replace />;

function AppContent() {
  return (
    <Routes>
      {["/", "/login", "/signup", "/pricing", "/about", "/features", "/profile"].map((p) => (
        <Route key={p} path={p} element={toDashboard} />
      ))}
      <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/upload" element={<UploadPage />} />
          <Route path="/dashboard/processing" element={<ProcessingPage />} />
          <Route path="/dashboard/trial-balance-preview" element={<TrialBalancePreview />} />
          <Route path="/dashboard/results" element={<ResultsPage />} />
          <Route path="/dashboard/history" element={<HistoryPage />} />
          <Route path="/dashboard/settings" element={<SettingsPage />} />
          <Route path="/dashboard/support" element={<SupportPage />} />
          <Route path="/dashboard/trial-balance/summary" element={<TBSummary />} />
          <Route path="/dashboard/PL" element={<FormatPL />} />
          <Route path="/dashboard/trial-balance/balance-sheet" element={<BalanceSheet />} />
          <Route path="/dashboard/trial-balance/profit-loss" element={<PL />} />
          <Route path="/dashboard/CFS" element={<FormatCFS />} />
          <Route path="/dashboard/trial-balance/notes" element={<Notes />} />
          <Route path="/dashboard/SOCE" element={<FormatSOCE />} />
          <Route path="/dashboard/trial-balance/balance-sheet/processed" element={<FormatBS />} />
          <Route path="/dashboard/trial-balance/profit-loss/processed" element={<FormatPL />} />
          <Route path="/dashboard/trial-balance/result-notes" element={<ResultNotes />} />
          <Route path="/dashboard/ai-assistant" element={<AIAssistantPage />} />
          <Route path="/dashboard/trial-balance/cash-flow" element={<FormatCFS />} />
          <Route path="/dashboard/working-sheets/soce" element={<FormatSOCE />} />
          <Route path="/dashboard/working-sheets/:sheet" element={<Placeholder />} />
          <Route path="/dashboard/*" element={<Placeholder notFound />} />
        </Route>

        <Route path="/process/trialBalance" element={<ProcessTrialBalance />} />
        <Route path="/process/trialBalance/results" element={<ResultTrialBalance />} />
        <Route path="*" element={<Placeholder notFound />} />
    </Routes>
  );
}

function App() {
  return (
    // basename = vite "base" (e.g. /app/financial-reporting) so every route/link is relative to it
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/[/]$/, "") || "/"}>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </BrowserRouter>
  );
}


export default App;
