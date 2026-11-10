/**
 * Read-only preflight for a database that is about to receive (or has just
 * received) the 2027 world. Plain evidence in, a flat list of findings out.
 * The shell loads the evidence; any `fail` finding means the target is not
 * ready.
 */

export type PreflightSeverity = "fail" | "warn";

export interface PreflightFinding {
  severity: PreflightSeverity;
  check: string;
  detail: string;
}

/**
 * `pre-reset`: the outgoing world. The reset deletes or retires characters and
 * NPPs and rebuilds reference data, so legacy field counts there are expected.
 * `fresh`: an isolated bootstrap or a world that has already been reset; a
 * legacy field there means a seeder or a stale write brought it back.
 */
export type PreflightMode = "pre-reset" | "fresh";

/**
 * Always-on gameState flags whose code gates were deleted. A literal `false`
 * would have switched the feature off, and with the gate gone it now turns on.
 */
export const REMOVED_ALWAYS_ON_FLAGS: readonly string[] = Object.freeze([
  "granularPollEnabled",
  "granularElectorateEnabled",
  "corpDealsEnabled",
  "conflictsEnabled",
  "rpgStatsEnabled",
  "intOrgAlignmentEnabled",
  "subsidiaryCorporationsEnabled",
  "redistrictingEnabled",
  "demographicsLayer1PositionsEnabled",
  "sectorTechTreesEnabled",
  "coldWarEnabled",
  "crisisInteractionEnabled",
  "worldEventsEnabled",
  "onboardingChecklistEnabled",
  "seasonRecapEnabled",
  "settlementCrisisEnabled",
  "macroGrowthV1",
]);

/**
 * Emergency kill switches. They default on and a stored false really switches
 * the system off, so it is worth a warning rather than a failure.
 */
export const KILL_SWITCH_FLAGS: readonly string[] = Object.freeze([
  "eraSystemEnabled",
  "autoDisastersEnabled",
  "livingConflictsEnabled",
]);

/** The level fresh and live worlds run AI-run countries at (NPP engine 6). */
const EXPECTED_AUTONOMY_LEVEL = "v6";

/** Flags that gate behaviour for a fresh world only and must not be on in a running one. */
export const FRESH_WORLD_ONLY_FLAGS: readonly string[] = Object.freeze([
  "nppTurnoverEnabled",
  "nppPartyRenewalEnabled",
]);

/**
 * Retired name of the per-bucket approval field. Joined from parts so the
 * retired term does not reappear in source; only its stored name matters here.
 */
export const LEGACY_APPROVAL_FIELD = ["arche", "typeApprovals"].join("");

export interface StateEvidence {
  id: string;
  countryId: string;
  gdp?: unknown;
  population?: unknown;
  houseDistricts?: unknown;
  stateSenateSeats?: unknown;
}

/** A state-document seat field a chamber spawner reads for a country. */
export interface SeatFieldRequirement {
  countryId: string;
  field: "houseDistricts" | "stateSenateSeats";
  /**
   * `positive`: every state must hold a value above zero (the spawner throws
   * otherwise). `present`: zero is allowed per state (a district or territory
   * with no seats) but every value must be a number and the country total
   * must be above zero.
   */
  level: "positive" | "present";
  /** Where the requirement comes from, for the operator. */
  source: string;
}

export interface LegacyFieldCounts {
  charactersLegacyApprovals: number;
  nppsLegacyApprovals: number;
  legislationTypesLegacyApprovals: number;
}

export interface PreflightInput {
  mode: PreflightMode;
  /** Countries simulated in full in the target world. */
  countries: readonly string[];
  /** Null when the `current` gameState document is missing. */
  gameState: Readonly<Record<string, unknown>> | null;
  states: readonly StateEvidence[];
  seatRequirements: readonly SeatFieldRequirement[];
  legacy: LegacyFieldCounts;
  /** Country ids whose federal budget already carries a stored priceIndex. */
  priceIndexCountries: readonly string[];
}

const SAMPLE = 5;

const isPositive = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonNegative = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const sample = (ids: readonly string[]): string =>
  ids.slice(0, SAMPLE).join(", ") + (ids.length > SAMPLE ? ` (+${ids.length - SAMPLE} more)` : "");

function flagFindings(input: PreflightInput): PreflightFinding[] {
  const out: PreflightFinding[] = [];
  const state = input.gameState;
  if (!state) {
    return [
      { severity: "fail", check: "removed-flags", detail: "the current gameState is missing" },
    ];
  }
  const off = REMOVED_ALWAYS_ON_FLAGS.filter((flag) => state[flag] === false);
  if (off.length > 0) {
    out.push({
      severity: "fail",
      check: "removed-flags",
      detail: `explicitly false, and the gate no longer exists so the feature turns on: ${off.join(", ")}`,
    });
  }
  const killed = KILL_SWITCH_FLAGS.filter((flag) => state[flag] === false);
  if (killed.length > 0) {
    out.push({
      severity: "warn",
      check: "kill-switches",
      detail: `kill switch off, so the system will not run: ${killed.join(", ")}`,
    });
  }
  const absent = REMOVED_ALWAYS_ON_FLAGS.filter((flag) => !(flag in state));
  if (absent.length > 0 && input.mode === "pre-reset") {
    out.push({
      severity: "warn",
      check: "removed-flags",
      detail: `absent on the running world (confirm these were never switched on by design): ${absent.join(", ")}`,
    });
  }
  const level = state.nppAutonomyLevel;
  if (level !== EXPECTED_AUTONOMY_LEVEL) {
    out.push({
      severity: "warn",
      check: "npp-autonomy-level",
      detail: `NPP autonomy is ${typeof level === "string" ? level : "unset"}, expected ${EXPECTED_AUTONOMY_LEVEL}: NPP-run countries lose the engine 6 decision and governance behaviour`,
    });
  }
  const stray = FRESH_WORLD_ONLY_FLAGS.filter((flag) => state[flag] === true);
  if (stray.length > 0 && input.mode === "pre-reset") {
    out.push({
      severity: "fail",
      check: "fresh-world-only-flags",
      detail: `on in the running world but meant for a fresh world only: ${stray.join(", ")}`,
    });
  }
  return out;
}

