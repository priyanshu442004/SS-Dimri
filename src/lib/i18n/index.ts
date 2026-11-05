import { currentLocale } from "./locale";
import { translateText } from "./translate";

export { LANG_COOKIE, type Locale } from "./translate";
export { currentLocale };

/** Interface text outside JSX (confirm boxes, alerts). JSX text is translated automatically. */
export function t(text: string): string {
  return currentLocale() === "hi" ? translateText(text) : text;
}
