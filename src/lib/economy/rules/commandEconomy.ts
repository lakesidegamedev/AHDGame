import type { CountryId } from "@/lib/constants/countries";
import { type OperatingSectorType } from "@/lib/constants/corporationsClient";
import { getCountryIdForCurrency, type CurrencyCode } from "@/lib/constants/currencies";
import { SOE_PERF_BASELINE } from "@/lib/economy/soe";
import { MARKETIZATION_SCHEDULE } from "@/lib/constants/marketizationSchedule";
import {
  MARKET_LEVEL,
  COMMAND_CEILING,
  DUAL_TRACK_CEILING,
  CURTAIN_EXEMPT_COUNTRIES,
  COMMAND_ECONOMY_SOE_SECTORS,
  MARKETIZATION_DRIFT_WEIGHTS,
  type MarketizationDriftWeights,
  MARKETIZATION_GRAVITY_RATE,
  MARKETIZATION_GRAVITY_MAX_STEP,
  NPP_DEFAULT_BUDGET_SOFTNESS,
  NPP_DEFAULT_INTERNAL_REPRESSION,
  BUDGET_SOFTNESS_FOLD_THRESHOLD,
  REFORMISM_PARTY_WEIGHT,
  REFORMISM_CABINET_WEIGHT,
  POLICY_GOV_WEIGHT,
  POLICY_GOSBANK_WEIGHT,
} from "@/lib/constants/commandEconomyTables";

/**
 * Command Economy v2: stored, endogenous marketization levels.
 *
 * `marketizationLevel` is stateful under v2, drifting each turn and persisted
 * per country. To preserve the accessor's signature for downstream consumers,
 * the stored value lives in this process-level registry: the turn phase
 * hydrates it from the DB and writes the drifted value back so later phases
 * see the current level. Absent an entry, the accessor falls back to the era
 * SCHEDULE (which also seeds the stored value the first time).
 *
 * SEAM: read-only API/UI request paths run in separate processes and will not
 * share this registry; hydrate it from
 * `FederalBudget.economicFactors.marketizationLevel` before rendering the
 * marketization gauge. The turn engine (single process) is fully covered.
 */
const storedMarketizationLevels = new Map<string, number>();

/** Store/override a country's live marketization level (clamped 0..100). */
export function setStoredMarketizationLevel(countryId: string, level: number): void {
  if (!countryId || !Number.isFinite(level)) return;
  storedMarketizationLevels.set(countryId, Math.max(0, Math.min(MARKET_LEVEL, level)));
}

/** Read the stored live level for a country, or undefined if none is stored. */
export function getStoredMarketizationLevel(countryId: string): number | undefined {
  return storedMarketizationLevels.get(countryId);
}

/** Replace the whole registry from persisted state (turn-phase hydration). */
export function hydrateStoredMarketizationLevels(entries: Iterable<[string, number]>): void {
  storedMarketizationLevels.clear();
  for (const [countryId, level] of entries) setStoredMarketizationLevel(countryId, level);
}

/** Clear all stored levels (test isolation / world teardown). */
export function clearStoredMarketizationLevels(): void {
  storedMarketizationLevels.clear();
}

/**
 * The era-schedule marketization level for a country/year — the SEED value the
 * stored level starts from. Pure; used by the persistence layer to initialise a
 * country that has no stored level yet.
 */
export function scheduledMarketizationLevel(
  countryId: string | null | undefined,
  currentYear: number | null | undefined
): number {
  if (!countryId) return MARKET_LEVEL;
  const steps = MARKETIZATION_SCHEDULE[countryId as CountryId];
  if (!steps || currentYear == null || !Number.isFinite(currentYear)) return MARKET_LEVEL;
  for (const step of steps) {
    if (currentYear <= step.throughYear) return step.level;
  }
  return MARKET_LEVEL;
}

/**
 * Marketization level (0 command → 100 market) for a country in a given in-game
 * year. Pure and hot-loop safe. Returns the STORED live level when one is
 * present (v2 endogenous drift), otherwise falls back to the era SCHEDULE (the
 * seed). Fail-safe: unknown country/year → MARKET_LEVEL. Does NOT consult the
 * feature flag — callers gate on `enabled` themselves (see the band predicates).
 */
export function marketizationLevel(
  countryId: string | null | undefined,
  currentYear: number | null | undefined
): number {
  if (countryId) {
    const stored = storedMarketizationLevels.get(countryId);
    if (stored != null) return stored;
  }
  return scheduledMarketizationLevel(countryId, currentYear);
}

