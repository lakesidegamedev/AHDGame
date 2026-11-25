"use client";

import { parseInfobox } from "@/lib/wiki/rules/embedTags";

const HEADINGS = {
  politician: "Politician",
  party: "Party",
  corporation: "Corporation",
} as const;

/** Right-hand summary box. Rows left blank by the writer are not shown. */
export function WikiInfobox({ data }: { data?: string }) {
  const { type, rows } = parseInfobox(data ?? "");
  if (!type || rows.length === 0) return null;
  const [first, ...rest] = rows;
  const title = first?.label.toLowerCase() === "name" ? first.value : null;
  const body = title ? rest : rows;
  return (
    <aside
      aria-label={`${HEADINGS[type]} summary`}
      className="mb-4 w-full rounded-lg border border-card-border bg-card/60 text-body sm:float-right sm:clear-right sm:ml-4 sm:w-64"
    >
      <div className="rounded-t-lg border-b border-card-border bg-card-elevated px-3 py-2 text-center font-semibold text-foreground">
        {title ?? HEADINGS[type]}
      </div>
      <dl className="divide-y divide-card-border">
        {body.map((row) => (
          <div key={row.label} className="grid grid-cols-[6rem_1fr] gap-2 px-3 py-1.5">
            <dt className="text-muted">{row.label}</dt>
            <dd className="break-words text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
