import type { Metadata, Viewport } from "next";
import { InlineScript } from "@/components/inline-script";
import { Toaster } from "@/components/toaster";
import "./globals.css";

// Runs before first paint: marks the document as motion-capable so scroll reveals
// start hidden instead of flashing. If the motion script never starts (blocked JS,
// hydration failure), the flag is removed after 3 s so content is never left hidden.
const MOTION_BOOT = `(function(){var d=document.documentElement;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.setAttribute('data-motion','');setTimeout(function(){if(!d.hasAttribute('data-motion-ready'))d.removeAttribute('data-motion')},3000)})();`;

export const metadata: Metadata = {
  title: { default: "S S Dimri & Associates", template: "%s · S S Dimri & Associates" },
  description:
    "S S Dimri & Associates, Naraina Industrial Area, New Delhi — accounting, GST, income tax, TDS, audit and compliance services.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3d62" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <InlineScript html={MOTION_BOOT} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
