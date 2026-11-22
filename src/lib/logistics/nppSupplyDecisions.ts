import type { CommodityType } from "@/lib/constants/commodities";
import { SECTOR_DEMAND, SECTOR_SUPPLY } from "@/lib/constants/commodities";

import type { CorporationType, OperatingSectorType } from "@/lib/constants/corporations";
import {
  AI_SUPPLIER_MAX_DISCOUNT,
  SUPPLY_AGREEMENT_PRICE_BAND,
  type SupplyAgreement,
} from "@/lib/db/types/supplyAgreement";
import {
  computeSupplierCommodityCapacityUnits,
  computeSupplierMaxContractableUnits,
} from "@/lib/corporations/supplyAgreementCapacity";

import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import {
  supplyAgreementRequiresState,
  supportsCorporationWideSupplyAgreement,
} from "@/lib/market/commodityMarketScope";
import { supplyAgreementSectorsInScope } from "@/lib/corporations/supplyAgreementCapacity";

/** Fill below this: the seller cannot move output and will discount to lock a buyer. */
export const NPP_CONTRACT_GLUT_FILL = 0.5;

/** Throughput below this: the buyer is input-starved and will take a contract. */
export const NPP_CONTRACT_STARVE_THROUGHPUT = 0.95;

/** Input price ratio at or above this also marks the buyer as starved. */
export const NPP_CONTRACT_INPUT_SHORTAGE = 1.1;

/** Refuse inbound premiums above this (a 20% gouge is not "honest"). */
export const NPP_CONTRACT_MAX_ACCEPT_PREMIUM = 0.2;

/** Discount a glutted seller offers. */
export const NPP_CONTRACT_GLUT_PREMIUM = -AI_SUPPLIER_MAX_DISCOUNT;

/** Premium a shortage seller charges. */
export const NPP_CONTRACT_SHORTAGE_PREMIUM = 0.1;

/** Share of uncommitted capacity one new contract may take. */
export const NPP_CONTRACT_CAPACITY_SHARE = 0.25;

export type NppAgreementParty = {
  corpId: string;
  countryId: string;
  isNatcorp: boolean;
  /** Character/imperial CEO. NPP matching must never bind these as counterparties. */
  isPlayer?: boolean;
  sectors: Array<{
    sectorType: CorporationType;
    capitalStock?: number | null;
    producedUnits?: number | null;
    soldFraction?: number | null;
    throughputFactor?: number | null;
    mothballed?: boolean | null;
    strategyId?: string | null;
    transitionFromStrategyId?: string | null;
    retoolRescaleApplied?: boolean;
    transitionStartTurn?: number | null;
    /** Latest full-policy output; bounds new contract volume. */
    contractAchievableUnits?: number | null;
    productionPolicyLevel?: number | null;
    embargoSuspended?: boolean | null;
    embargoExportExposure?: number | null;
    countryId?: string | null;
    /** Host state, so freight (state-scoped) can be matched within one state. */
    stateId?: string | null;
  }>;
};

export type ExistingNppAgreement = {
  id: string;
  supplierCorpId: string;
  buyerCorpId: string;
  commodity: CommodityType;
  /** Present on a state-scoped agreement; absent on corporation-wide ones. */
  stateId?: string;
  volumeCap: number;
  pricePremium: number;
  status: SupplyAgreement["status"];
  /** Corporation that authored the standing offer (a buyer-authored pending proposal). */
  proposedByCorpId?: string;
  durationTurns?: number;
};

/** A non-NPP counterparty whose inbound proposals an NPP supplier may accept. */
export type ExternalBuyer = { countryId: string };

export type NppDeclineReason = "stateOwned" | "embargo" | "noCapacity" | "invalidVolume";

export type NppAgreementDecision =
  | { action: "activate"; agreementId: string }
  | { action: "cancelNotice"; agreementId: string }
  /** Supplier answers a player proposal with the terms it would sign. */
  | { action: "counter"; agreementId: string; pricePremium: number; volumeCap: number }
  /** Supplier turns a player proposal down; the reason is shown to the player. */
  | { action: "decline"; agreementId: string; reason: NppDeclineReason }
  | {
      action: "propose";
      supplierCorpId: string;
      buyerCorpId: string;
      commodity: CommodityType;
      /** Set when the commodity is state-scoped: the state the contract is fulfilled from. */
      stateId?: string;
      volumeCap: number;
      pricePremium: number;
    };

