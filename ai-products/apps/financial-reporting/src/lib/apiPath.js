// Prefixes backend paths with the app's deploy base (vite `base`), so
// "/api/x" -> "/app/financial-reporting/api/x" in production and "/api/x" when served at root.
const BASE = import.meta.env.BASE_URL.replace(/[/]$/, "");
export const apiUrl = (p) => `${BASE}${p}`;
