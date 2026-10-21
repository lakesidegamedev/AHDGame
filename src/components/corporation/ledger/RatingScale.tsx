import { CREDIT_RATINGS } from "@/lib/db/types/centralBank";
import { gradeTone } from "../dense/InlineViz";

/** The marked tier uses the page's grade colours: A grades good, B grades caution, below that poor. */
const TIER_FILL = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  muted: "bg-muted",
} as const;

/** The rating's letter tier: a defensive "+" or "-" suffix maps to its base grade. */
function tierOf(rating: string): string | null {
  const base = rating.trim().toUpperCase().replace(/[+-]$/, "");
  return (CREDIT_RATINGS as string[]).includes(base) ? base : null;
}

/** The full rating scale with this corporation's tier marked. */
export function RatingScale({ rating }: { rating: string }) {
  const active = tierOf(rating);
  if (!active) return null;
  return (
    <div
      role="img"
      aria-label={`Rating scale from ${CREDIT_RATINGS[0]} to ${
        CREDIT_RATINGS[CREDIT_RATINGS.length - 1]
      }, this corporation at ${rating}`}
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${CREDIT_RATINGS.length}, minmax(0, 1fr))` }}
    >
      {CREDIT_RATINGS.map((tier) => {
        const on = tier === active;
        return (
          <div
            key={tier}
            data-tier={tier}
            data-active={on ? "true" : "false"}
            className="flex flex-col items-center gap-1"
          >
            <span
              data-bar
              className={`h-2 w-full ${
                on
                  ? (TIER_FILL[gradeTone(tier) as keyof typeof TIER_FILL] ?? "bg-muted")
                  : "bg-track"
              }`}
            />
            <span
              aria-hidden
              className={`h-0 w-0 border-x-4 border-b-[6px] border-x-transparent ${
                on ? "border-b-foreground" : "border-b-transparent"
              }`}
            />
            <span
              className={`font-mono text-[9px] font-semibold tabular-nums ${
                on ? "text-foreground" : "text-muted"
              }`}
            >
              {tier}
            </span>
          </div>
        );
      })}
    </div>
  );
}