export /**
 * A corporation-wide agreement for a state-scoped commodity is a legacy
 * contract with no state identity; the NPP matcher leaves those to the
 * migration and neither activates nor extends them.
 */
function agreementHasScope(a: Pick<ExistingNppAgreement, "commodity" | "stateId">): boolean {
  return supportsCorporationWideSupplyAgreement(a.commodity) || !!a.stateId;
}

export function liveStatuses(status: SupplyAgreement["status"]): boolean {
  return status === "pending" || status === "active" || status === "cancelling";
}

export function commoditiesOf(
  sectorType: OperatingSectorType,
  side: "supply" | "demand",
  strategyId: string | null | undefined,
  transitionFrom: string | null | undefined,
  transitionStart: number | null | undefined,
  turn: number
): CommodityType[] {
  const rates = getEffectiveStrategyRates(
    sectorType,
    strategyId ?? "standard",
    transitionFrom,
    transitionStart,
    turn
  );
  const mix = side === "supply" ? rates.supply : rates.demand;
  const fromStrategy = (Object.keys(mix) as CommodityType[]).filter((c) => (mix[c] ?? 0) > 0);
  if (fromStrategy.length > 0) return fromStrategy;
  const operatingType = sectorType;
  const table = side === "supply" ? SECTOR_SUPPLY[operatingType] : SECTOR_DEMAND[operatingType];
  return (table ?? []).filter((f) => f.rate > 0).map((f) => f.commodity);
}

export function sellerFill(
  party: NppAgreementParty,
  commodity: CommodityType,
  turn: number
): number | null {
  let sold = 0;
  let n = 0;
  for (const s of party.sectors) {
    if (s.mothballed === true) continue;
    const outputs = commoditiesOf(
      s.sectorType,
      "supply",
      s.strategyId,
      s.transitionFromStrategyId,
      s.transitionStartTurn,
      turn
    );
    if (!outputs.includes(commodity)) continue;
    if (typeof s.soldFraction === "number" && Number.isFinite(s.soldFraction)) {
      sold += s.soldFraction;
      n += 1;
    }
  }
  return n > 0 ? sold / n : null;
}

export function buyerStarved(
  party: NppAgreementParty,
  commodity: CommodityType,
  turn: number,
  priceRatio: number | null,
  /** State-scoped commodity: only the buyer's plants in this state count. */
  stateId?: string
): boolean {
  let uses = false;
  let worstThroughput = 1;
  for (const s of supplyAgreementSectorsInScope(party.sectors, stateId)) {
    if (s.mothballed === true) continue;
    const inputs = commoditiesOf(
      s.sectorType,
      "demand",
      s.strategyId,
      s.transitionFromStrategyId,
      s.transitionStartTurn,
      turn
    );
    if (!inputs.includes(commodity)) continue;
    uses = true;
    if (typeof s.throughputFactor === "number" && Number.isFinite(s.throughputFactor)) {
      worstThroughput = Math.min(worstThroughput, s.throughputFactor);
    }
  }
  if (!uses) return false;
  if (worstThroughput < NPP_CONTRACT_STARVE_THROUGHPUT) return true;
  return priceRatio != null && priceRatio >= NPP_CONTRACT_INPUT_SHORTAGE;
}

export /** Distinguishes an absent state from any real state id in index keys. */
const NO_STATE = "\u0000";

/**
 * `committedVolume` and `pairExists` answered from one pass over the live
 * agreements. The proposal step asks them for every supplier output and every
 * candidate buyer; scanning all ~26,000 agreements per question made the
 * matcher the costliest CPU step of the corporation turn. Sums accumulate in
 * the agreements' own order, so totals match the scanning versions exactly.
 */
