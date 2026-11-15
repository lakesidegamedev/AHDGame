import type { CrisisEffect } from "@/lib/db/types/crisis";
import {
  EFFECT_TONE_CLASS,
  describeCrisisEffect,
  type EffectDisplayContext,
} from "@/lib/crises/effectDisplay";
import { SEVERITY_BAND_LABEL } from "@/lib/crises/rules/crisisRow";
import type { CrisisSeverity } from "@/lib/crises/severity";

/** Left rail and tint per band, so a severe crisis reads before any text does. */
export const BAND_ROW_CLASS: Record<CrisisSeverity, string> = {
  high: "border-l-4 border-l-rose-500 bg-rose-500/5",
  medium: "border-l-4 border-l-amber-500",
  low: "border-l-4 border-l-zinc-400/40",
};

const BAND_TAG_CLASS: Record<CrisisSeverity, string> = {
  high: "bg-rose-500 text-white",
  medium: "border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border border-card-border text-muted",
};

export function SeverityTag({ band, score }: { band: CrisisSeverity; score?: number | null }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${BAND_TAG_CLASS[band]}`}
    >
      {SEVERITY_BAND_LABEL[band]}
      {score != null && (
        <span className="font-normal tabular-nums opacity-80">{Math.round(score)}</span>
      )}
    </span>
  );
}

export function CrisisThumb({ src, className = "h-11 w-16" }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={`${className} shrink-0 rounded-md bg-card-elevated object-cover`}
    />
  );
}

/** Real stat, real unit, and when it lands. The template's prose is the tooltip. */
export function CrisisEffectChip({
  effect,
  context,
}: {
  effect: CrisisEffect;
  context?: EffectDisplayContext;
}) {
  const view = describeCrisisEffect(effect, context);
  return (
    <span
      title={view.detail}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${EFFECT_TONE_CLASS[view.tone]}`}
    >
      <span className="font-medium">{view.target}</span>
      <span className="font-mono font-semibold tabular-nums">{view.amount}</span>
      <span className="text-muted">{view.cadence}</span>
    </span>
  );
}
