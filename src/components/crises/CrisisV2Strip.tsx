import type { CrisisV2Summary } from "@/lib/crises/queries/crisisV2View";
import { CRISIS_STAGES, type CrisisStage } from "@/lib/crises/v2/types";
import { STAGE_LABEL } from "@/lib/crises/v2/ledgerView";
import { CrisisLeverList } from "./CrisisLeverList";
import { SPARKLINE_HEIGHT, SPARKLINE_WIDTH, forecastText, sparklinePoints } from "./crisisV2Format";

const TRACK_STAGES = CRISIS_STAGES.filter((s) => s !== "resolved");

const TREND_TEXT = { rising: "rising", falling: "falling", steady: "steady" } as const;
const TREND_CLASS = {
  rising: "text-error",
  falling: "text-success",
  steady: "text-muted",
} as const;

export function StageTrack({ stage }: { stage: CrisisStage }) {
  const current = TRACK_STAGES.indexOf(stage as (typeof TRACK_STAGES)[number]);
  return (
    <ol className="flex gap-1" aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
      {TRACK_STAGES.map((s, i) => (
        <li
          key={s}
          aria-current={s === stage ? "step" : undefined}
          className={`flex-1 rounded px-1 py-0.5 text-center text-xs ${
            s === stage
              ? "bg-primary font-medium text-white"
              : stage === "resolved" || i < current
                ? "bg-card-elevated text-foreground"
                : "border border-card-border text-muted"
          }`}
        >
          {STAGE_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

export function SeveritySparkline({
  history,
  forecast,
}: {
  history: readonly number[];
  forecast: readonly number[];
}) {
  if (history.length < 2 && forecast.length === 0) return null;
  const total = history.length + forecast.length;
  const anchor = history.length > 0 ? [history[history.length - 1], ...forecast] : [...forecast];
  return (
    <svg
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      role="img"
      aria-label="Severity history and projection"
      className="shrink-0 overflow-visible"
    >
      <polyline
        points={sparklinePoints(history, 0, total)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-foreground"
      />
      {forecast.length > 0 && (
        <polyline
          points={sparklinePoints(anchor, Math.max(0, history.length - 1), total)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          className="text-warning"
        />
      )}
    </svg>
  );
}

/** Stage, severity, trend, do-nothing forecast and the viewer's levers for a v2 crisis. */
export function CrisisV2Strip({
  crisisId,
  v2,
  onPulled,
}: {
  crisisId: string;
  v2: CrisisV2Summary;
  onPulled?: () => void;
}) {
  const forecast = forecastText(v2.severity, v2.forecast);
  return (
    <div className="space-y-2 text-sm">
      <StageTrack stage={v2.stage} />
      <div className="flex items-center gap-3">
        <SeveritySparkline history={v2.history} forecast={v2.forecast} />
        <div className="min-w-0 text-xs text-muted">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            Severity {Math.round(v2.severity)}
          </span>{" "}
          <span className={TREND_CLASS[v2.trend]}>{TREND_TEXT[v2.trend]}</span>
          {forecast && <div>{forecast}</div>}
        </div>
      </div>
      <CrisisLeverList
        crisisId={crisisId}
        levers={v2.levers}
        corporations={v2.corporations}
        onPulled={onPulled}
      />
    </div>
  );
}
