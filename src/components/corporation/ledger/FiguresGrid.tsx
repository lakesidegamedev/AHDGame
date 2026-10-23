import type { ReactNode } from "react";

export interface FigureCell {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  meter?: ReactNode;
  title?: string;
  /** Spans two rows from the md breakpoint, for the one figure that leads. */
  lead?: boolean;
}

const MD: Record<number, string> = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
};
const LG: Record<number, string> = {
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/** A grid of label / value cells divided by hairlines, with rounded outer corners. */
export function FiguresGrid({
  cells,
  columns,
  className = "",
}: {
  cells: FigureCell[];
  columns: { base: 2; md?: number; lg?: number };
  className?: string;
}) {
  const cols = `grid-cols-2 ${columns.md ? (MD[columns.md] ?? "") : ""} ${
    columns.lg ? (LG[columns.lg] ?? "") : ""
  }`;
  return (
    <dl
      className={`m-0 grid gap-px overflow-hidden rounded-[var(--corp-rad,6px)] border border-card-border bg-card-border ${cols} ${className}`}
    >
      {cells.map((c) => (
        <div
          key={c.key}
          title={c.title}
          className={`flex min-w-0 flex-col justify-between gap-1.5 px-3.5 py-3 ${
            c.lead ? "bg-card md:row-span-2 md:justify-center" : "bg-background"
          }`}
        >
          <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            {c.label}
          </dt>
          <dd
            className={`m-0 truncate font-mono font-semibold tabular-nums text-foreground ${
              c.lead ? "text-3xl tracking-tight" : "text-lg"
            }`}
          >
            {c.value}
          </dd>
          {c.meter}
          {c.sub != null && <dd className="m-0 text-xs text-muted">{c.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
