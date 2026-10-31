/**
 * Mechanical national laws: three 0 to 4 dials every country can legislate,
 * read by game code rather than by the political metrics.
 *
 * - Competition: merger review and, at higher levels, breakup orders.
 * - Subsidiary Limits: how many subsidiaries one corporate group may run here.
 * - Foreign Investment: how far foreign-controlled groups may operate here.
 *
 * Pure: plain data in, plain data out. No database, clock or randomness.
 */

export const MECHANICAL_LAW_KEYS = [
  "competition",
  "subsidiaryLimits",
  "foreignInvestment",
] as const;
export type MechanicalLawKey = (typeof MECHANICAL_LAW_KEYS)[number];
export type MechanicalLawLevel = 0 | 1 | 2 | 3 | 4;

/** Clamp any stored option index to a valid level. */
export function clampMechanicalLevel(value: unknown): MechanicalLawLevel {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(4, n)) as MechanicalLawLevel;
}

/** Most subsidiaries one group may run in the country; null means no cap. */
export const SUBSIDIARY_CAP_BY_LEVEL: readonly (number | null)[] = [null, 12, 8, 5, 3];

export function subsidiaryCapForLevel(level: MechanicalLawLevel): number | null {
  return SUBSIDIARY_CAP_BY_LEVEL[level] ?? null;
}

export type ForeignInvestmentRule =
  | { kind: "open" }
  | { kind: "screening" }
  | { kind: "cap"; maxIndustrySharePct: number }
  | { kind: "ban" };

/**
 * What foreign-controlled groups may do. "Foreign" means the group's ultimate
 * controller is headquartered in another country.
 * - open: no restriction;
 * - screening: a new foreign-controlled subsidiary or acquisition needs the
 *   competition authority's approval;
 * - cap: screening, and foreign-controlled groups together may hold at most
 *   this share of any national industry;
 * - ban: foreign-controlled subsidiaries may not operate here.
 */
const FOREIGN_INVESTMENT_RULE_BY_LEVEL: readonly ForeignInvestmentRule[] = [
  { kind: "open" },
  { kind: "screening" },
  { kind: "cap", maxIndustrySharePct: 25 },
  { kind: "cap", maxIndustrySharePct: 10 },
  { kind: "ban" },
];

export function foreignInvestmentRuleForLevel(level: MechanicalLawLevel): ForeignInvestmentRule {
  return FOREIGN_INVESTMENT_RULE_BY_LEVEL[level] ?? { kind: "open" };
}

/** Turns a group gets to comply after a law tightens, before a forced sale. */
export const MECHANICAL_LAW_COMPLIANCE_TURNS = 48;
