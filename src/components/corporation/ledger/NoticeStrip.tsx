import type { ReactNode } from "react";

export type NoticeTone = "warning" | "error" | "info";

const FRAME: Record<NoticeTone, string> = {
  warning: "border-warning/45 bg-warning/[0.06]",
  error: "border-error/45 bg-error/[0.06]",
  info: "border-card-border bg-card",
};

const TAG: Record<NoticeTone, string> = {
  warning: "bg-warning text-background",
  error: "bg-error text-background",
  info: "border border-card-border text-foreground",
};

/**
 * One notice above the tabs: a short tag, the message, and at most one action.
 * Every notice on the page uses this frame so they read as one system.
 */
export function NoticeStrip({
  tone,
  tag,
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  tone: NoticeTone;
  tag: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-wrap items-start gap-x-3.5 gap-y-2 rounded-[var(--corp-rad,6px)] border px-3 py-2.5 text-[13px] leading-relaxed ${FRAME[tone]}`}
    >
      <span
        className={`mt-0.5 shrink-0 rounded-[3px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${TAG[tone]}`}
      >
        {tag}
      </span>
      <div className="min-w-0 flex-[1_1_18rem] text-foreground">{children}</div>
      {(action || onDismiss) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className="inline-flex h-7 items-center rounded-[calc(var(--corp-rad,6px)-2px)] px-2 text-xs text-muted hover:bg-card-elevated hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
