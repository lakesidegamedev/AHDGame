"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * On a phone, folds a sidebar section to one row with a headline value. From
 * the lg breakpoint up the body always shows and the toggle is hidden.
 */
export function CollapsibleSection({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2.5 border-b border-card-border text-left lg:hidden"
      >
        <span className="text-[15px] font-semibold text-foreground">{title}</span>
        {summary != null && (
          <span className="ml-auto font-mono text-xs tabular-nums text-muted">{summary}</span>
        )}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 shrink-0 text-muted ${summary == null ? "ml-auto" : ""} ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M5.2 7.2a.8.8 0 011.1 0L10 11.2l3.7-4a.8.8 0 111.1 1.1l-4.3 4.5a.8.8 0 01-1.1 0L5.2 8.3a.8.8 0 010-1.1z" />
        </svg>
      </button>
      <div id={bodyId} className={`${open ? "block" : "hidden"} pt-2.5 lg:block lg:pt-0`}>
        {children}
      </div>
    </section>
  );
}
