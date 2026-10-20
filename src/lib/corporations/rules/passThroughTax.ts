/**
 * Pass-through owner taxation.
 *
 * A pass-through structure (US LLC and S-Corp, UK LLP) pays no corporate tax
 * because its owners are taxed on their full share of the profit, whether or not
 * it is paid out. Before this reform the game taxed only the dividends owners
 * actually received, so every unpaid share of profit escaped tax entirely and
 * pass-through firms compounded untaxed earnings.
 *
 * The reform taxes the whole profit at the owners' rates, collected at source:
 * - character holders pay the home country's top personal income rate plus the
 *   headquarters state's top personal income rate;
 * - every other holder (parent corporations, NPPs, funds, unplaced float) pays
 *   the home country's domestic corporate rate plus the state corporate rate,
 *   the rate their own profit would face.
 * Distributions from a pass-through are then not taxed a second time.
 *
 * Forms real law taxes as companies move to standard corporate tax instead:
 * a Japanese godo kaisha, any pass-through whose shares trade publicly, and an
 * S-Corp that fails the S-Corp ownership test (see passThroughStatus).
 *
 * Both changes phase in linearly over PASS_THROUGH_PHASE_IN_TURNS from the
 * configured start turn. Before the start turn every helper returns the legacy
 * value, so worlds without the config are byte-identical.
 */
import type { LegalStructure, LegalStructureId } from "@/lib/constants/legalStructures";

export const PASS_THROUGH_PHASE_IN_TURNS = 24;

/** Structures labelled pass-through that real tax law treats as companies. */
export const PASS_THROUGH_TAXED_AS_COMPANY: ReadonlySet<LegalStructureId> =
  new Set<LegalStructureId>(["jp_gk"]);

/** Reform progress 0 to 1. Undefined or future start turn returns 0 (legacy). */
export function passThroughReformPhase(
  turn: number | null | undefined,
  fromTurn: number | null | undefined
): number {
  if (!Number.isFinite(turn as number) || !Number.isFinite(fromTurn as number)) return 0;
  const elapsed = (turn as number) - (fromTurn as number) + 1;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / PASS_THROUGH_PHASE_IN_TURNS);
}

export type PassThroughTaxMode = "none" | "ownerFlowThrough" | "companyPhaseIn";

/** Why a pass-through form is taxed as a company under the reform. */
export type PassThroughCompanyReason = "taxedAsCompany" | "listed" | "sCorpIneligible";

/** S-Corp eligibility: at most this many holders, all of them individuals. */
export const S_CORP_MAX_HOLDERS = 100;

/** The ownership facts that decide whether pass-through treatment survives. */
export interface PassThroughOwnership {
  /** True when the corporation has no public listing. */
  isPrivate?: boolean;
  /** Shares in public float; any float means the shares trade publicly. */
  publicFloat?: number;
  shareholders?: ReadonlyArray<{
    characterId?: unknown;
    imperialCharacterId?: unknown;
  }>;
}

export interface PassThroughStatus {
  mode: PassThroughTaxMode;
  reason?: PassThroughCompanyReason;
}

/**
 * How a corporation's structure is taxed under the reform, mirroring real law:
 * - a godo kaisha is taxed as a company in Japan;
 * - a pass-through whose shares trade publicly is taxed as a company (US
 *   publicly traded partnership rule; a UK LLP cannot offer shares at all);
 * - an S-Corp with more than 100 holders or any non-individual holder loses
 *   S status and is taxed as a company.
 * Every other pass-through is taxed through its owners.
 */
export function passThroughStatus(
  structure: Pick<LegalStructure, "id" | "taxTreatment">,
  ownership?: PassThroughOwnership
): PassThroughStatus {
  if (structure.taxTreatment !== "pass_through") return { mode: "none" };
  if (PASS_THROUGH_TAXED_AS_COMPANY.has(structure.id)) {
    return { mode: "companyPhaseIn", reason: "taxedAsCompany" };
  }
  if (ownership) {
    const listed = ownership.isPrivate !== true || (ownership.publicFloat ?? 0) > 0;
    if (listed) return { mode: "companyPhaseIn", reason: "listed" };
    if (structure.id === "us_s_corp") {
      const holders = ownership.shareholders ?? [];
      const nonIndividual = holders.some((h) => !h.characterId && !h.imperialCharacterId);
      if (nonIndividual || holders.length > S_CORP_MAX_HOLDERS) {
        return { mode: "companyPhaseIn", reason: "sCorpIneligible" };
      }
    }
  }
  return { mode: "ownerFlowThrough" };
}

/** Back-compatible mode lookup. */
export function passThroughTaxMode(
  structure: Pick<LegalStructure, "id" | "taxTreatment">,
  ownership?: PassThroughOwnership
): PassThroughTaxMode {
  return passThroughStatus(structure, ownership).mode;
}

