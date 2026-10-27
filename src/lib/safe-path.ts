/**
 * Accepts only same-site app paths ("/app…" or "/client…"); rejects
 * protocol-relative ("//host"), backslash and absolute URLs so stored or
 * user-supplied links can never redirect off-site.
 */
export function safeAppPath(path: string | null | undefined, area: "app" | "client"): string | null {
  if (!path || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return null;
  const re = area === "client" ? /^\/client(\/(?!\/)|\?|#|$)/ : /^\/app(\/(?!\/)|\?|#|$)/;
  return re.test(path) ? path : null;
}
