/**
 * Scripted foreign policy for the 2027 background countries (#5702 section 5).
 *
 * A background country has a government (nationalPolitics.ts) but no
 * ministers or legislature, so this script stands in for them. The ruling
 * parties' position on the party grid sets a stance; the stance drives:
 *
 * - the national tariff (economy-wide, plus a targeted tariff on the rival
 *   bloc's leader) through the existing tariff rows;
 * - a small alignment pull the alignment phase adds to its drift vector, which
 *   is what lets the existing accession and defection rules move the country
 *   into or out of a bloc;
 * - sanctions on a country at war with one of its partners, as time-limited
 *   embargoes that lapse when the cause does;
 * - whether it answers a bloc's call to join a war, and how it answers a
 *   living conflict's global response.
 *
 * Every escalation has an off-ramp: sanctions expire and are lifted early when
 * their cause ends or a dovish government takes over, a declined war call is
 * never asked again, and the script never declares a war of its own.
 *
 * Pure: plain data in, plain data out. Grid: economic -5 (statist) to +5
 * (market), social -5 (progressive) to +5 (conservative).
 */
import type { CommodityType } from "@/lib/constants/commoditiesCore";
import { CN_BLOC_LEADER, US_BLOC_LEADER, type WorldBlocId } from "@/lib/coldwar/rules/blocTension";
import type { NationalPoliticsState } from "./nationalPolitics";

export interface GovernmentLean {
  economic: number;
  social: number;
}

export interface ForeignStance {
  /** 0 free trade to 1 closed. */
  protectionism: number;
  /** 0 dovish to 1 hawkish. */
  hawkishness: number;
  /** -1 sovereigntist to +1 Western-oriented. */
  orientation: number;
}

