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
import NewAnalysis from "./pages/NewAnalysis";
import History from "./pages/History";
import Workspace from "./pages/Workspace";
import Help from "./pages/Help";
import Settings from "./pages/Settings";
import Ask from "./pages/Ask";

const product = { name: "Financial Statement Analysis", tagline: "Agarwal & Saxena", icon: "cfo" };
const nav = [
  { to: "/", label: "Overview", icon: "overview", end: true },
  { to: "/new", label: "New analysis", icon: "plus" },
  { to: "/runs", label: "Companies", icon: "history" },
  { to: "/chat", label: "Ask AI", icon: "ai" },
  { to: "/help", label: "Help & documents", icon: "help" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Routes>
          <Route element={<AppShell product={product} nav={nav} cta={{ to: "/new", label: "New analysis" }} />}>
            <Route index element={<Overview />} />
            <Route path="new" element={<NewAnalysis />} />
            <Route path="runs" element={<History />} />
            <Route path="runs/:id" element={<Workspace />} />
            <Route path="runs/:id/:tab" element={<Workspace />} />
            <Route path="chat" element={<Ask />} />
            <Route path="help" element={<Help />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>
);