export function indexLiveAgreements(agreements: readonly ExistingNppAgreement[]) {
  const committed = new Map<string, number>();
  const pairs = new Set<string>();
  for (const a of agreements) {
    if (!liveStatuses(a.status)) continue;
    const state = a.stateId ?? NO_STATE;
    const volumeKey = `${a.supplierCorpId}|${a.commodity}|${state}`;
    committed.set(volumeKey, (committed.get(volumeKey) ?? 0) + a.volumeCap);
    pairs.add(`${a.supplierCorpId}|${a.buyerCorpId}|${a.commodity}|${state}`);
  }
  return {
    committedVolume: (supplierCorpId: string, commodity: CommodityType, stateId?: string) =>
      committed.get(`${supplierCorpId}|${commodity}|${stateId ?? NO_STATE}`) ?? 0,
    pairExists: (
      supplierCorpId: string,
      buyerCorpId: string,
      commodity: CommodityType,
      stateId?: string
    ) => pairs.has(`${supplierCorpId}|${buyerCorpId}|${commodity}|${stateId ?? NO_STATE}`),
  };
}

export function nppContractPremium(fill: number | null, priceRatio: number | null): number {
  if (fill != null && fill < NPP_CONTRACT_GLUT_FILL) return NPP_CONTRACT_GLUT_PREMIUM;
  if (priceRatio != null && priceRatio >= NPP_CONTRACT_INPUT_SHORTAGE) {
    return NPP_CONTRACT_SHORTAGE_PREMIUM;
  }
  return 0;
}

/**
 * Pure matcher. `staggerEligible` is the same hash the mothball pass uses so
 * a young world of single-sector NPP corps does not all contract on one turn.
 */
