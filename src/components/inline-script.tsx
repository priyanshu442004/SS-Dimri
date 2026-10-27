"use client";

/**
 * A script that runs during HTML parsing (before first paint) on full page loads.
 * On the client it renders as text/plain, so React does not warn about rendering
 * <script> tags; suppressHydrationWarning covers the type mismatch.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
