import { Fragment, jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { translateProps } from "./runtime-core";

export { Fragment };
export type { JSX } from "react/jsx-dev-runtime";

export const jsxDEV: typeof reactJsxDEV = (type, props, key, isStatic, source, self) =>
  reactJsxDEV(type, translateProps(type, props), key, isStatic, source, self);
