import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge class names
 * Combines clsx for conditional classes and tailwind-merge for Tailwind class conflicts
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

