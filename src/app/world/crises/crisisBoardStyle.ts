import type { CrisisKind, ExposureReason } from "@/lib/crises/rules/boardView";
import type { CrisisSeverity } from "@/lib/crises/severity";

export const KIND_LABEL: Record<CrisisKind, string> = {
  war: "War",
  disaster: "Disaster",
  economic: "Economic",
  political: "Political",
  opportunity: "Opportunity",
};

/** Marker fill per crisis type. Hex because the SVG map draws outside Tailwind classes. */
export const KIND_COLOR: Record<CrisisKind, string> = {
  war: "#e11d48",
  disaster: "#f59e0b",
  economic: "#0ea5e9",
  political: "#8b5cf6",
  opportunity: "#10b981",
};

export const SEVERITY_BADGE: Record<CrisisSeverity, string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-zinc-400/30 bg-zinc-400/10 text-muted",
};

export const SEVERITY_LABEL: Record<CrisisSeverity, string> = {
  high: "Severe",
  medium: "Serious",
  low: "Watch",
};

export const SEVERITY_RADIUS: Record<CrisisSeverity, number> = { high: 11, medium: 8, low: 5.5 };

export const REASON_LABEL: Record<ExposureReason, string> = {
  country: "Your country",
  state: "Your state",
  sector: "Your corporation's sector",
  holding: "Your holdings",
  office: "Your office",
};

/** "3h 20m", "45m", or "overdue" for a decision deadline. */
export function formatDeadline(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const minutes = Math.ceil((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0) return "due now";
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ${minutes % 60}m left` : `${Math.floor(hours / 24)}d left`;
}

export function formatTurnsLeft(turnsLeft: number | null): string {
  if (turnsLeft == null) return "Ongoing";
  return turnsLeft === 1 ? "1 turn left" : `${turnsLeft} turns left`;
}