/**
 * True when the country is a FULLY COMMAND economy in the given year AND the
 * feature is enabled. Fail-safe (flag off / unknown → false). This gates the
 * binary planned subsystems: fixed non-convertible currency, passive monobank,
 * administered CPI, soft budget.
 */
export function isCommandEconomy(
  countryId: string | null | undefined,
  currentYear: number | null | undefined,
  enabled: boolean | null | undefined
): boolean {
  if (!enabled) return false;
  return marketizationLevel(countryId, currentYear) < COMMAND_CEILING;
}

/**
 * First currency in `currencies` whose anchor country is fully command in
 * `currentYear` (flag on). Fail-safe: flag off / unknown → null. Used by FX
 * placement routes to refuse open-market trades of non-convertible money.
 */
export function nonConvertibleTradeCurrency(
  currencies: readonly CurrencyCode[],
  currentYear: number | null | undefined,
  enabled: boolean | null | undefined
): CurrencyCode | null {
  if (!enabled) return null;
  for (const code of currencies) {
    if (isCommandEconomy(getCountryIdForCurrency(code), currentYear, enabled)) {
      return code;
    }
  }
  return null;
}

/** Player-facing refusal copy for {@link nonConvertibleTradeCurrency}. */
export function nonConvertibleCurrencyMessage(currency: CurrencyCode): string {
  return `${currency} is non-convertible under a command economy and cannot be traded on the open market.`;
}

/**
 * True when the country is DUAL-TRACK (plan + market in parallel) in the given
 * year AND the feature is enabled.
 */
export function isDualTrackEconomy(
  countryId: string | null | undefined,
  currentYear: number | null | undefined,
  enabled: boolean | null | undefined
): boolean {
  if (!enabled) return false;
  const level = marketizationLevel(countryId, currentYear);
  return level < DUAL_TRACK_CEILING && level >= COMMAND_CEILING;
}

/**
 * True when ANY planned machinery is active (command OR dual-track) AND enabled.
 * Convenience gate for subsystems (overhang, administered prices, second
 * economy) that operate across both bands, scaled by `plannedShare`.
 */
export function isPlannedEconomy(
  countryId: string | null | undefined,
  currentYear: number | null | undefined,
  enabled: boolean | null | undefined
): boolean {
  if (!enabled) return false;
  return marketizationLevel(countryId, currentYear) < DUAL_TRACK_CEILING;
}

/**
 * True when a country sits behind the iron curtain for TRADE purposes: a
 * planned economy that is not curtain-exempt. This is the single membership
 * authority for `buildTradeAffinity`'s `curtainedCountries` at every call
 * site — the ledger and the corp clearing books must never disagree about who
 * is behind the wall.
 */
export function isCurtained(
  countryId: string | null | undefined,
  currentYear: number | null | undefined,
  enabled: boolean | null | undefined
): boolean {
  if (countryId && CURTAIN_EXEMPT_COUNTRIES.has(countryId)) return false;
  return isPlannedEconomy(countryId, currentYear, enabled);
}

/**
 * Share of an economy's activity governed by the PLAN rather than the market
 * (1 at full command → 0 at the dual-track ceiling and above). Drives dual-track
 * splits, administered-price coverage, and overhang accumulation. Returns 0 when
 * the flag is off or the country is market.
 */
export function plannedShare(
  countryId: string | null | undefined,
  currentYear: number | null | undefined,
  enabled: boolean | null | undefined
): number {
  if (!enabled) return 0;
  const level = marketizationLevel(countryId, currentYear);
  if (level >= DUAL_TRACK_CEILING) return 0;
  return Math.max(0, Math.min(1, 1 - level / DUAL_TRACK_CEILING));
}

/** The SOE sector set for a country (empty when the country isn't multi-SOE). */
export function commandEconomySoeSectors(
  countryId: string | null | undefined
): OperatingSectorType[] {
  if (!countryId) return [];
  return COMMAND_ECONOMY_SOE_SECTORS[countryId as CountryId] ?? [];
}

/**
 * The signed per-turn change in marketization level (before clamping), from the
 * three fully-free drivers. This function itself carries NO era gravity — it is
 * the pure player/economy channel, and history can break. The weak restoring
 * pull toward the era schedule is a SEPARATE, smaller term the turn phase adds
 * on top ({@link marketizationGravity}), kept separate precisely so the free
 * drivers can be reasoned about — and beat it — on their own.
 * See {@link MARKETIZATION_DRIFT_WEIGHTS}.
 *
 * @param blackMarketPressure 0..1 — shortage / black-market / second-economy pressure
 * @param soePerf             aggregate SOE plan fulfillment (1.0 = on plan)
 * @param policyStance        −1 (hardline orthodox) .. +1 (reformist)
 */
