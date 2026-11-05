// The current locale, readable synchronously from any render (server or browser).
//
// React's JSX runtime has to decide while the element is being created, so it cannot
// await cookies(). On the server the request's cookies are read from the same
// async-local store cookies() uses. `next` is pinned to an exact version, and an
// unexpected shape simply falls back to English (tests/e2e covers the Hindi path).

import { isTranslatedPath, parseLangCookie, type Locale } from "./translate";

type RequestLike = { cookies?: { get?: (name: string) => { value?: string } | undefined }; url?: { pathname?: string } };

let serverStore: { getStore: () => unknown } | null = null;

function serverLocale(): Locale {
  try {
    if (!serverStore) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      serverStore = require("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage;
    }
    const store = serverStore?.getStore() as RequestLike | undefined;
    if (!store?.cookies || typeof store.cookies.get !== "function") return "en"; // prerender: no request
    if (store.url?.pathname && !isTranslatedPath(store.url.pathname)) return "en";
    return store.cookies.get("ss_lang")?.value === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

// Choosing a language reloads the page, so the cookie is read once per load: this runs
// for every JSX element and document.cookie is comparatively slow.
let browserChoice: Locale | null = null;

function browserLocale(): Locale {
  browserChoice ??= parseLangCookie(document.cookie);
  return browserChoice === "hi" && isTranslatedPath(window.location.pathname) ? "hi" : "en";
}

export function currentLocale(): Locale {
  return typeof window === "undefined" ? serverLocale() : browserLocale();
}