export function decideNppSupplyAgreements(args: {
  /** `gameState.currentYear`, with the flag below, resolves planned economies. */
  currentYear?: number | null;
  /** `gameConfig.commandEconomyEnabled`. */
  commandEconomyEnabled?: boolean | null;
  turn: number;
  plantsEnabled: boolean;
  parties: readonly NppAgreementParty[];
  agreements: readonly ExistingNppAgreement[];
  priceRatioOf: (commodity: CommodityType, countryId: string) => number | null;
  staggerEligible: (corpId: string) => boolean;
  /** Player buyers by corp id, for supplier-side accepts of their proposals. */
  externalBuyers?: ReadonlyMap<string, ExternalBuyer>;
  /** True when trade between the two countries is walled off for this commodity. */
  tradeBlocked?: (
    commodity: CommodityType,
    supplierCountry: string,
    buyerCountry: string
  ) => boolean;
}): NppAgreementDecision[] {
  const { turn, plantsEnabled, parties, agreements, priceRatioOf, staggerEligible } = args;
  // Threaded into every capacity check so the head-room the matcher proposes
  // sits on the same base the production sink credits (see
  // `computeSupplierCommodityCapacityUnits`).
  const economy = {
    currentYear: args.currentYear,
    commandEconomyEnabled: args.commandEconomyEnabled,
  };
  const byId = new Map(parties.map((p) => [p.corpId, p]));
  const out: NppAgreementDecision[] = [];
  // Contracted volume for the supplier-side accept test: settled contracts
  // only, so one pending proposal does not count against another.
  const liveBeforeAccepts = args.externalBuyers
    ? indexLiveAgreements(agreements.filter((a) => a.status !== "pending"))
    : null;
  const acceptedBuyer = new Set<string>();
  const proposedSupplier = new Set<string>();
  const proposedBuyer = new Set<string>();

  // The proposal step asks the same buyer/commodity question once per supplier,
  // so a starved buyer was rescanned for every candidate supplier in the
  // country. The answers depend only on the party, commodity, price ratio and
  // state scope, all of which are fixed for this call, so memoise them.
  const starvedCache = new Map<string, boolean>();
  const starved = (
    party: NppAgreementParty,
    commodity: CommodityType,
    priceRatio: number | null,
    stateId?: string
  ): boolean => {
    const key = `${party.corpId}|${commodity}|${String(priceRatio)}|${stateId ?? NO_STATE}`;
    const cached = starvedCache.get(key);
    if (cached !== undefined) return cached;
    const answer = buyerStarved(party, commodity, turn, priceRatio, stateId);
    starvedCache.set(key, answer);
    return answer;
  };
  // Same pair of outputs for the same supplier commodity every time it is asked
  // (supply has one fill per commodity), so cache that scan too.
  const fillCache = new Map<string, number | null>();
  const fillOf = (party: NppAgreementParty, commodity: CommodityType): number | null => {
    const key = `${party.corpId}|${commodity}`;
    const cached = fillCache.get(key);
    if (cached !== undefined) return cached;
    const answer = sellerFill(party, commodity, turn);
    fillCache.set(key, answer);
    return answer;
  };

  // 1. Auto-accept inbound pending proposals the NPP buyer actually needs.
  for (const a of agreements) {
    if (a.status !== "pending") continue;
    if (!agreementHasScope(a)) continue;
    const buyer = byId.get(a.buyerCorpId);
    if (!buyer || buyer.isNatcorp) continue;
    if (!staggerEligible(buyer.corpId)) continue;
    if (acceptedBuyer.has(buyer.corpId)) continue;
    if (a.pricePremium > NPP_CONTRACT_MAX_ACCEPT_PREMIUM) continue;
    if (a.pricePremium < -SUPPLY_AGREEMENT_PRICE_BAND) continue;
    // A state contract is only useful to plants in that state.
    const uses = supplyAgreementSectorsInScope(buyer.sectors, a.stateId).some((s) => {
      if (s.mothballed === true) return false;
      return commoditiesOf(
        s.sectorType,
        "demand",
        s.strategyId,
        s.transitionFromStrategyId,
        s.transitionStartTurn,
        turn
      ).includes(a.commodity);
    });
    if (!uses) continue;
    out.push({ action: "activate", agreementId: a.id });
    acceptedBuyer.add(buyer.corpId);
  }

  // 1b. An AI supplier answers a player buyer's pending proposal the turn it
  // sees it: accepts when it has spare capacity, the discount is no deeper than
  // the glut discount and no embargo lies between the countries; otherwise it
  // counters with terms it can honour, or declines with a reason.
  if (plantsEnabled && args.externalBuyers) {
    const accepted = new Map<string, number>();
    for (const a of agreements) {
      if (a.status !== "pending") continue;
      if (!agreementHasScope(a)) continue;
      const buyer = args.externalBuyers.get(a.buyerCorpId);
      if (!buyer || a.proposedByCorpId !== a.buyerCorpId) continue;
      const supplier = byId.get(a.supplierCorpId);
      if (!supplier || supplier.isPlayer) continue;
      if (supplier.isNatcorp) {
        out.push({ action: "decline", agreementId: a.id, reason: "stateOwned" });
        continue;
      }
      if (
        buyer.countryId !== supplier.countryId &&
        args.tradeBlocked?.(a.commodity, supplier.countryId, buyer.countryId)
      ) {
        out.push({ action: "decline", agreementId: a.id, reason: "embargo" });
        continue;
      }
      if (!(a.volumeCap > 0)) {
        out.push({ action: "decline", agreementId: a.id, reason: "invalidVolume" });
        continue;
      }
      const maxContractable = computeSupplierMaxContractableUnits({
        sectors: supplier.sectors,
        commodity: a.commodity,
        isNatcorp: supplier.isNatcorp,
        turn,
        ...economy,
        stateId: a.stateId,
      });
      const key = `${supplier.corpId}|${a.commodity}|${a.stateId ?? NO_STATE}`;
      const taken = accepted.get(key) ?? 0;
      const spare =
        maxContractable -
        liveBeforeAccepts!.committedVolume(supplier.corpId, a.commodity, a.stateId) -
        taken;
      // Always answer within a turn: sign the proposal as written, or counter
      // with the closest terms the supplier can honour (price no deeper than
      // the glut discount, volume no more than its spare capacity).
      const price = Math.min(
        Math.max(a.pricePremium, NPP_CONTRACT_GLUT_PREMIUM),
        SUPPLY_AGREEMENT_PRICE_BAND
      );
      const volume = Math.min(a.volumeCap, Math.floor(spare));
      if (!(volume >= 1)) {
        out.push({ action: "decline", agreementId: a.id, reason: "noCapacity" });
        continue;
      }
      if (price === a.pricePremium && volume === a.volumeCap) {
        out.push({ action: "activate", agreementId: a.id });
        accepted.set(key, taken + a.volumeCap);
      } else {
        out.push({ action: "counter", agreementId: a.id, pricePremium: price, volumeCap: volume });
      }
    }
  }

  // 2. Serve cancel notice when the supplier has gone cold on that commodity.
  for (const a of agreements) {
    if (a.status !== "active") continue;
    if (!agreementHasScope(a)) continue;
    const supplier = byId.get(a.supplierCorpId);
    if (!supplier) continue;
    if (!staggerEligible(supplier.corpId)) continue;
    const capacity = plantsEnabled
      ? computeSupplierCommodityCapacityUnits({
          sectors: supplier.sectors,
          commodity: a.commodity,
          isNatcorp: supplier.isNatcorp,
          turn,
          ...economy,
          stateId: a.stateId,
        })
      : supplyAgreementSectorsInScope(supplier.sectors, a.stateId).some(
            (s) =>
              s.mothballed !== true &&
              commoditiesOf(
                s.sectorType,
                "supply",
                s.strategyId,
                s.transitionFromStrategyId,
                s.transitionStartTurn,
                turn
              ).includes(a.commodity)
          )
        ? 1
        : 0;
    if (capacity > 0) continue;
    out.push({ action: "cancelNotice", agreementId: a.id });
  }

  if (!plantsEnabled) return out;
  const live = indexLiveAgreements(agreements);

  // 3. Propose NPP-NPP same-country contracts into starved buyers.
  for (const supplier of parties) {
    if (supplier.isNatcorp) continue;
    if (supplier.isPlayer) continue;
    if (!staggerEligible(supplier.corpId)) continue;
    if (proposedSupplier.has(supplier.corpId)) continue;

    type Candidate = {
      buyer: NppAgreementParty;
      commodity: CommodityType;
      stateId?: string;
      volumeCap: number;
      pricePremium: number;
      score: number;
    };
    let best: Candidate | null = null;

    // What the supplier can contract: each reachable output commodity once,
    // and each state-scoped output (freight) once PER host state, since a
    // freight contract is fulfilled from one state's plants.
    const outputScopes = new Map<string, { commodity: CommodityType; stateId?: string }>();
    for (const s of supplier.sectors) {
      if (s.mothballed === true) continue;
      for (const c of commoditiesOf(
        s.sectorType,
        "supply",
        s.strategyId,
        s.transitionFromStrategyId,
        s.transitionStartTurn,
        turn
      )) {
        if (supplyAgreementRequiresState(c)) {
          if (!s.stateId) continue;
          outputScopes.set(`${c}@${s.stateId}`, { commodity: c, stateId: s.stateId });
        } else {
          outputScopes.set(c, { commodity: c });
        }
      }
    }

    for (const { commodity, stateId } of outputScopes.values()) {
      const maxContractable = computeSupplierMaxContractableUnits({
        sectors: supplier.sectors,
        commodity,
        isNatcorp: supplier.isNatcorp,
        turn,
        ...economy,
        stateId,
      });
      const uncommitted = Math.max(
        0,
        maxContractable - live.committedVolume(supplier.corpId, commodity, stateId)
      );
      const volumeCap = uncommitted * NPP_CONTRACT_CAPACITY_SHARE;
      if (!(volumeCap > 0)) continue;

      const fill = fillOf(supplier, commodity);
      const priceRatio = priceRatioOf(commodity, supplier.countryId);
      const premium = nppContractPremium(fill, priceRatio);

      for (const buyer of parties) {
        if (buyer.corpId === supplier.corpId) continue;
        if (buyer.isNatcorp) continue;
        if (buyer.isPlayer) continue;
        if (buyer.countryId !== supplier.countryId) continue;
        if (proposedBuyer.has(buyer.corpId) || acceptedBuyer.has(buyer.corpId)) continue;
        if (live.pairExists(supplier.corpId, buyer.corpId, commodity, stateId)) continue;
        const buyerRatio = priceRatioOf(commodity, buyer.countryId);
        if (!starved(buyer, commodity, buyerRatio, stateId)) continue;
        const score = (fill == null ? 0.5 : 1 - fill) + Math.max(0, (buyerRatio ?? 1) - 1);
        if (!best || score > best.score) {
          best = { buyer, commodity, stateId, volumeCap, pricePremium: premium, score };
        }
      }
    }

    if (!best) continue;
    out.push({
      action: "propose",
      supplierCorpId: supplier.corpId,
      buyerCorpId: best.buyer.corpId,
      commodity: best.commodity,
      ...(best.stateId ? { stateId: best.stateId } : {}),
      volumeCap: best.volumeCap,
      pricePremium: best.pricePremium,
    });
    proposedSupplier.add(supplier.corpId);
    proposedBuyer.add(best.buyer.corpId);
  }

  return out;
}
