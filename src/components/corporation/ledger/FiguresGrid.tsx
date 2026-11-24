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
const MD_SPAN: Record<number, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};
const LG_SPAN: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
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
  // A short set (a private company has fewer figures) left an empty slot that
  // showed as a dark block. The last cell stretches across whatever is left.
  const fill = (perRow: number | undefined): number => {
    if (!perRow) return 0;
    const slots = cells.reduce((n, c) => n + (c.lead ? 2 : 1), 0);
    const rows = Math.ceil(slots / perRow);
    // The lead cell takes one column on each of the first two rows.
    return rows * perRow - slots;
  };
  const lastSpan = `${MD_SPAN[1 + fill(columns.md)] ?? ""} ${LG_SPAN[1 + fill(columns.lg)] ?? ""}`;
  return (
    <dl
      className={`m-0 grid gap-px overflow-hidden rounded-[var(--corp-rad,6px)] border border-card-border bg-card-border ${cols} ${className}`}
    >
      {cells.map((c, i) => (
        <div
          key={c.key}
          title={c.title}
          className={`flex min-w-0 flex-col justify-between gap-1.5 px-3.5 py-3 ${
            c.lead ? "bg-card md:row-span-2 md:justify-center" : "bg-background"
          } ${i === cells.length - 1 && !c.lead ? lastSpan : ""}`}
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
