import Link from "next/link";
import type { CorporationDetail } from "../CorporationPageTypes";

const corpHref = (c: { _id: string; sequentialId?: number }) =>
  `/corporation/${c.sequentialId ?? c._id}`;

const box =
  "min-w-0 rounded-[var(--corp-rad,6px)] border border-card-border bg-card px-3 py-2 text-[13px]";

/** A short vertical rule joining one tier of the chart to the next. */
function Connector() {
  return <span aria-hidden className="mx-auto block h-4 w-px bg-card-border" />;
}

/**
 * The corporation's group: its parent above it when it is a subsidiary, then
 * the corporation, then every corporation it controls with the share it
 * owns. A Spin off slot sits among the children when the CEO may spin one off.
 */
export function GroupChart({
  corporation,
  onSpinOff,
  spinOffCooldownTurns = 0,
}: {
  corporation: CorporationDetail;
  /** Present only when this corporation may spin off a subsidiary. */
  onSpinOff?: () => void;
  /**
   * Turns left before another spin-off is allowed. Shown on the slot so the wait
   * is readable on the page, not only inside the spin-off dialog.
   */
  spinOffCooldownTurns?: number;
}) {
  const parent = corporation.parentCorporation ?? null;
  const children = corporation.subsidiaries ?? [];
  if (!parent && children.length === 0 && !onSpinOff) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {parent && (
        <>
          <div className={`${box} mx-auto max-w-xs text-center`}>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              Parent
            </span>
            <Link href={corpHref(parent)} className="font-medium text-foreground hover:underline">
              {parent.name}
            </Link>
            <span className="block text-xs tabular-nums text-muted">
              owns {parent.ownershipPct.toFixed(1)}%
            </span>
          </div>
          <Connector />
        </>
      )}

      <div className={`${box} mx-auto max-w-xs border-foreground/40 bg-card-elevated text-center`}>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          This corporation
        </span>
        <span className="font-semibold text-foreground">{corporation.name}</span>
      </div>

      {(children.length > 0 || onSpinOff) && (
        <>
          <Connector />
          <ul
            aria-label="Subsidiaries"
            className="grid list-none grid-cols-1 gap-2 border-t border-card-border pt-3 sm:grid-cols-2 md:grid-cols-3"
          >
            {children.map((child) => (
              <li key={child._id} className={box}>
                <Link
                  href={corpHref(child)}
                  className="block truncate font-medium text-foreground hover:underline"
                >
                  {child.name}
                </Link>
                <span className="block text-xs tabular-nums text-muted">
                  {child.ownershipPct.toFixed(1)}% owned
                </span>
              </li>
            ))}
            {onSpinOff && (
              <li>
                <button
                  type="button"
                  onClick={onSpinOff}
                  className="flex h-full w-full flex-col items-start rounded-[var(--corp-rad,6px)] border border-dashed border-card-border px-3 py-2 text-left text-[13px] text-foreground hover:bg-card-elevated"
                >
                  <span className="font-medium">Spin off a subsidiary</span>
                  <span className="text-xs text-muted">
                    {spinOffCooldownTurns > 0
                      ? `Available again in ${spinOffCooldownTurns} turn${
                          spinOffCooldownTurns === 1 ? "" : "s"
                        }.`
                      : "One of your sector types becomes a new, wholly owned private subsidiary."}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
