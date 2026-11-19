"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, RotateCw } from "lucide-react";
import { ProductIcon } from "../product-icon";

// Same-origin iframe of the product's own site. Height = the screen below the ERP's top bar
// (on phones also minus the breadcrumb row and the floating tab bar).
export function ProductFrame({ name, icon, src }: { name: string; icon: string; src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const reload = () => {
    setLoaded(false);
    frame.current?.contentWindow?.location.reload();
  };

  return (
    <div className="flex h-[calc(100dvh-4rem-2.75rem-5.5rem)] flex-col lg:h-[calc(100dvh-4rem)]">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 text-sm">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-night text-marigold"><ProductIcon name={icon} className="size-4" /></span>
          <Link href="/app/ai-products" className="hidden text-muted hover:text-ink sm:inline">AI products</Link>
          <span aria-hidden className="hidden text-ink/25 sm:inline">/</span>
          <span className="truncate font-medium text-ink">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={reload} title="Reload" aria-label="Reload" className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink">
            <RotateCw className="size-4" aria-hidden />
          </button>
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-ink transition-colors hover:border-ink/30">
            <span className="hidden sm:inline">Open in new tab</span>
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {!loaded && (
          <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-canvas">
            <p className="flex items-center gap-2 text-sm text-muted">
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" />
              Loading {name}…
            </p>
          </div>
        )}
        <iframe
          ref={frame}
          src={src}
          title={name}
          onLoad={() => setLoaded(true)}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      </div>
    </div>
  );
}
