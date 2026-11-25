/**
 * One meaning per colour. Components ask for a tone, never a raw palette class.
 * Zero and non-finite values are neutral: they are never red or green.
 */
export type Tone = "gain" | "loss" | "neutral" | "warning" | "over-limit" | "action";

const TEXT: Record<Tone, string> = {
  gain: "text-success",
  loss: "text-error",
  neutral: "text-foreground",
  warning: "text-warning",
  "over-limit": "text-error",
  action: "text-primary",
};

const BG: Record<Tone, string> = {
  gain: "bg-success/10",
  loss: "bg-error/10",
  neutral: "bg-card-elevated",
  warning: "bg-warning/10",
  "over-limit": "bg-error/10",
  action: "bg-primary",
};

const BORDER: Record<Tone, string> = {
  gain: "border-success",
  loss: "border-error",
  neutral: "border-card-border",
  warning: "border-warning",
  "over-limit": "border-error",
  action: "border-primary",
};

export function toneText(tone: Tone): string {
  return TEXT[tone];
}

export function toneBg(tone: Tone): string {
  return BG[tone];
}

export function toneBorder(tone: Tone): string {
  return BORDER[tone];
}

/** Gain for positive, loss for negative, neutral for zero or unusable input. */
export function toneForDelta(value: number | null | undefined, invert = false): Tone {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "neutral";
  const positive = value > 0;
  return positive !== invert ? "gain" : "loss";
}

/** Warning below the limit, over-limit at or above it, neutral when unknown. */
export function toneForLimit(used: number, limit: number, warnAt = 0.8): Tone {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return "neutral";
  if (used >= limit) return "over-limit";
  return used >= limit * warnAt ? "warning" : "neutral";
}

const SOLID: Record<Tone, string> = {
  gain: "bg-success",
  loss: "bg-error",
  neutral: "bg-muted",
  warning: "bg-warning",
  "over-limit": "bg-error",
  action: "bg-primary",
};

/** Opaque fill for legend swatches and meters. */
export function toneSolid(tone: Tone): string {
  return SOLID[tone];
}

/**
 * Approval and satisfaction ratings. Red is for money lost and errors, so a
 * low rating is a warning (amber), a middling one is neutral, a healthy one is
 * green. `lowBelow` is the line under which the rating counts as low.
 */
export function approvalTone(value: number, lowBelow = 40): Tone {
  if (!Number.isFinite(value)) return "neutral";
  if (value >= 50) return "gain";
  return value < lowBelow ? "warning" : "neutral";
}

export function approvalText(value: number, lowBelow = 40): string {
  return TEXT[approvalTone(value, lowBelow)];
}
