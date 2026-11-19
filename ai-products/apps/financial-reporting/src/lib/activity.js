// Activity feed from the backend (/api/activity): dashboard stats, recent uploads,
// notifications and the History page. Read/dismissed state is per browser.
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { apiUrl } from "./apiPath";

const SEEN = "fr.notifications.seen";
const HIDDEN = "fr.notifications.hidden";
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDuration(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

export function useActivity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState(() => load(SEEN, []));
  const [hidden, setHidden] = useState(() => load(HIDDEN, []));

  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get(apiUrl("/api/activity"));
      setData(data);
      setError("");
    } catch {
      setError("Couldn't load activity — the Trial Balance server is not reachable.");
      setData((d) => d || { stats: { documentsProcessed: 0, filesToday: 0, avgProcessingMs: null, successRate: null, total: 0 }, uploads: [], events: [] });
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const notifications = useMemo(() => (data?.events || [])
    .filter((e) => !hidden.includes(e.id))
    .slice(0, 15)
    .map((e) => ({
      id: e.id, at: e.at, title: e.title, read: seen.includes(e.id),
      type: !e.ok ? "warning" : e.kind === "email" || e.kind === "process" ? "success" : "info",
      message: [e.file, e.detail].filter(Boolean).join(" · ") || "Completed",
    })), [data, seen, hidden]);

  const markAsRead = (id) => { const v = [...new Set([...seen, id])].slice(-500); setSeen(v); save(SEEN, v); };
  const markAllAsRead = () => { const v = [...new Set([...seen, ...notifications.map((n) => n.id)])].slice(-500); setSeen(v); save(SEEN, v); };
  const deleteNotification = (id) => { const v = [...hidden, id].slice(-500); setHidden(v); save(HIDDEN, v); };

  return { data, error, refresh, notifications, markAsRead, markAllAsRead, deleteNotification };
}
