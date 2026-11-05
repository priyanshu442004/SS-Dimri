"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "md", "print:hidden")}>
      <Printer className="size-4" aria-hidden /> Print / save as PDF
    </button>
  );
}
