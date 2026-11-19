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
import NewCase from "./pages/NewCase";
import Cases from "./pages/Cases";
import CaseWorkspace from "./pages/CaseWorkspace";
import Ask from "./pages/Ask";
import Help from "./pages/Help";
import Settings from "./pages/Settings";

const product = { name: "GST Reconciliation", tagline: "Agarwal & Saxena", icon: "gst" };
const nav = [
  { to: "/", label: "Overview", icon: "overview", end: true },
  { to: "/new", label: "New case", icon: "plus" },
  { to: "/cases", label: "Cases", icon: "folder" },
  { to: "/chat", label: "Ask AI", icon: "ai" },
  { to: "/help", label: "Help & formats", icon: "help" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Routes>
          <Route element={<AppShell product={product} nav={nav} cta={{ to: "/new", label: "New case" }} />}>
            <Route index element={<Overview />} />
            <Route path="new" element={<NewCase />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:id" element={<CaseWorkspace />} />
            <Route path="cases/:id/:tab" element={<CaseWorkspace />} />
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