export function marketizationDrift(
  blackMarketPressure: number,
  soePerf: number,
  policyStance: number,
  weights: MarketizationDriftWeights = MARKETIZATION_DRIFT_WEIGHTS
): number {
  const clamp = (v: number, lo: number, hi: number) =>
    !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));
  const bm = clamp(blackMarketPressure, 0, 1);
  const perf = Number.isFinite(soePerf) ? soePerf : SOE_PERF_BASELINE;
  const pol = clamp(policyStance, -1, 1);
  return (
    weights.blackMarket * bm +
    weights.soePerformance * (SOE_PERF_BASELINE - perf) +
    weights.policyStance * pol
  );
}

/**
 * Signed per-turn ERA-GRAVITY term: a weak, saturating restoring pull from
 * the live level toward {@link scheduledMarketizationLevel}.
 *
 * This is GRAVITY, not RAILS: it is a small restoring force (rate × gap,
 * capped at {@link MARKETIZATION_GRAVITY_MAX_STEP}), never an assignment.
 * The cap is below what the three free drivers can sustain
 * ({@link MARKETIZATION_DRIFT_WEIGHTS} sum to 0.64 of headroom), so real
 * reform or entrenchment overwhelms it. It is exactly zero at the scheduled
 * level, so a world that has never drifted is byte-identical.
 *
 * Without it, a pinned-negative policy-stance term (see
 * {@link blendGovernmentReformism}) ratchets every bloc country monotonically
 * to the 0 floor, below the authored schedule regardless of play. The intended
 * default when nobody intervenes is the historical level; deviation should be
 * earned in either direction.
 */
export function marketizationGravity(level: number, scheduledLevel: number): number {
  if (!Number.isFinite(level) || !Number.isFinite(scheduledLevel)) return 0;
  const pull = MARKETIZATION_GRAVITY_RATE * (scheduledLevel - level);
  return Math.max(-MARKETIZATION_GRAVITY_MAX_STEP, Math.min(MARKETIZATION_GRAVITY_MAX_STEP, pull));
}

/** Apply a drift to a stored level, clamped to [0, MARKET_LEVEL]. */
export function driftMarketizationLevel(level: number, drift: number): number {
  const base = Number.isFinite(level) ? level : MARKET_LEVEL;
  const d = Number.isFinite(drift) ? drift : 0;
  return Math.max(0, Math.min(MARKET_LEVEL, base + d));
}

/**
 * Command Economy v2 (internal repression): map a government's signed reformism
 * [-1 hardline orthodox … +1 reformist] to a DEFAULT internal-repression level
 * in [0, 1]. Orthodox governments repress the second economy to stay communist
 * (moderate-to-high); reformist governments let it breathe (low). Neutral (0) →
 * the moderate {@link NPP_DEFAULT_INTERNAL_REPRESSION}. Derived from the SAME
 * reformism read that drives the marketization policy stance, so the NPP brain's
 * repression posture and its reform posture stay consistent. NaN-guarded.
 */
export function internalRepressionFromReformism(reformism: number | null | undefined): number {
  const r =
    typeof reformism === "number" && Number.isFinite(reformism)
      ? Math.max(-1, Math.min(1, reformism))
      : 0;
  return Math.max(0, Math.min(1, NPP_DEFAULT_INTERNAL_REPRESSION - 0.5 * r));
}

/**
 * Whether an insolvent command SOE is SPARED (kept alive, losses persist) under a
 * given budget-softness dial. Soft (≥ threshold) → spared; hard (< threshold) →
 * allowed to fold. Absent/non-finite softness → the NPP-brain soft default, so a
 * world that hasn't written a softness yet keeps the historical spare-everyone
 * behaviour. Consumed by `nppInsolvencyDissolution`.
 */
export function isSoeSpared(budgetSoftness: number | undefined | null): boolean {
  const s =
    typeof budgetSoftness === "number" && Number.isFinite(budgetSoftness)
      ? budgetSoftness
      : NPP_DEFAULT_BUDGET_SOFTNESS;
  return s >= BUDGET_SOFTNESS_FOLD_THRESHOLD;
}

/**
 * Command Economy v2 (P3): the LIVE government-reformism signal in [-1, 1],
 * derived from the elected governing party's economic position (−5 command-left …
 * +5 market-right → −1 … +1). This closes the P2 read-path seam: instead of the
 * marketization drift's government-reformism term depending solely on the
 * NPP-brain's `commandStance.reformism` (which is never written for a
 * player-headed government), it now reads WHO ACTUALLY GOVERNS. A market-leaning
 * ruling party (or one shifted rightward through position-shift gameplay) reads
 * reformist (+, marketization rises); an orthodox command-left party reads
 * hardline (−, entrenches). Reflects election outcomes and party-position shifts
 * for both player- and NPP-led governments. NaN-guarded; absent → undefined so
 * the caller can fall back to the NPP-brain stance then the neutral default.
 */
