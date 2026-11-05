import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";
import { translateProps } from "./runtime-core";

// Project-wide JSX runtime (tsconfig "jsxImportSource"): identical to React's,
// with interface text translated when the signed-in user has chosen Hindi.
export { Fragment };
export type { JSX } from "react/jsx-runtime";

export const jsx: typeof reactJsx = (type, props, key) => reactJsx(type, translateProps(type, props), key);
export const jsxs: typeof reactJsxs = (type, props, key) => reactJsxs(type, translateProps(type, props), key);
