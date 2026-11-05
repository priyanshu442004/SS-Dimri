// Hindi text for the signed-in portals, by area. The public website stays in English.
// See translate.ts for how entries and patterns are matched.

import { HI_ADMIN } from "./hi-admin";
import { HI_COMMON } from "./hi-common";
import { HI_TRACKER } from "./hi-tracker";
import { HI_WORK } from "./hi-work";

export const HI: Record<string, string> = { ...HI_TRACKER, ...HI_ADMIN, ...HI_WORK, ...HI_COMMON };