/** Centrist reading for a country whose government is not formed yet. */
export const NEUTRAL_LEAN: GovernmentLean = { economic: 0, social: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Seat-weighted position of the governing parties, or null with no government. */
export function governmentLean(
  state: Pick<NationalPoliticsState, "parties" | "governmentPartyIds">
): GovernmentLean | null {
  let weight = 0;
  let economic = 0;
  let social = 0;
  for (const id of state.governmentPartyIds) {
    const party = state.parties.find((p) => p.partyId === id);
    if (!party) continue;
    const w = Math.max(party.seats, 1);
    weight += w;
    economic += w * party.economic;
    social += w * party.social;
  }
  return weight > 0 ? { economic: economic / weight, social: social / weight } : null;
}

export function foreignStance(lean: GovernmentLean | null): ForeignStance {
  const economic = clamp(lean?.economic ?? 0, -5, 5);
  const social = clamp(lean?.social ?? 0, -5, 5);
  return {
    // Statist and nationalist governments both close the border; market
    // liberals open it.
    protectionism: round3(
      clamp(
        0.3 +
          0.07 * Math.max(0, -economic) +
          0.06 * Math.max(0, social) -
          0.04 * Math.max(0, economic),
        0,
        1
      )
    ),
    hawkishness: round3(clamp(0.4 + 0.07 * social + 0.02 * economic, 0, 1)),
    orientation: round3(clamp(0.2 + 0.04 * economic - 0.12 * social, -1, 1)),
  };
}

export interface ForeignPolicyLogEntry {
  turn: number;
  kind: "tariff" | "sanction" | "lift" | "war" | "response";
  text: string;
}

/** The scripted foreign policy state stored on a background macro document. */
export interface MacroForeignPolicyState {
  stance: ForeignStance;
  bloc: WorldBlocId;
  /** Per-turn alignment pull the alignment phase adds to its drift. */
  alignmentPull: Partial<Record<StancePole, number>>;
  /** Tariff rates the script has set, as last written. */
  tariff: { economyWide: number; targeted: { targetCountryId: string; rate: number } | null };
  /** Smoothed funded-trade balance pressure written to the central bank. */
  tradePressure: number | null;
  /** One decision per bloc war call; a refusal is final. */
  warDecisions: { resolutionId: string; joined: boolean; turn: number }[];
  log: ForeignPolicyLogEntry[];
  updatedTurn: number;
}

// ─── Alignment ────────────────────────────────────────────────────────────────

/**
 * Most share points a government's stance pulls per turn. Kept on the scale of
 * a passive membership pull (0.04), so a government leans its country over
 * years and a deliberate influence play still outweighs it.
 */
export const STANCE_PULL_MAX = 0.05;

export type StancePole = "WASHINGTON" | "BEIJING" | "MOSCOW";

/**
 * The per-turn alignment pull a stance implies. A Western-oriented government
 * pulls toward Washington. A sovereigntist one pulls toward whichever eastern
 * pole its country already leans to, or, in a Western-leaning country, erodes
 * Washington's share into the non-aligned remainder.
 */
export function stanceAlignmentPull(
  stance: ForeignStance,
  shares: Partial<Record<string, number>>
): Partial<Record<StancePole, number>> {
  const strength = round3(STANCE_PULL_MAX * Math.abs(stance.orientation));
  if (strength === 0) return {};
  if (stance.orientation > 0) return { WASHINGTON: strength };
  const west = shares.WASHINGTON ?? 0;
  const beijing = shares.BEIJING ?? 0;
  const moscow = shares.MOSCOW ?? 0;
  if (beijing + moscow > west)
    return beijing >= moscow ? { BEIJING: strength } : { MOSCOW: strength };
  return { WASHINGTON: -strength };
}

// ─── Tariffs ──────────────────────────────────────────────────────────────────

/** The EU common external tariff, which EU members cannot set alone. */
export const EU_COMMON_TARIFF = 4;
/** Most a scripted tariff moves per kernel tick, in rate points. */
export const TARIFF_STEP = 2;
/** A targeted tariff below this is not worth imposing. */
const MIN_TARGETED_TARIFF = 5;

export interface TariffStance {
  economyWide: number;
  /** Targeted tariff on the rival bloc leader, or null for none. */
  targeted: { targetCountryId: string; rate: number } | null;
}

/** The rival bloc's leader a country would target, if it sits in a bloc at all. */
export function rivalLeaderOf(bloc: WorldBlocId, countryId: string): string | null {
  const rival = bloc === "us" ? CN_BLOC_LEADER : bloc === "cn" ? US_BLOC_LEADER : null;
  return rival && rival !== countryId ? rival : null;
}

/**
 * Target tariffs. EU members follow the common external tariff and leave trade
 * defence to the Union; everyone else sets an economy-wide rate from 2 to 16
 * and, if protectionist and hawkish enough, a targeted tariff on the rival
 * bloc's leader.
 */
export function targetTariffStance(input: {
  countryId: string;
  stance: ForeignStance;
  euMember: boolean;
  bloc: WorldBlocId;
}): TariffStance {
  if (input.euMember) return { economyWide: EU_COMMON_TARIFF, targeted: null };
  const economyWide = Math.round(2 + 14 * input.stance.protectionism);
  const rival = rivalLeaderOf(input.bloc, input.countryId);
  const rate = Math.round(30 * input.stance.protectionism * input.stance.hawkishness);
  return {
    economyWide,
    targeted: rival && rate >= MIN_TARGETED_TARIFF ? { targetCountryId: rival, rate } : null,
  };
}

/** Move a current rate at most {@link TARIFF_STEP} toward its target. */
export function stepTariff(current: number | null | undefined, target: number): number {
  if (current == null || !Number.isFinite(current)) return target;
  if (Math.abs(target - current) <= TARIFF_STEP) return target;
  return current + Math.sign(target - current) * TARIFF_STEP;
}

// ─── Sanctions ────────────────────────────────────────────────────────────────

/** Turns a scripted sanction lasts before it must be renewed (half a game year). */
export const SANCTION_TURNS = 24;
/** A sanction this close to lapsing is renewed if its cause still holds. */
const SANCTION_RENEW_WINDOW = 6;
/** Score at which a government sanctions; below it, it lifts its own. */
export const SANCTION_THRESHOLD = 0.6;

export interface WarSides {
  conflictId: string;
  sideA: readonly string[];
  sideB: readonly string[];
}

export interface ScriptedEmbargo {
  targetCountry: string;
  commodity: CommodityType | "all";
  expiresTurn: number;
}

export interface SanctionPlan {
  impose: {
    targetCountry: string;
    commodities: (CommodityType | "all")[];
    expiresTurn: number;
    reason: string;
  }[];
  /** Targets whose scripted embargoes end this turn. */
  lift: { targetCountry: string; reason: string }[];
}

/** Countries at war with one of `partners`, and the war that makes them so. */
export function aggressorsAgainstPartners(
  countryId: string,
  partners: ReadonlySet<string>,
  wars: readonly WarSides[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const war of wars) {
    for (const [own, other] of [
      [war.sideA, war.sideB],
      [war.sideB, war.sideA],
    ] as const) {
      if (!own.some((c) => partners.has(c) || c === countryId)) continue;
      // Never sanction a side it fights for, a partner, or itself.
      if (other.includes(countryId)) continue;
      for (const target of other) {
        if (target === countryId || partners.has(target)) continue;
        if (!out.has(target)) out.set(target, war.conflictId);
      }
    }
  }
  return out;
}

export function sanctionScore(input: {
  stance: ForeignStance;
  approval: number;
  rivalBloc: boolean;
}): number {
  return round3(
    0.45 +
      0.35 * input.stance.hawkishness +
      (input.rivalBloc ? 0.15 : 0) -
      (input.approval < 30 ? 0.15 : 0)
  );
}

export function sanctionCommodities(score: number): (CommodityType | "all")[] {
  if (score >= 0.9) return ["all"];
  if (score >= 0.75) return ["ordnance", "electronics", "rare_earth"];
  return ["ordnance"];
}

/**
 * This tick's sanctions. A country sanctions whoever is at war with one of its
 * partners when its score clears the threshold, renews a lapsing sanction while
 * the cause holds, and lifts its own scripted sanctions as soon as the cause
 * ends or its government no longer would impose them.
 */
export function planSanctions(input: {
  countryId: string;
  stance: ForeignStance;
  approval: number;
  bloc: WorldBlocId;
  blocOf: (countryId: string) => WorldBlocId;
  partners: ReadonlySet<string>;
  wars: readonly WarSides[];
  existing: readonly ScriptedEmbargo[];
  turn: number;
}): SanctionPlan {
  const aggressors = aggressorsAgainstPartners(input.countryId, input.partners, input.wars);
  const active = input.existing.filter((e) => e.expiresTurn >= input.turn);
  const byTarget = new Map<string, ScriptedEmbargo[]>();
  for (const e of active)
    byTarget.set(e.targetCountry, [...(byTarget.get(e.targetCountry) ?? []), e]);

  const plan: SanctionPlan = { impose: [], lift: [] };
  for (const [target, conflictId] of [...aggressors].sort(([a], [b]) => a.localeCompare(b))) {
    const targetBloc = input.blocOf(target);
    const score = sanctionScore({
      stance: input.stance,
      approval: input.approval,
      rivalBloc:
        targetBloc !== input.bloc && targetBloc !== "nonAligned" && input.bloc !== "nonAligned",
    });
    if (score < SANCTION_THRESHOLD) continue;
    const current = byTarget.get(target) ?? [];
    const lapsing =
      current.length === 0 ||
      current.some((e) => e.expiresTurn - input.turn <= SANCTION_RENEW_WINDOW);
    if (!lapsing) continue;
    plan.impose.push({
      targetCountry: target,
      commodities: sanctionCommodities(score),
      expiresTurn: input.turn + SANCTION_TURNS,
      reason: `at war with a partner (${conflictId})`,
    });
  }
  for (const target of [...byTarget.keys()].sort()) {
    if (!aggressors.has(target)) {
      plan.lift.push({ targetCountry: target, reason: "the war that caused it is over" });
      continue;
    }
    const targetBloc = input.blocOf(target);
    const score = sanctionScore({
      stance: input.stance,
      approval: input.approval,
      rivalBloc:
        targetBloc !== input.bloc && targetBloc !== "nonAligned" && input.bloc !== "nonAligned",
    });
    if (score < SANCTION_THRESHOLD) {
      plan.lift.push({ targetCountry: target, reason: "the government no longer backs it" });
    }
  }
  return plan;
}

// ─── War entry ────────────────────────────────────────────────────────────────

export type ScriptedWarStake = "offensive_coalition" | "discretionary";

/** Score needed to answer a bloc's call to war. */
export const WAR_ENTRY_THRESHOLD = 0.65;
/** No government below this approval takes its country into a war. */
export const WAR_ENTRY_MIN_APPROVAL = 40;

/**
 * Whether a background country answers a bloc's call to join a war it is not
 * bound to join. Collective defence and principal belligerents are decided by
 * the existing treaty path, not here. The decision is taken once per call: a
 * refusal stands, which is the off-ramp.
 */
export function decideWarEntry(input: {
  stance: ForeignStance;
  approval: number;
  stake: ScriptedWarStake;
  /** 0-100 intensity of the war being joined. */
  intensity: number;
  /** The side to join already includes one of its partners. */
  partnerOnSide: boolean;
}): { join: boolean; score: number; reason: string } {
  if (input.approval < WAR_ENTRY_MIN_APPROVAL) {
    return {
      join: false,
      score: 0,
      reason: "the government is too weak to take the country to war",
    };
  }
  const score = round3(
    0.3 +
      0.45 * input.stance.hawkishness +
      (input.approval - 50) / 200 +
      (input.partnerOnSide ? 0.1 : 0) -
      (input.stake === "offensive_coalition" ? 0.2 : 0) -
      Math.max(0, Math.min(100, input.intensity)) / 500
  );
  return score >= WAR_ENTRY_THRESHOLD
    ? { join: true, score, reason: "the government answered the call" }
    : { join: false, score, reason: "the government declined the call" };
}

// ─── Living conflicts ─────────────────────────────────────────────────────────

export interface ResponseOptionInput {
  optionId: string;
  /** Sum of the option's positive response scores: how far it commits the country. */
  participation: number;
  /** Options with an up-front budget requirement are skipped. */
  requiresBudget: boolean;
}

/**
 * The option a background government picks in a living conflict's global
 * response: hawks commit most, doves least, everyone else takes the role's
 * default. A weak government never takes the most committed option.
 */
export function chooseGlobalResponse(input: {
  stance: ForeignStance;
  approval: number;
  options: readonly ResponseOptionInput[];
  defaultOptionId: string | null;
}): string | null {
  const options = input.options.filter((o) => !o.requiresBudget);
  if (options.length === 0) return null;
  const ordered = [...options].sort(
    (a, b) => a.participation - b.participation || a.optionId.localeCompare(b.optionId)
  );
  if (input.stance.hawkishness >= 0.6 && input.approval >= 35)
    return ordered[ordered.length - 1].optionId;
  if (input.stance.hawkishness <= 0.35) return ordered[0].optionId;
  const fallback = ordered.find((o) => o.optionId === input.defaultOptionId);
  return (fallback ?? ordered[Math.floor((ordered.length - 1) / 2)]).optionId;
}

// ─── Trade balance and the exchange rate ─────────────────────────────────────

/** Bound on the stored pressure; at the bound the macro FX target moves 4%. */
export const TRADE_BALANCE_PRESSURE_MAX = 0.5;
/** Weight of the newest reading in the smoothed pressure. */
const TRADE_BALANCE_SMOOTHING = 0.5;

/**
 * Exchange-rate pressure from funded trade: the share of two-way trade that is
 * a surplus (+) or deficit (-), scaled by how open the economy is, smoothed
 * across ticks. Positive strengthens the currency.
 */
export function tradeBalancePressure(input: {
  soldValue: number;
  boughtValue: number;
  tradeExposure: number;
  prior: number | null | undefined;
}): number {
  const sold = Math.max(0, Number.isFinite(input.soldValue) ? input.soldValue : 0);
  const bought = Math.max(0, Number.isFinite(input.boughtValue) ? input.boughtValue : 0);
  const total = sold + bought;
  const balance = total > 0 ? (sold - bought) / total : 0;
  const raw = balance * clamp(Number.isFinite(input.tradeExposure) ? input.tradeExposure : 0, 0, 1);
  const prior = input.prior != null && Number.isFinite(input.prior) ? input.prior : raw;
  return round3(
    clamp(
      prior + (raw - prior) * TRADE_BALANCE_SMOOTHING,
      -TRADE_BALANCE_PRESSURE_MAX,
      TRADE_BALANCE_PRESSURE_MAX
    )
  );
}
