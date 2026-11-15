/**
 * Pure rules for the compact crisis rows on the board and the Actions page:
 * which severity band a score falls in, which section a crisis sits in, how a
 * list is ordered, and how the collapsed summary line reads.
 */
import type { CrisisSeverity } from "@/lib/crises/severity";

/** A Crisis v2 severity at or above this is "Severe". */
export const HIGH_SEVERITY_SCORE = 70;
/** At or above this, below the high mark, is "Elevated". */
export const ELEVATED_SEVERITY_SCORE = 40;

export const SEVERITY_BAND_LABEL: Record<CrisisSeverity, string> = {
  high: "Severe",
  medium: "Elevated",
  low: "Watch",
};

/** Band for a 0..100 severity score. */
export function severityBandFromScore(score: number): CrisisSeverity {
  if (score >= HIGH_SEVERITY_SCORE) return "high";
  if (score >= ELEVATED_SEVERITY_SCORE) return "medium";
  return "low";
}

/** Stand-in score for a crisis with no v2 severity, taken from its effect-based band. */
const LEGACY_SCORE: Record<CrisisSeverity, number> = { high: 85, medium: 55, low: 20 };

/**
 * One comparable severity number. Crisis v2 carries a live 0..100 score; an
 * older crisis only has the band derived from its effects.
 */
export function crisisSeverityScore(input: {
  v2Severity: number | null | undefined;
  legacyBand: CrisisSeverity;
}): number {
  return input.v2Severity != null ? input.v2Severity : LEGACY_SCORE[input.legacyBand];
}

export type CrisisSection = "ongoing" | "warning" | "aftermath";

export const SECTION_ORDER: readonly CrisisSection[] = ["ongoing", "warning", "aftermath"];

export const SECTION_META: Record<CrisisSection, { title: string; hint: string }> = {
  ongoing: { title: "Ongoing", hint: "Happening now, worst first." },
  warning: { title: "Early warning", hint: "Signs of trouble that have not hit yet." },
  aftermath: { title: "Aftermath and resolved", hint: "Over, or recovering." },
};

/** Ongoing crises first, then early warnings, then aftermath and resolved ones. */
export function crisisSection(input: {
  status: "active" | "resolved";
  stage: string | null | undefined;
}): CrisisSection {
  if (input.status === "resolved") return "aftermath";
  if (input.stage === "signal") return "warning";
  if (input.stage === "aftermath" || input.stage === "resolved") return "aftermath";
  return "ongoing";
}

export interface SortableCrisisRow {
  id: string;
  section: CrisisSection;
  score: number;
  startTurn: number;
}

/** Section order, then highest severity, then newest, then id so the order is total. */
export function compareCrisisRows(a: SortableCrisisRow, b: SortableCrisisRow): number {
  const bySection = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
  if (bySection !== 0) return bySection;
  if (b.score !== a.score) return b.score - a.score;
  if (b.startTurn !== a.startTurn) return b.startTurn - a.startTurn;
  return a.id.localeCompare(b.id);
}

export interface CrisisSummaryInput {
  title: string;
  band: CrisisSeverity;
  canRespond: boolean;
}

export interface CrisisListSummary {
  count: number;
  high: number;
  respondable: number;
  /** Worst crisis in a list already sorted worst first. */
  worst: string | null;
  /** "8 active crises, 2 severe". */
  headline: string;
}

/** Collapsed-row summary for a list already sorted by `compareCrisisRows`. */
export function summarizeCrises(rows: readonly CrisisSummaryInput[]): CrisisListSummary {
  const high = rows.filter((r) => r.band === "high").length;
  const respondable = rows.filter((r) => r.canRespond).length;
  const noun = rows.length === 1 ? "active crisis" : "active crises";
  const headline =
    rows.length === 0
      ? "No active crises"
      : high > 0
        ? `${rows.length} ${noun}, ${high} severe`
        : `${rows.length} ${noun}`;
  return { count: rows.length, high, respondable, worst: rows[0]?.title ?? null, headline };
}

export interface CrisisPlaceInput {
  scope: "global" | "country" | "region";
  countryIds: readonly string[];
  regionIds: readonly string[];
}

/** "Worldwide", the named countries, or the named regions, shortened past three. */
export function crisisPlaceLabel(
  crisis: CrisisPlaceInput,
  names: {
    country: (id: string) => string;
    region: (id: string) => string;
  }
): string {
  const list = (ids: readonly string[], name: (id: string) => string): string => {
    const labels = ids.map(name);
    return labels.length <= 3
      ? labels.join(", ")
      : `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
  };
  const regionIds = crisis.regionIds ?? [];
  const countryIds = crisis.countryIds ?? [];
  if (crisis.scope === "region" && regionIds.length > 0) return list(regionIds, names.region);
  if (countryIds.length > 0) return list(countryIds, names.country);
  return crisis.scope === "global" ? "Worldwide" : "Unspecified area";
}
