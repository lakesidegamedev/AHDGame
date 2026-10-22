import type { ReactNode } from "react";

/** A holding "stub": a sunk card with a perforated line between header and body. */
export function LedgerTicket({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--corp-rad,6px)] border border-card-border bg-card-muted">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      <div className="relative border-t border-dashed border-card-border px-4 pb-4 pt-3.5">
        <span
          aria-hidden
          className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-card-border bg-card"
        />
        <span
          aria-hidden
          className="absolute -right-2 -top-2 h-4 w-4 rounded-full border border-card-border bg-card"
        />
        {children}
      </div>
    </section>
  );
}
