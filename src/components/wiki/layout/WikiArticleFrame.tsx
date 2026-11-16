import type { ReactNode } from "react";
import { extractWikiGlance, type GlanceRow } from "@/lib/wiki/rules/glance";
import type { WikiHeading } from "@/lib/wiki/headings";
import { WikiContentsList } from "@/components/wiki/layout/WikiContentsList";

function GlanceTable({ rows }: { rows: GlanceRow[] }) {
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-card-border/60 last:border-b-0">
            <td className="w-[46%] py-1.5 pr-2 align-top text-muted">{r.label}</td>
            <td className="py-1.5 align-top font-medium text-foreground">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WikiKeyHints() {
  return (
    <div className="mt-8 hidden gap-4 text-[11px] text-muted [@media(hover:hover)]:flex">
      <span>
        <Kbd>/</Kbd> search
      </span>
      <span>
        <Kbd>j</Kbd> <Kbd>k</Kbd> next, previous section
      </span>
      <span>
        <Kbd>g</Kbd> <Kbd>t</Kbd> section tree
      </span>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] bg-card px-1.5 py-px font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

/**
 * Article column plus the sticky right rail. The rail holds the "At a glance"
 * block (only when the page has a key and value table or infobox) and the page
 * contents. On phones the glance block sits above the article and contents
 * become a dropdown.
 */
export function WikiArticleFrame({
  content,
  headings,
  children,
}: {
  content: string;
  headings: WikiHeading[];
  children: ReactNode;
}) {
  const glance = extractWikiGlance(content);
  const hasRail = glance !== null || headings.length > 0;

  return (
    <div
      className={`min-w-0 xl:grid xl:gap-0 ${hasRail ? "xl:grid-cols-[minmax(0,1fr)_288px]" : ""}`}
    >
      <div className="mx-auto min-w-0 max-w-[860px] px-4 pb-14 pt-7 sm:px-8 xl:mx-0 xl:px-11">
        {glance && (
          <section
            aria-label="At a glance"
            className="mb-5 rounded-md p-3.5 xl:hidden"
            style={{ background: "var(--card-muted)" }}
          >
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              At a glance
            </div>
            <GlanceTable rows={glance} />
          </section>
        )}
        <WikiContentsList headings={headings} variant="dropdown" />
        {children}
        <WikiKeyHints />
      </div>
      {hasRail && (
        <aside
          className="hidden px-5 py-6 xl:sticky xl:top-[49px] xl:block xl:h-[calc(100vh-49px)] xl:overflow-y-auto"
          style={{ background: "var(--card-muted)" }}
        >
          {glance && (
            <section aria-label="At a glance" className="mb-7">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                At a glance
              </div>
              <GlanceTable rows={glance} />
            </section>
          )}
          <WikiContentsList headings={headings} variant="rail" />
        </aside>
      )}
    </div>
  );
}
