import { currentLocale } from "./locale";
import { translateText } from "./translate";

// Props that hold visible or spoken text on any element.
const TEXT_PROPS = ["placeholder", "title", "aria-label", "alt"] as const;
// Text inside these is code or data, never interface wording.
const SKIP = new Set<unknown>(["script", "style", "textarea", "code", "pre"]);

function translateNode(node: unknown): unknown {
  if (typeof node === "string") return translateText(node);
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((n) => {
      const r = translateNode(n);
      if (r !== n) changed = true;
      return r;
    });
    return changed ? next : node;
  }
  return node;
}

/** Translates an element's text before React sees it. In English this is one comparison. */
export function translateProps<P>(type: unknown, props: P): P {
  if (SKIP.has(type) || !props || currentLocale() !== "hi") return props;
  const p = props as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  if (p.children !== undefined) {
    const c = translateNode(p.children);
    if (c !== p.children) out = { ...p, children: c };
  }
  for (const k of TEXT_PROPS) {
    const v = p[k];
    if (typeof v === "string") {
      const r = translateText(v);
      if (r !== v) (out ??= { ...p })[k] = r;
    }
  }
  return (out ?? props) as P;
}
