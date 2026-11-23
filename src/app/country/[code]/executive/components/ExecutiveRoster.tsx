"use client";

import Link from "next/link";
import { OfficeholderPortrait } from "@/components/OfficeholderPortrait";

export interface RosterRow {
  /** Position label (e.g. "Treasury", "Foreign Affairs"). */
  role: string;
  holder: { name: string; href?: string; avatarUrl?: string } | null;
  pending?: boolean;
}

/**
 * Slim cabinet / State Council roster (locked composite) — officeholders as
 * dense rows beside the acts ledger, with inline vacancies and PENDING
 * nomination badges.
 */
export function ExecutiveRoster({
  title,
  rows,
  filled,
  total,
  footer,
  emptyText = "No positions configured.",
}: {
  title: string;
  rows: RosterRow[];
  filled?: number;
  total?: number;
  footer?: { href: string; label: string };
  /** Shown when there are no rows; callers say loading or unavailable rather than "none". */
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="flex items-baseline justify-between border-b border-card-border bg-card-muted px-4 py-2.5">
        <span className="text-body-sm font-medium text-muted">{title}</span>
        {filled !== undefined && total !== undefined && (
          <span className="font-mono text-[10px] text-muted/70">
            {filled} / {total}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm italic text-muted">{emptyText}</p>
      ) : (
        rows.map((row) => (
          <div
            key={row.role}
            className="flex items-center gap-2.5 border-b border-card-border/50 px-4 py-2 last:border-b-0"
          >
            <div className="min-w-0 flex-1 text-xs">
              <OfficeholderPortrait compact role={row.role} holder={row.holder} />
            </div>
            {row.pending && (
              <span className="rounded-full bg-info/10 px-1.5 py-px text-[8px] font-bold text-info">
                PENDING
              </span>
            )}
          </div>
        ))
      )}
      {footer && (
        <div className="px-4 py-2.5 text-xs">
          <Link
            href={footer.href}
            className="font-semibold text-primary transition-colors hover:text-primary-dark"
          >
            {footer.label} →
          </Link>
        </div>
      )}
    </div>
  );
}
