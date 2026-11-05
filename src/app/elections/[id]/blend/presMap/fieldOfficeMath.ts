import { classifyMarginTier } from "@/lib/elections/generalViewModel";
import { readableInk } from "@/lib/elections/marginTierShade";
import type {
  FieldOfficeSubdivisionDto,
  FieldOfficeView,
} from "@/lib/campaigns/fieldOffices/queries";
import { mixToward } from "./dataViews";
import type { CountyRow } from "./countyModel";
import type { PresMapModel } from "./presMapModel";

/**
 * Pure helpers for the field-office map: fills, pin placement, labels. Kept
 * out of the component so they are testable without a DOM.
 */

const LEFT = [59, 130, 246] as const; // #3b82f6
const RIGHT = [239, 68, 68] as const; // #ef4444
const EVEN = [42, 42, 61] as const; // BLEND.hairlineStrong
const VALUE = [34, 197, 94] as const; // BLEND.positive

function mix(a: readonly number[], b: readonly number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * Diverging fill for a PVI. Saturates at 30 points, with a square-root ramp so
 * the competitive band (within 10) still separates visibly.
 */
export function leanFill(pvi: number): string {
  if (!Number.isFinite(pvi) || Math.abs(pvi) < 0.5) return mix(EVEN, EVEN, 0);
  const t = Math.sqrt(Math.min(1, Math.abs(pvi) / 30));
  return mix(EVEN, pvi < 0 ? LEFT : RIGHT, 0.25 + 0.75 * t);
}

/** Sequential fill for the marginal value of a new office, relative to the best spot. */
export function valueFill(marginalPct: number, maxMarginalPct: number): string {
  if (!(maxMarginalPct > 0) || !(marginalPct > 0)) return mix(EVEN, EVEN, 0);
  const t = Math.sqrt(Math.min(1, marginalPct / maxMarginalPct));
  return mix(EVEN, VALUE, 0.15 + 0.85 * t);
}

/** "R+8.1", "D+30.3", "EVEN". US-style party letters are deliberately avoided: L/R. */
export function leanLabel(pvi: number): string {
  if (!Number.isFinite(pvi) || Math.abs(pvi) < 0.5) return "Even";
  return `${pvi < 0 ? "Left" : "Right"} +${Math.abs(pvi).toFixed(1)}`;
}

/**
 * Approximate visual centre of an SVG path: the centre of its bounding box.
 * Committed county paths are absolute M/L/Z polygons, so every number pair is
 * a vertex. Returns null for an empty path.
 */
export function pathCentre(path: string): { x: number; y: number } | null {
  const nums = path.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Pin radius scaled to the viewBox so pins read the same on Rhode Island and Texas. */
export function pinRadius(viewBox: string): number {
  const parts = viewBox.split(/\s+/).map(Number);
  const span = Math.max(parts[2] || 0, parts[3] || 0);
  return span > 0 ? span * 0.012 : 1;
}

export function formatPct(n: number, digits = 2): string {
  return `+${n.toFixed(digits)}%`;
}

// Field offices on the presidential map: the two colour-by views, the county
// rows they paint, and the rules the state panel reads. The server view stays
// the only source of figures; nothing here prices or scores an office.

export type FieldOfficeViewId = "fieldLean" | "fieldValue";

export const FIELD_OFFICE_VIEWS: { id: FieldOfficeViewId; label: string }[] = [
  { id: "fieldLean", label: "Field offices: lean" },
  { id: "fieldValue", label: "Field offices: opportunity" },
];

export function isFieldOfficeView(id: string): id is FieldOfficeViewId {
  return id === "fieldLean" || id === "fieldValue";
}

/**
 * The colour-by views offered for this campaign. Lean is the public view, the
 * same one a rival sees on the field tab; opportunity prices a new office, so
 * it follows the server's manager gate. Nothing when the country has no offices.
 */
export function fieldOfficeViewOptions(
  meta: Pick<FieldOfficeView, "enabled" | "canManage"> | null
): { id: FieldOfficeViewId; label: string }[] {
  if (!meta || !meta.enabled) return [];
  return FIELD_OFFICE_VIEWS.filter((v) => v.id === "fieldLean" || meta.canManage);
}

/** Best marginal turnout among the counties, for the opportunity ramp. */
export function maxMarginalPct(subs: readonly FieldOfficeSubdivisionDto[]): number {
  return Math.max(0, ...subs.map((s) => s.marginalPct ?? 0));
}

/** County rows painted for a field-office view. They carry no tally. */
export function fieldOfficeCountyRows(
  subs: readonly FieldOfficeSubdivisionDto[],
  view: FieldOfficeViewId
): CountyRow[] {
  const max = maxMarginalPct(subs);
  return subs.map((s) => ({
    id: s.id,
    name: s.name,
    path: s.path,
    winnerId: "",
    winnerName: "",
    winnerColor: "",
    margin: 0,
    tier: classifyMarginTier(0),
    fill: view === "fieldValue" ? valueFill(s.marginalPct ?? 0, max) : leanFill(s.livePvi),
    votes: 0,
    shareByName: {},
    field: {
      livePvi: s.livePvi,
      basePvi: s.basePvi,
      electorateShare: s.electorateShare,
      marginalPct: s.marginalPct,
      yieldFactor: s.yieldFactor,
      officeId: s.officeId,
    },
  }));
}

/** Offices held per state, from the server's region list. */
export function officesByState(
  regions: readonly { id: string; officeCount: number }[]
): Record<string, number> {
  return Object.fromEntries(
    regions.filter((r) => r.officeCount > 0).map((r) => [r.id, r.officeCount])
  );
}

/** Offices at which the state tint is full strength. */
const STATE_TINT_FULL = 5;

/**
 * The national map under a field-office view: every state quiet, with a gold
 * tint on states that hold offices. County colours appear once a state is open.
 */
export function applyFieldOfficeStateView(
  model: PresMapModel,
  ground: string,
  counts: Readonly<Record<string, number>>
): PresMapModel {
  const states: PresMapModel["states"] = {};
  for (const [id, s] of Object.entries(model.states)) {
    const n = counts[id] ?? 0;
    const fill = mixToward(
      ground,
      "#d4af37",
      n > 0 ? 0.3 + 0.7 * Math.min(1, n / STATE_TINT_FULL) : 0.06
    );
    states[id] = {
      ...s,
      fill,
      ink: readableInk(fill),
      caption: n > 0 ? `${n} field office${n === 1 ? "" : "s"}` : "No field offices",
      evLabel: n > 0 ? `${n}` : null,
      overlay: undefined,
    };
  }
  return { ...model, states };
}

/** The counties where a new office would add the most turnout, best first. */
export function topOpportunityCounties(
  subs: readonly FieldOfficeSubdivisionDto[],
  limit = 5
): FieldOfficeSubdivisionDto[] {
  return subs
    .filter((s) => !s.officeId && (s.marginalPct ?? 0) > 0)
    .sort((a, b) => (b.marginalPct ?? 0) - (a.marginalPct ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Why a new office cannot be opened right now, in player words; null when it can. */
export function openBlockReason(
  view: Pick<
    FieldOfficeView,
    "canManage" | "raceActive" | "cap" | "offices" | "costs" | "funds" | "actions"
  >,
  formatMoney: (amount: number, currency: string) => string
): string | null {
  if (!view.canManage || !view.raceActive) return null;
  if (view.offices.length >= view.cap) {
    return `This race allows ${view.cap} offices. Close one to open another.`;
  }
  const { costs } = view;
  if (costs && (view.funds ?? 0) < costs.open) {
    return `Needs ${formatMoney(costs.open, costs.currency)} in the war chest.`;
  }
  if (costs && (view.actions ?? 0) < costs.actions)
    return `Needs ${costs.actions} campaign actions.`;
  return null;
}

/** Where the county lean comes from, as the field tab has always said it. */
export function leanSourceNote(
  view: Pick<
    FieldOfficeView,
    "liveLeanActive" | "leanSourceLabel" | "liveLeanPriorYear" | "liveLeanYear"
  >
): string {
  const source = view.leanSourceLabel ?? "past results";
  if (!view.liveLeanActive) return `County lean from ${source}`;
  const span =
    view.liveLeanPriorYear && view.liveLeanYear
      ? ` from ${view.liveLeanPriorYear} to ${view.liveLeanYear}`
      : "";
  return `County lean from ${source}, shifted by this world's swing${span}`;
}