/**
 * Multiplier on the per-sector corporate rate. Standard and preferential forms
 * are unchanged. A pass-through owed by its owners stays at 0 (the owner tax is
 * collected separately); a pass-through taxed as a company ramps 0 to 1.
 */
export function corporateTaxMultiplierFor(
  structure: Pick<LegalStructure, "id" | "taxTreatment" | "taxMultiplier">,
  phase: number,
  ownership?: PassThroughOwnership
): number {
  if (structure.taxTreatment === "preferential") return structure.taxMultiplier ?? 1;
  if (structure.taxTreatment !== "pass_through") return 1;
  return passThroughTaxMode(structure, ownership) === "companyPhaseIn" ? clamp01(phase) : 0;
}

/** Short player-facing tax label for a structure (optionally for one corporation). */
export function legalStructureTaxLabel(
  structure: Pick<LegalStructure, "id" | "taxTreatment" | "taxMultiplier">,
  phase: number,
  ownership?: PassThroughOwnership
): string {
  if (structure.taxTreatment === "preferential") {
    return `preferential tax, ${((structure.taxMultiplier ?? 1) * 100).toFixed(0)}% of the standard rate`;
  }
  if (structure.taxTreatment !== "pass_through") return "standard tax";
  if (phase <= 0) return "pass-through, owners taxed only on payouts";
  const status = passThroughStatus(structure, ownership);
  if (status.mode === "ownerFlowThrough") return "pass-through, owners taxed on all profit";
  if (status.reason === "listed") return "taxed as a company because its shares trade publicly";
  if (status.reason === "sCorpIneligible") {
    return "taxed as a company: S-Corp status needs 100 or fewer holders, all individuals";
  }
  return "taxed as a company";
}

export interface PassThroughHolder {
  /** True for a player or imperial character holding directly. */
  personal: boolean;
  shares: number;
}

export interface OwnerRates {
  /** National top personal income rate, percent. */
  personalNationalPct: number;
  /** Headquarters state top personal income rate, percent. */
  personalStatePct: number;
  /** National domestic corporate rate, percent. */
  corporateNationalPct: number;
  /** Headquarters state domestic corporate rate, percent. */
  corporateStatePct: number;
}

export interface OwnerRateSplit {
  /** Blended rate owed to the national treasury, percent of taxable profit. */
  nationalPct: number;
  /** Blended rate owed to the headquarters state, percent of taxable profit. */
  statePct: number;
}

/**
 * Share-weighted owner rate. Shares not held by anyone listed (public float,
 * unplaced issuance) are withheld at the corporate rate.
 */
export function blendedOwnerRate(
  holders: readonly PassThroughHolder[],
  totalShares: number,
  rates: OwnerRates
): OwnerRateSplit {
  const total = Number.isFinite(totalShares) && totalShares > 0 ? totalShares : 0;
  if (total === 0) {
    return { nationalPct: rates.corporateNationalPct, statePct: rates.corporateStatePct };
  }
  let personal = 0;
  for (const h of holders) {
    if (h.personal && Number.isFinite(h.shares) && h.shares > 0) personal += h.shares;
  }
  const personalShare = Math.min(1, personal / total);
  const otherShare = 1 - personalShare;
  return {
    nationalPct:
      personalShare * finitePct(rates.personalNationalPct) +
      otherShare * finitePct(rates.corporateNationalPct),
    statePct:
      personalShare * finitePct(rates.personalStatePct) +
      otherShare * finitePct(rates.corporateStatePct),
  };
}

/**
 * Owner tax on a pass-through's taxable profit this turn. Taxable profit is the
 * consolidated operating profit plus bond coupon income, floored at zero.
 */
export function passThroughOwnerTax(args: {
  taxableProfit: number;
  phase: number;
  rates: OwnerRateSplit;
}): { national: number; state: number } {
  const base = Number.isFinite(args.taxableProfit) ? Math.max(0, args.taxableProfit) : 0;
  const p = clamp01(args.phase);
  if (base === 0 || p === 0) return { national: 0, state: 0 };
  // A combined rate above 100% would tax more than the profit; cap it.
  const combined = Math.min(100, args.rates.nationalPct + args.rates.statePct);
  const scale = combined > 0 ? combined / (args.rates.nationalPct + args.rates.statePct) : 0;
  return {
    national: base * p * ((args.rates.nationalPct * scale) / 100),
    state: base * p * ((args.rates.statePct * scale) / 100),
  };
}

/**
 * Share of a pass-through distribution already taxed at source, so the
 * recipient is not taxed on it again. Only owner flow-through structures
 * qualify; a godo kaisha's dividends are ordinary dividends.
 */
export function alreadyTaxedDistributionShare(
  structure: Pick<LegalStructure, "id" | "taxTreatment">,
  phase: number,
  ownership?: PassThroughOwnership
): number {
  return passThroughTaxMode(structure, ownership) === "ownerFlowThrough" ? clamp01(phase) : 0;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function finitePct(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.min(100, v) : 0;
}
