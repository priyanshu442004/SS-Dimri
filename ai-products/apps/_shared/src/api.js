import { useCallback, useEffect, useState } from "react";

/** API root for an app served under a sub-path: "/ai-products/<slug>/api". */
export const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const isJson = res.headers.get("content-type")?.includes("json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error((isJson && body?.error) || `Request failed (${res.status})`);
  return body;
}

/** Fetch JSON on mount (and when `path` changes). */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    try { setState({ data: await api(path), error: null, loading: false }); }
    catch (e) { setState({ data: null, error: e.message, loading: false }); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export const fileUrl = (path) => `${API}${path}`;