export function governmentReformismFromEconomicPosition(
  economicPosition: number | null | undefined
): number | undefined {
  if (typeof economicPosition !== "number" || !Number.isFinite(economicPosition)) {
    return undefined;
  }
  return Math.max(-1, Math.min(1, economicPosition / 5));
}

/**
 * The government-reformism signal fed to {@link computePolicyStance}, blended
 * from the two things that legitimately speak for "the regime":
 *
 *  1. `partyReformism` — the RULING PARTY's chartered economic line
 *     ({@link governmentReformismFromEconomicPosition} of
 *     `politicalParties.economicPosition`). This is the SLOW anchor: it only
 *     moves when a party committee passes a `positionShift` proposal
 *     (`applyPositionShiftEffect`, one ±1 step per axis behind a 336-turn ≈
 *     7-game-year cooldown) or when an election changes which party governs.
 *  2. `cabinetReformism` — the SITTING government's live command stance
 *     (`governmentFormations.commandStance.reformism`, re-derived every turn by
 *     `deriveCommandStance` from the head of government's economic scalar and
 *     governing archetype, which itself drifts via `processNppStanceDrift`).
 *     This is the FAST component: what the government actually does now.
 *
 * P3 originally made (1) take absolute PRECEDENCE over (2). That was a
 * regression, not a fix: `economicPosition` is written only by the player-only
 * committee-proposal path, so in an NPP-run one-party state it is a CONSTANT for
 * the entire game — and because it shadowed the live cabinet stance entirely, it
 * pinned `policyStance` negative no matter how the government behaved. With a
 * chartered line at −5 (reformism −1) the term contributes
 * POLICY_GOV_WEIGHT × −1 = −0.6, which no amount of reformist Gosbank posture
 * (max +POLICY_GOSBANK_WEIGHT = +0.4) can outweigh: the dial could only ever
 * fall. Blending restores a live input in BOTH directions while keeping the
 * chartered line as a genuine, hard-to-move commitment.
 *
 * Returns `undefined` when neither input is finite so the caller can fall back
 * to {@link NPP_DEFAULT_REFORMISM}.
 */
export function blendGovernmentReformism(
  partyReformism: number | null | undefined,
  cabinetReformism: number | null | undefined
): number | undefined {
  const finite = (v: number | null | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : undefined;
  const party = finite(partyReformism);
  const cabinet = finite(cabinetReformism);
  if (party == null && cabinet == null) return undefined;
  if (party == null) return cabinet;
  if (cabinet == null) return party;
  return Math.max(
    -1,
    Math.min(1, REFORMISM_PARTY_WEIGHT * party + REFORMISM_CABINET_WEIGHT * cabinet)
  );
}

/**
 * The signed reform-vs-orthodox POLICY STANCE in [-1, 1] feeding the
 * marketization drift's `w_pol` term. Replaces the P0 tolerance placeholder with
 * a genuine read of two inputs:
 *
 *  1. GOVERNMENT composition (`reformism`, −1 hardline orthodox … +1 reformist)
 *     — derived from the head of government's economic scalar + archetype
 *     (reformist cabinet/legislature pushes toward the market).
 *  2. GOSBANK posture — restrained credit + HARD budgets read as reformist (+,
 *     market discipline); flooding SOEs with credit + SOFT budgets read as
 *     orthodox (−, propping up the plan). Both dials are centered at 0.5.
 *
 * Reformist government + a disciplined Gosbank → positive (marketization rises);
 * orthodox government + a soft, credit-flooding Gosbank → negative (entrenches).
 */
export function computePolicyStance(
  reformism: number,
  creditAggressiveness: number,
  budgetSoftness: number
): number {
  const clamp = (v: number, lo: number, hi: number) =>
    !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));
  const r = clamp(reformism, -1, 1);
  const ca = clamp(creditAggressiveness, 0, 1);
  const bs = clamp(budgetSoftness, 0, 1);
  // Orthodox Gosbank = aggressive credit AND soft budgets → negative posture.
  const gosbank = clamp(-(ca - 0.5 + (bs - 0.5)), -1, 1);
  return clamp(POLICY_GOV_WEIGHT * r + POLICY_GOSBANK_WEIGHT * gosbank, -1, 1);
}
