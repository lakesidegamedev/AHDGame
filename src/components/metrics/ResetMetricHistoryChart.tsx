import { currencySymbolSep } from "@/lib/currency/symbolSep";
import { getCurrencyPrefix } from "@/lib/utils/budgetCalculations";
import type { ResetMetricCountry, ResetMetricRow } from "./ResetMetricBoard";

export type ResetMetricDetailResponse = Readonly<{
  history: Array<{ turn: number; value: number }>;
  historyNotice?: string;
  openingNotice?: string;
  nationalValue: number;
  regions: Array<{ regionId: string; name: string; value: number }>;
}>;

function historyValueLabel(
  metric: ResetMetricRow,
  countryId: ResetMetricCountry,
  value: number
): string {
  if (metric.id === "02") {
    const symbol = getCurrencyPrefix(countryId);
    const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
    return `${symbol}${currencySymbolSep(symbol)}${formatted}`;
  }
  const precision = Math.abs(value) < 10 ? 2 : 1;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision,
  }).format(value);
  return `${formatted}${metric.unit.startsWith("%") ? "" : " "}${metric.unit}`;
}

function axisLabel(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
    notation: Math.abs(value) >= 100000 ? "compact" : "standard",
  }).format(value);
}

export function ResetMetricHistoryChart({
  countryId,
  metric,
  history,
}: {
  countryId: ResetMetricCountry;
  metric: ResetMetricRow;
  history: Array<{ turn: number; value: number }>;
}) {
  if (history.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-card-border bg-card-muted text-body-sm italic text-muted">
        More comparable history will appear as turns advance.
      </div>
    );
  }
  const width = 720;
  const height = 220;
  const padX = 64;
  const padY = 24;
  const values = history.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const flatPadding = high === low ? Math.max(Math.abs(high) * 0.02, 1) : 0;
  const chartLow = low - flatPadding / 2;
  const range = Math.max(high - low, flatPadding);
  const first = history[0]!;
  const last = history.at(-1)!;
  const turnSpan = Math.max(1, last.turn - first.turn);
  // Position by turn, not by sample index, so uneven sampling does not misdate a change.
  const xOf = (turn: number) => padX + ((turn - first.turn) / turnSpan) * (width - padX * 2);
  const yOf = (value: number) => height - padY - ((value - chartLow) / range) * (height - padY * 2);
  const points = history
    .map((point) => `${xOf(point.turn).toFixed(1)},${yOf(point.value).toFixed(1)}`)
    .join(" ");
  const tickTurns = [
    ...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(first.turn + f * turnSpan))),
  ];
  const hitWidth = Math.max(8, (width - padX * 2) / Math.max(1, history.length - 1));
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-60 w-full"
        role="img"
        aria-label={`${metric.name} history from turn ${first.turn} to turn ${last.turn}`}
      >
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          className="stroke-card-border"
        />
        <text x={padX - 6} y={yOf(high) + 4} textAnchor="end" className="fill-muted text-body-sm">
          {axisLabel(high)}
        </text>
        {high !== low && (
          <text x={padX - 6} y={yOf(low) + 4} textAnchor="end" className="fill-muted text-body-sm">
            {axisLabel(low)}
          </text>
        )}
        {tickTurns.map((turn) => (
          <g key={turn}>
            <line
              x1={xOf(turn)}
              y1={height - padY}
              x2={xOf(turn)}
              y2={height - padY + 4}
              className="stroke-card-border"
            />
            <text
              x={xOf(turn)}
              y={height - padY + 16}
              textAnchor="middle"
              className="fill-muted text-body-sm"
            >
              T{turn}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {history.map((point) => (
          <g key={point.turn} className="group">
            <rect
              x={xOf(point.turn) - hitWidth / 2}
              y={padY}
              width={hitWidth}
              height={height - padY * 2}
              fill="transparent"
            >
              <title>{`Turn ${point.turn}: ${historyValueLabel(metric, countryId, point.value)}`}</title>
            </rect>
            <circle
              cx={xOf(point.turn)}
              cy={yOf(point.value)}
              r={4}
              className="pointer-events-none fill-primary opacity-0 group-hover:opacity-100"
            />
          </g>
        ))}
      </svg>
      <details className="mt-2 text-body-sm">
        <summary className="cursor-pointer text-muted">View sampled turn values</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr>
              <th scope="col">Turn</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {history.map((point) => (
              <tr key={point.turn}>
                <td>{point.turn}</td>
                <td>{historyValueLabel(metric, countryId, point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="flex justify-between gap-4 text-body-sm text-muted">
        <span>
          Turn {first.turn}: {historyValueLabel(metric, countryId, first.value)}
        </span>
        <span>Hover the line for each recorded turn</span>
        <span>
          Turn {last.turn}: {historyValueLabel(metric, countryId, last.value)}
        </span>
      </div>
    </div>
  );
}
