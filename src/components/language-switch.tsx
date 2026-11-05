"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Languages } from "lucide-react";
import { LANG_COOKIE, currentLocale, type Locale } from "@/lib/i18n";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the language on this device and load the page again in it. */
function switchLanguage(next: Locale) {
  // Secure cookies are dropped on plain-http development servers.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  window.document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
  window.location.reload();
}

/** English / हिन्दी switch. */
export function LanguageSwitch({ dark = false }: { dark?: boolean }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const current = currentLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the cookie is only readable in the browser
    setLocale(current);
    document.documentElement.lang = current === "hi" ? "hi" : "en-IN";
  }, []);

  const btn = (value: Locale, text: string, lang: string) => (
    <button
      type="button"
      lang={lang}
      onClick={() => { if (value !== locale) switchLanguage(value); }}
      aria-pressed={locale === value}
      className={clsx(
        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
        locale === value ? (dark ? "bg-white/15 text-white" : "bg-ink text-paper") : dark ? "text-white/60 hover:text-white" : "text-muted hover:text-ink",
      )}
    >
      {text}
    </button>
  );

  return (
    <span role="group" aria-label="Language" className={clsx("inline-flex items-center gap-0.5 rounded-lg border p-0.5", dark ? "border-white/15" : "border-line bg-surface")}>
      <Languages aria-hidden className={clsx("mx-1 hidden size-3.5 sm:block", dark ? "text-white/50" : "text-muted")} />
      {btn("en", "EN", "en")}
      {btn("hi", "हिन्दी", "hi")}
    </span>
  );
}
