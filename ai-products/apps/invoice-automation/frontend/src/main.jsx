import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/funnel-display";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { AppShell, NotFound } from "@shared/ui";
import Overview from "./pages/Overview";
import NewBatch from "./pages/NewBatch";
import History from "./pages/History";
import BatchDetail from "./pages/BatchDetail";
import Help from "./pages/Help";
import Settings from "./pages/Settings";
import Ask from "./pages/Ask";

const product = { name: "Invoice Automation", tagline: "Agarwal & Saxena", icon: "invoice" };
const nav = [
  { to: "/", label: "Overview", icon: "overview", end: true },
  { to: "/new", label: "Process invoices", icon: "plus" },
  { to: "/runs", label: "Batches", icon: "history" },
  { to: "/chat", label: "Ask AI", icon: "ai" },
  { to: "/help", label: "Help & checks", icon: "help" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Routes>
          <Route element={<AppShell product={product} nav={nav} cta={{ to: "/new", label: "Process invoices" }} />}>
            <Route index element={<Overview />} />
            <Route path="new" element={<NewBatch />} />
            <Route path="runs" element={<History />} />
            <Route path="runs/:id" element={<BatchDetail />} />
            <Route path="chat" element={<Ask />} />
            <Route path="chat/:id" element={<Ask />} />
            <Route path="help" element={<Help />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>
);
