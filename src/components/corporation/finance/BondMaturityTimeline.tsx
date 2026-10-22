import type { BondData } from "../CorporationPageTypes";
import { BOND_DUE_WINDOW_TURNS } from "../overviewModel";

/**
 * Outstanding bonds on a turn axis from now to the last maturity, one bar per
 * issue, sized by the face value repaid. Issues due inside the repayment
 * window use the warning tone, defaulted issues the error tone.
 */
export function BondMaturityTimeline({
  bonds,
  currentTurn,
  toDisplay,
}: {
  bonds: BondData[];
  currentTurn: number;
  /** `value` must be comparable across bonds (anchor units); `display` is shown. */
  toDisplay: (b: BondData) => { value: number; display: string };
}) {
  const outstanding = bonds
    .filter((b) => !b.matured)
    .map((b) => ({ bond: b, ...toDisplay(b) }))
    .sort((x, y) => x.bond.maturityTurn - y.bond.maturityTurn);
  if (outstanding.length === 0) return null;

  const lastTurn = Math.max(...outstanding.map((o) => o.bond.maturityTurn));
  const span = lastTurn - currentTurn;
  const maxValue = Math.max(...outstanding.map((o) => (o.value > 0 ? o.value : 0)));
  const dueSoon = outstanding.filter(
    (o) => !o.bond.defaulted && o.bond.turnsRemaining <= BOND_DUE_WINDOW_TURNS
  ).length;

  return (
    <div className="mb-4">
      <div
        role="img"
        aria-label={`Bond maturities from turn ${currentTurn.toLocaleString("en-US")} to turn ${lastTurn.toLocaleString("en-US")}: ${outstanding
          .map((o) => `${o.display} due turn ${o.bond.maturityTurn.toLocaleString("en-US")}`)
          .join(", ")}`}
        className="relative mx-3 h-24 border-b border-card-border"
      >
        {outstanding.map(({ bond, value, display }) => {
          const left = span > 0 ? clamp(((bond.maturityTurn - currentTurn) / span) * 100) : 100;
          const height = maxValue > 0 ? Math.max(clamp((value / maxValue) * 100), 4) : 4;
          const tone = bond.defaulted
            ? "bg-error"
            : bond.turnsRemaining <= BOND_DUE_WINDOW_TURNS
              ? "bg-warning"
              : "bg-info";
          return (
            <div
              key={bond._id}
              className="absolute bottom-0 flex h-full w-3 -translate-x-1/2 items-end"
              style={{ left: `${round(left)}%` }}
              title={`${bond.couponRate.toFixed(2)}% coupon, ${display}, due turn ${bond.maturityTurn.toLocaleString("en-US")}`}
            >
              <span
                data-bond-bar
                className={`block w-full rounded-t-[2px] ${tone}`}
                style={{ height: `${round(height)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mx-3 mt-1 flex justify-between text-[10px] tabular-nums text-muted">
        <span>Now, turn {currentTurn.toLocaleString("en-US")}</span>
        <span>Turn {lastTurn.toLocaleString("en-US")}</span>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-info" />
          Outstanding
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-warning" />
          Due within {BOND_DUE_WINDOW_TURNS} turns{dueSoon > 0 ? ` (${dueSoon})` : ""}
        </span>
        {outstanding.some((o) => o.bond.defaulted) && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-[2px] bg-error" />
            Defaulted
          </span>
        )}
      </p>
    </div>
  );
}

function clamp(pct: number): number {
  return Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;
}

function round(pct: number): number {
  return Math.round(pct * 100) / 100;
}
