"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatPercentDelta } from "@/lib/ui/numbers";
import { toneForDelta, toneText } from "@/lib/ui/tone";
export { vsBasePct } from "@/lib/market/overviewPreview";

export function pctText(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return formatPercentDelta(value, digits);
}

export function toneClass(value: number | null | undefined): string {
  return toneText(toneForDelta(value));
}

export function PanelState({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading)
    return (
      <p role="status" className="py-6 text-body text-muted">
        Loading...
      </p>
    );
  if (error) {
    return (
      <p role="alert" className="py-6 text-body text-error">
        {error}
      </p>
    );
  }
  if (empty) return <p className="py-6 text-body text-muted">{emptyText ?? "Nothing here yet."}</p>;
  return <>{children}</>;
}

/** Overview card: a short list and a link into the full tab. */
export function PreviewCard({
  title,
  detail,
  href,
  loading,
  error,
  empty,
  children,
}: {
  title: string;
  detail?: string;
  href: string;
  loading: boolean;
  error: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-card-border bg-card p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-heading font-bold text-foreground">{title}</h2>
        <Link href={href} className="text-body-sm font-medium text-primary hover:underline">
          See all
        </Link>
      </div>
      {detail && <p className="mt-0.5 text-body-sm text-muted">{detail}</p>}
      <div className="mt-2">
        <PanelState loading={loading} error={error} empty={empty} emptyText="None right now.">
          {children}
        </PanelState>
      </div>
    </section>
  );
}

export function PreviewRow({
  href,
  left,
  right,
  rightTone,
  note,
}: {
  href?: string;
  left: ReactNode;
  right: ReactNode;
  rightTone?: string;
  note?: string | null;
}) {
  const inner = (
    <>
      <span className="min-w-0 text-body text-foreground">
        <span className="block truncate">{left}</span>
        {note && <span className="block text-body-sm text-muted">{note}</span>}
      </span>
      <span
        className={`shrink-0 text-body font-medium tabular-nums ${rightTone ?? "text-foreground"}`}
      >
        {right}
      </span>
    </>
  );
  const cls =
    "flex items-center justify-between gap-3 border-b border-card-border/50 py-1.5 last:border-b-0";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-card-elevated`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