function stateFindings(input: PreflightInput): PreflightFinding[] {
  const out: PreflightFinding[] = [];
  for (const countryId of input.countries) {
    const rows = input.states.filter((row) => row.countryId === countryId);
    if (rows.length === 0) {
      out.push({
        severity: "fail",
        check: "state-gdp-population",
        detail: `${countryId} has no state documents`,
      });
      continue;
    }
    const badGdp = rows.filter((row) => !isPositive(row.gdp)).map((row) => row.id);
    if (badGdp.length > 0) {
      out.push({
        severity: "fail",
        check: "state-gdp-population",
        detail: `${countryId}: ${badGdp.length} of ${rows.length} state(s) without positive gdp, e.g. ${sample(badGdp)}`,
      });
    }
    const badPop = rows.filter((row) => !isPositive(row.population)).map((row) => row.id);
    if (badPop.length > 0) {
      out.push({
        severity: "fail",
        check: "state-gdp-population",
        detail: `${countryId}: ${badPop.length} of ${rows.length} state(s) without positive population, e.g. ${sample(badPop)}`,
      });
    }
  }
  return out;
}

function seatFindings(input: PreflightInput): PreflightFinding[] {
  const out: PreflightFinding[] = [];
  for (const req of input.seatRequirements) {
    if (!input.countries.includes(req.countryId)) continue;
    const rows = input.states.filter((row) => row.countryId === req.countryId);
    if (rows.length === 0) continue;
    const value = (row: StateEvidence): unknown => row[req.field];
    const bad =
      req.level === "positive"
        ? rows.filter((row) => !isPositive(value(row)))
        : rows.filter((row) => !isNonNegative(value(row)));
    if (bad.length > 0) {
      out.push({
        severity: "fail",
        check: "chamber-seat-fields",
        detail: `${req.countryId}.${req.field} missing or ${req.level === "positive" ? "not positive" : "not a number"} on ${bad.length} of ${rows.length} state(s), e.g. ${sample(bad.map((row) => row.id))} (${req.source})`,
      });
      continue;
    }
    const total = rows.reduce((sum, row) => sum + Number(value(row)), 0);
    if (!(total > 0)) {
      out.push({
        severity: "fail",
        check: "chamber-seat-fields",
        detail: `${req.countryId}.${req.field} totals zero across ${rows.length} state(s) (${req.source})`,
      });
    }
  }
  return out;
}

function legacyFindings(input: PreflightInput): PreflightFinding[] {
  const { legacy, mode } = input;
  const rows: Array<[string, number, string]> = [
    [
      `characters.${LEGACY_APPROVAL_FIELD}`,
      legacy.charactersLegacyApprovals,
      "characters are retired or deleted by the reset",
    ],
    [
      `npps.${LEGACY_APPROVAL_FIELD}`,
      legacy.nppsLegacyApprovals,
      "NPPs are deleted and regenerated by the reset",
    ],
    [
      "legislationTypes.policyOptions legacy approvals",
      legacy.legislationTypesLegacyApprovals,
      "legislation types are cleared and reseeded by a reference rebuild",
    ],
  ];
  const out: PreflightFinding[] = [];
  for (const [label, count, reason] of rows) {
    if (count <= 0) continue;
    if (mode === "fresh") {
      out.push({
        severity: "fail",
        check: "legacy-fields",
        detail: `${count} document(s) still carry ${label} in a fresh world`,
      });
    } else {
      out.push({
        severity: "warn",
        check: "legacy-fields",
        detail: `${count} document(s) carry ${label}; moot for a full reset (${reason})`,
      });
    }
  }
  return out;
}

function priceIndexFindings(input: PreflightInput): PreflightFinding[] {
  if (input.priceIndexCountries.length === 0) return [];
  return [
    {
      severity: "fail",
      check: "price-index",
      detail: `federalBudget already stores priceIndex for ${sample(input.priceIndexCountries)}; it must be absent so the index starts at the new world`,
    },
  ];
}

export function evaluatePreflight(input: PreflightInput): PreflightFinding[] {
  return [
    ...flagFindings(input),
    ...stateFindings(input),
    ...seatFindings(input),
    ...legacyFindings(input),
    ...priceIndexFindings(input),
  ];
}

export function formatPreflightFinding(finding: PreflightFinding): string {
  return `${finding.severity.toUpperCase()} ${finding.check}: ${finding.detail}`;
}
