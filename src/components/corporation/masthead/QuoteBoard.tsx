import type { useCorpMoney } from "../dense/DenseKit";

type CorpMoney = ReturnType<typeof useCorpMoney>;

const W = 340;
const H = 84;

function sparkPaths(series: number[], prevClose: number | null) {
  const values = prevClose != null ? [...series, prevClose] : series;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 10);
  const points = series.map((v, i) => [(i / (series.length - 1)) * W, y(v)] as const);
  const line = points
    .map(([x, py], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${py.toFixed(1)}`)
    .join(" ");
  return {
    line,
    area: `${line} L${W} ${H} L0 ${H} Z`,
    prevY: prevClose != null ? y(prevClose) : null,
  };
}

/**
 * The live share quote: price in the board colour, change against the
 * previous turn, the recent price line with the previous close marked, its
 * range, and the market pool's bid, spread and ask when the pool is open.
 */
export function QuoteBoard({
  money,
  price,
  series,
  dayChange,
  bid,
  ask,
  poolActive,
  currentTurn,
}: {
  money: CorpMoney;
  price: number;
  series: number[];
  dayChange: { changePct: number; prevClose: number } | null;
  bid?: number | null;
  ask?: number | null;
  poolActive: boolean;
  currentTurn?: number | null;
}) {
  const up = (dayChange?.changePct ?? 0) >= 0;
  const tone = dayChange == null ? "text-muted" : up ? "text-success" : "text-error";
  const hasQuote =
    poolActive && bid != null && ask != null && Number.isFinite(bid) && Number.isFinite(ask);
  const drawn = series.length >= 2 ? sparkPaths(series, dayChange?.prevClose ?? null) : null;
  const moneyChange = dayChange != null ? price - dayChange.prevClose : null;

  // The line covers the whole drawn window, so it is coloured by the change
  // across that window and not by the last turn. Colouring an eighteen-turn
  // rise red because yesterday ticked down is what players reported as a bug.
  // The badge above stays the previous-turn figure and says so.
  const spanFirst = series.length >= 2 ? series[0] : null;
  const spanLast = series.length >= 2 ? series[series.length - 1] : null;
  const spanChangePct =
    spanFirst != null && spanLast != null && spanFirst !== 0
      ? ((spanLast - spanFirst) / Math.abs(spanFirst)) * 100
      : null;
  const trendStroke =
    spanChangePct == null || spanChangePct === 0
      ? "stroke-muted"
      : spanChangePct > 0
        ? "stroke-success"
        : "stroke-error";
  const trendFill =
    spanChangePct == null || spanChangePct === 0
      ? "fill-muted/10"
      : spanChangePct > 0
        ? "fill-success/10"
        : "fill-error/10";
  const spanChangeText = (() => {
    if (spanChangePct == null) return "";
    if (spanChangePct === 0) return `, flat over that span`;
    return `, ${spanChangePct > 0 ? "up" : "down"} ${Math.abs(spanChangePct).toFixed(2)}% over that span`;
  })();

  return (
    <section
      aria-label="Share quote"
      className="flex min-w-0 flex-col rounded-[var(--corp-rad,6px)] border border-card-border bg-card-muted"
    >
      <div className="flex justify-between gap-2 border-b border-card-border px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        <span>Last{money.code ? ` · ${money.code}` : ""}</span>
        {currentTurn != null && <span>Turn {currentTurn}</span>}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 px-3.5 pb-1.5 pt-3.5">
        <span className="font-mono text-[40px] font-semibold leading-none tracking-tight tabular-nums text-gold lg:text-[52px]">
          {money.fmtPrice(price)}
        </span>
        {dayChange != null && (
          <span className={`flex flex-col gap-0.5 font-mono text-[15px] font-semibold ${tone}`}>
            {up ? "▲" : "▼"} {Math.abs(dayChange.changePct).toFixed(2)}%
            {moneyChange != null && (
              <small className="text-[11px] font-medium text-muted">
                {moneyChange >= 0 ? "+" : "-"}
                {money.fmtPrice(Math.abs(moneyChange))} on prev. turn
              </small>
            )}
          </span>
        )}
      </div>

      {drawn && (
        <>
          <div className="px-3.5 pt-1">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="block h-14 w-full lg:h-[84px]"
              role="img"
              aria-label={`Share price over the last ${series.length} turns${spanChangeText}${
                dayChange ? ", with the previous turn's close marked" : ""
              }`}
            >
              <title>{`Share price, last ${series.length} turns${spanChangeText}`}</title>
              <path d={drawn.area} className={trendFill} />
              {drawn.prevY != null && (
                <line
                  x1="0"
                  x2={W}
                  y1={drawn.prevY}
                  y2={drawn.prevY}
                  className="stroke-muted"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={drawn.line}
                fill="none"
                className={trendStroke}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="flex justify-between px-3.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            <span>{series.length} turns</span>
            <span>
              Low {money.fmtPrice(Math.min(...series))} · High {money.fmtPrice(Math.max(...series))}
            </span>
          </div>
        </>
      )}

      {hasQuote && (
        <div
          className="mt-3 grid grid-cols-[1fr_auto_1fr] border-t border-card-border"
          title="The equity market pool's live quote. Market sales fill at the bid, purchases at the ask."
        >
          <div className="flex flex-col gap-0.5 px-3.5 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Bid
            </span>
            <span className="font-mono text-[17px] font-semibold tabular-nums text-foreground">
              {money.fmtPrice(bid as number)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-x border-card-border px-3.5 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Spread
            </span>
            <span className="font-mono text-[13px] tabular-nums text-muted">
              {money.fmtPrice(Math.max(0, (ask as number) - (bid as number)))}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5 px-3.5 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Ask
            </span>
            <span className="font-mono text-[17px] font-semibold tabular-nums text-foreground">
              {money.fmtPrice(ask as number)}
            </span>
          </div>
        </div>
      )}

      <p className="m-0 hidden border-t border-card-border px-3.5 py-2.5 text-[11px] leading-relaxed text-muted lg:block">
        Live quote{money.code ? ` in ${money.code}, the listing currency` : ""}. Market boards show
        the last snapshot.
      </p>
    </section>
  );
}
