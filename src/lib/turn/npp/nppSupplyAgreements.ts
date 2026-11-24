import type {
  NppAgreementParty,
  ExistingNppAgreement,
  ExternalBuyer,
  NppDeclineReason,
  NppAgreementDecision,
} from "@/lib/logistics/nppSupplyDecisions";
import {
  nppSoldShare,
  soldShareWorldOf,
  type SoldShareWorld,
} from "@/lib/turn/npp/rules/fundedSellThrough";
import {
  NPP_CONTRACT_MAX_ACCEPT_PREMIUM,
  NPP_CONTRACT_GLUT_PREMIUM,
  commoditiesOf,
  buyerStarved,
  NO_STATE,
  indexLiveAgreements,
  decideNppSupplyAgreements,
} from "@/lib/logistics/nppSupplyDecisions";
export {
  NPP_CONTRACT_GLUT_FILL,
  NPP_CONTRACT_STARVE_THROUGHPUT,
  NPP_CONTRACT_INPUT_SHORTAGE,
  NPP_CONTRACT_MAX_ACCEPT_PREMIUM,
  NPP_CONTRACT_GLUT_PREMIUM,
  NPP_CONTRACT_SHORTAGE_PREMIUM,
  NPP_CONTRACT_CAPACITY_SHARE,
  indexLiveAgreements,
  nppContractPremium,
  decideNppSupplyAgreements,
} from "@/lib/logistics/nppSupplyDecisions";
export type {
  NppAgreementParty,
  ExistingNppAgreement,
  ExternalBuyer,
  NppDeclineReason,
  NppAgreementDecision,
} from "@/lib/logistics/nppSupplyDecisions";
/**
 * NPP supply-agreement matching (supplyAgreementsEnabled).
 *
 * Player CEOs propose and accept bilateral contracts; NPP CEOs do too here:
 * NPP buyers accept honest inbound proposals, NPP suppliers lock same-country
 * NPP buyers, and a mothballed supplier serves cancel notice before
 * shortfall damages land on a cold plant.
 *
 * Same-country only. Embargo lanes exist; crossing them here would ignore the
 * trade graph the clearing book already respects. Player counterparties are
 * never proposed to (inbox spam); a player who proposes TO an NPP buyer still
 * gets an auto-accept when the terms are honest.
 */

import { substepMarker } from "@/lib/observability/phaseSubsteps";
import type { AnyBulkWriteOperation, Collection, Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import type { SupplyListing, SupplyListingSizingBasis } from "@/lib/db/types/supplyListing";
import { isCurtained, isPlannedEconomy } from "@/lib/constants/commandEconomy";
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_LABELS } from "@/lib/constants/commodities";
import { createNotifications, type NotificationInput } from "@/lib/notifications";

import { contractCancelEffectiveTurn, type SupplyAgreement } from "@/lib/db/types/supplyAgreement";
import { computeSupplierMaxContractableUnits } from "@/lib/corporations/supplyAgreementCapacity";
import { glutStaggerEligible } from "@/lib/turn/npp/cohort";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";

import { supplyAgreementRequiresState } from "@/lib/market/commodityMarketScope";
import { supplyAgreementSectorsInScope } from "@/lib/corporations/supplyAgreementCapacity";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { supplyAgreementsCollection } from "@/lib/db/repositories/supplyAgreements";
import { supplyListingsCollection } from "@/lib/db/repositories/supplyListings";
import { tradeEmbargoesCollection } from "@/lib/db/repositories/tradeEmbargoes";

/**
 * Term of a contract an AI corporation signs or advertises. Two game days, so
 * AI supply links renew against current capacity and prices instead of
 * accumulating forever (every live agreement is settled and rewritten each turn).
 */
export const NPP_CONTRACT_TERM_TURNS = 48;
/** Open-ended AI contracts signed before terms existed retire after this grace... */
export const NPP_CONTRACT_BACKFILL_GRACE_TURNS = 12;
/** ...spread over this many turns, so supply chains do not all lapse in one turn. */
export const NPP_CONTRACT_BACKFILL_SPREAD_TURNS = 48;

/** Sell and buy listings one AI corporation may keep up; well inside the ten-slot cap. */
export const AI_LISTINGS_PER_SIDE = 3;
/** Share of spare capacity one standing sell listing advertises. */
export const AI_LISTING_CAPACITY_FRACTION = 0.5;
/** Turns an AI listing stays on the board before it must be refreshed. */
export const AI_LISTING_TTL_TURNS = 24;
const AI_LISTING_MIN_PREMIUM = NPP_CONTRACT_GLUT_PREMIUM;
const AI_LISTING_MAX_PREMIUM = NPP_CONTRACT_MAX_ACCEPT_PREMIUM;

export type AiListingSpec = {
  corpId: string;
  side: "buy" | "sell";
  commodity: CommodityType;
  stateId?: string;
  volumeCap: number;
  pricePremium: number;
  sizingBasis: SupplyListingSizingBasis;
};

/** Stable key an AI listing upserts on: (corporation, side, commodity[, state]). */
export function aiListingId(
  spec: Pick<AiListingSpec, "corpId" | "side" | "commodity" | "stateId">
): string {
  return `${spec.corpId}:ai:${spec.side}:${spec.commodity}${spec.stateId ? `:${spec.stateId}` : ""}`;
}

function listingPremium(priceRatio: number | null): number {
  if (priceRatio == null) return 0;
  const raw = Math.round((priceRatio - 1) * 1000) / 1000;
  return Math.min(AI_LISTING_MAX_PREMIUM, Math.max(AI_LISTING_MIN_PREMIUM, raw));
}

/**
 * Pure: the standing listings AI market-economy corporations want on the board.
 * Sell listings come from spare capacity net of contracted volume; buy
 * listings from input demand the corp cannot cover (starved plants or a
 * shortage price). Planned economies and player corps never list.
 */
export function decideAiSupplyListings(args: {
  currentYear?: number | null;
  commandEconomyEnabled?: boolean | null;
  turn: number;
  plantsEnabled: boolean;
  parties: readonly NppAgreementParty[];
  agreements: readonly ExistingNppAgreement[];
  priceRatioOf: (commodity: CommodityType, countryId: string) => number | null;
}): AiListingSpec[] {
  const { turn, parties, priceRatioOf } = args;
  if (!args.plantsEnabled) return [];
  const economy = {
    currentYear: args.currentYear,
    commandEconomyEnabled: args.commandEconomyEnabled,
  };
  const live = indexLiveAgreements(args.agreements);
  const out: AiListingSpec[] = [];
  for (const party of parties) {
    if (party.isPlayer) continue;
    if (isPlannedEconomy(party.countryId, args.currentYear, args.commandEconomyEnabled)) continue;

    const sells: AiListingSpec[] = [];
    const buys: AiListingSpec[] = [];
    const seenSell = new Set<string>();
    const seenBuy = new Set<string>();
    for (const s of party.sectors) {
      if (s.mothballed === true) continue;
      for (const c of commoditiesOf(
        s.sectorType,
        "supply",
        s.strategyId,
        s.transitionFromStrategyId,
        s.transitionStartTurn,
        turn
      )) {
        const stateId = supplyAgreementRequiresState(c) ? (s.stateId ?? undefined) : undefined;
        if (supplyAgreementRequiresState(c) && !stateId) continue;
        const key = `${c}|${stateId ?? NO_STATE}`;
        if (seenSell.has(key)) continue;
        seenSell.add(key);
        const maxContractable = computeSupplierMaxContractableUnits({
          sectors: party.sectors,
          commodity: c,
          isNatcorp: party.isNatcorp,
          turn,
          ...economy,
          stateId,
        });
        const spare = Math.max(0, maxContractable - live.committedVolume(party.corpId, c, stateId));
        const volumeCap = spare * AI_LISTING_CAPACITY_FRACTION;
        if (!(volumeCap > 0)) continue;
        sells.push({
          corpId: party.corpId,
          side: "sell",
          commodity: c,
          ...(stateId ? { stateId } : {}),
          volumeCap,
          pricePremium: listingPremium(priceRatioOf(c, party.countryId)),
          sizingBasis: "spareCapacity",
        });
      }
      for (const c of commoditiesOf(
        s.sectorType,
        "demand",
        s.strategyId,
        s.transitionFromStrategyId,
        s.transitionStartTurn,
        turn
      )) {
        const stateId = supplyAgreementRequiresState(c) ? (s.stateId ?? undefined) : undefined;
        if (supplyAgreementRequiresState(c) && !stateId) continue;
        const key = `${c}|${stateId ?? NO_STATE}`;
        if (seenBuy.has(key)) continue;
        seenBuy.add(key);
        const ratio = priceRatioOf(c, party.countryId);
        if (!buyerStarved(party, c, turn, ratio, stateId)) continue;
        // Unmet demand proxy: output the starved plants in scope fail to make.
        let unmet = 0;
        for (const t of supplyAgreementSectorsInScope(party.sectors, stateId)) {
          if (t.mothballed === true) continue;
          const th = typeof t.throughputFactor === "number" ? t.throughputFactor : 1;
          unmet += Math.max(0, 1 - th) * Math.max(0, t.producedUnits ?? 0);
        }
        buys.push({
          corpId: party.corpId,
          side: "buy",
          commodity: c,
          ...(stateId ? { stateId } : {}),
          volumeCap: Math.max(1, unmet),
          pricePremium: listingPremium(ratio),
          sizingBasis: "unmetOutput",
        });
      }
    }
    sells.sort((a, b) => b.volumeCap - a.volumeCap);
    buys.sort((a, b) => b.volumeCap - a.volumeCap);
    out.push(...sells.slice(0, AI_LISTINGS_PER_SIDE), ...buys.slice(0, AI_LISTINGS_PER_SIDE));
  }
  return out;
}

/** Walls between two countries for a commodity: live blocking embargoes or the iron curtain. */
export function buildTradeBlocked(args: {
  embargoes: readonly Pick<
    TradeEmbargo,
    "sourceCountry" | "targetCountry" | "commodity" | "direction" | "mode" | "expiresTurn"
  >[];
  turn: number;
  currentYear?: number | null;
  commandEconomyEnabled?: boolean | null;
}): (commodity: CommodityType, supplierCountry: string, buyerCountry: string) => boolean {
  const active = args.embargoes.filter(
    (e) => e.mode === "block" && (e.expiresTurn == null || e.expiresTurn >= args.turn)
  );
  return (commodity, supplierCountry, buyerCountry) => {
    if (supplierCountry === buyerCountry) return false;
    if (
      isCurtained(supplierCountry, args.currentYear, args.commandEconomyEnabled) !==
      isCurtained(buyerCountry, args.currentYear, args.commandEconomyEnabled)
    ) {
      return true;
    }
    return active.some((e) => {
      if (e.commodity !== "all" && e.commodity !== commodity) return false;
      const direction = e.direction ?? "export";
      if (e.sourceCountry === supplierCountry && e.targetCountry === buyerCountry) {
        return direction === "export" || direction === "both";
      }
      if (e.sourceCountry === buyerCountry && e.targetCountry === supplierCountry) {
        return direction === "import" || direction === "both";
      }
      return false;
    });
  };
}

/**
 * Only what `toParty` and the agreement map below read. The pass loads every
 * NPP sector and every live NPP agreement each turn; full documents were about
 * 23 MB a turn on the live world, these fields about 5 MB.
 */
export const NPP_SUPPLY_SECTOR_PROJECTION = {
  corporationId: 1,
  sectorType: 1,
  capitalStock: 1,
  producedUnits: 1,
  soldFraction: 1,
  "producerSettlement.worldEpoch": 1,
  "producerSettlement.turn": 1,
  "producerSettlement.offeredUnits": 1,
  "producerSettlement.soldUnits": 1,
  "producerSettlement.products.internalDeliveredUnits": 1,
  throughputFactor: 1,
  mothballed: 1,
  strategyId: 1,
  transitionFromStrategyId: 1,
  retoolRescaleApplied: 1,
  transitionStartTurn: 1,
  contractAchievableUnits: 1,
  productionPolicyLevel: 1,
  embargoSuspended: 1,
  embargoExportExposure: 1,
  countryId: 1,
  stateId: 1,
} as const;

export const NPP_SUPPLY_AGREEMENT_PROJECTION = {
  supplierCorpId: 1,
  buyerCorpId: 1,
  commodity: 1,
  stateId: 1,
  volumeCap: 1,
  pricePremium: 1,
  status: 1,
  proposedByCorpId: 1,
  durationTurns: 1,
  expiresAtTurn: 1,
  exclusive: 1,
  currentOffer: 1,
} as const;

/**
 * Expiry for an open-ended AI-to-AI contract signed before AI contracts had a
 * term. The ObjectId's trailing bytes spread the retirements evenly across
 * NPP_CONTRACT_BACKFILL_SPREAD_TURNS, deterministically, so a crash-resumed
 * turn stamps the same value.
 */
export function aiContractBackfillExpiry(agreementId: string, turn: number): number {
  const spread = parseInt(agreementId.slice(-6), 16) % NPP_CONTRACT_BACKFILL_SPREAD_TURNS;
  return turn + NPP_CONTRACT_BACKFILL_GRACE_TURNS + (Number.isFinite(spread) ? spread : 0);
}

/** Live AI-to-AI contracts with no expiry: the pre-term backlog to retire. */
export function openEndedAiContracts(
  agreements: readonly Pick<
    SupplyAgreement,
    "_id" | "status" | "expiresAtTurn" | "supplierCorpId" | "buyerCorpId"
  >[],
  nppIds: ReadonlySet<string>
): ObjectId[] {
  return agreements
    .filter(
      (a) =>
        a._id != null &&
        a.status === "active" &&
        a.expiresAtTurn == null &&
        nppIds.has(a.supplierCorpId.toString()) &&
        nppIds.has(a.buyerCorpId.toString())
    )
    .map((a) => a._id as ObjectId);
}

export function toExistingNppAgreement(a: SupplyAgreement): ExistingNppAgreement {
  return {
    id: a._id!.toString(),
    supplierCorpId: a.supplierCorpId.toString(),
    buyerCorpId: a.buyerCorpId.toString(),
    commodity: a.commodity,
    ...(a.stateId ? { stateId: a.stateId } : {}),
    volumeCap: a.volumeCap,
    pricePremium: a.pricePremium,
    status: a.status,
    ...(a.proposedByCorpId ? { proposedByCorpId: a.proposedByCorpId.toString() } : {}),
    ...(a.durationTurns != null ? { durationTurns: a.durationTurns } : {}),
  };
}

/**
 * `soldFraction` on each party sector is the sold share the contract rules
 * read (rules/fundedSellThrough nppSoldShare): funded sales on a funded turn,
 * the legacy figure otherwise. Without a world it is the legacy figure.
 */
export function toParty(
  corp: Corporation,
  sectors: CorporateSector[],
  soldShareWorld?: SoldShareWorld
): NppAgreementParty {
  return {
    corpId: corp._id.toString(),
    countryId: corp.countryId,
    isNatcorp: isStateOwned(corp),
    isPlayer: corp.ceoType != null && corp.ceoType !== "npp",
    sectors: sectors.map((s) => ({
      sectorType: s.sectorType,
      capitalStock: s.capitalStock,
      producedUnits: s.producedUnits,
      soldFraction: soldShareWorld ? nppSoldShare(s, soldShareWorld) : s.soldFraction,
      throughputFactor: s.throughputFactor,
      mothballed: s.mothballed,
      strategyId: s.strategyId,
      transitionFromStrategyId: s.transitionFromStrategyId,
      retoolRescaleApplied: s.retoolRescaleApplied,
      transitionStartTurn: s.transitionStartTurn,
      contractAchievableUnits: s.contractAchievableUnits,
      productionPolicyLevel: s.productionPolicyLevel,
      embargoSuspended: s.embargoSuspended,
      embargoExportExposure: s.embargoExportExposure,
      countryId: s.countryId,
      stateId: s.stateId,
    })),
  };
}

/**
 * Refresh the AI corporations' standing listings: upsert what the rules want
 * (only when terms moved or the listing nears expiry), delete the rest. Three
 * batched calls regardless of corporation count.
 */
export async function syncAiSupplyListings(
  db: Db,
  args: Parameters<typeof decideAiSupplyListings>[0] & { now: Date }
): Promise<{ upserted: number; removed: number }> {
  const { turn, now } = args;
  const desired = decideAiSupplyListings(args);
  const collection = supplyListingsCollection(db);
  const corpObjectIds = args.parties.map((p) => new ObjectId(p.corpId));
  const existing = await collection
    .find(
      { aiListed: true, corporationId: { $in: corpObjectIds } },
      { projection: { volumeCap: 1, pricePremium: 1, expiresAtTurn: 1, durationTurns: 1 } }
    )
    .toArray();
  const existingById = new Map(existing.map((e) => [e._id, e]));
  const slotByCorp = new Map<string, number>();
  const wanted = new Set<string>();
  const writes: AnyBulkWriteOperation<SupplyListing>[] = [];
  for (const spec of desired) {
    const id = aiListingId(spec);
    wanted.add(id);
    const slot = slotByCorp.get(spec.corpId) ?? 0;
    slotByCorp.set(spec.corpId, slot + 1);
    const prior = existingById.get(id);
    const volumeCap = Math.round(spec.volumeCap * 100) / 100;
    if (
      prior &&
      prior.pricePremium === spec.pricePremium &&
      prior.durationTurns === NPP_CONTRACT_TERM_TURNS &&
      Math.abs(prior.volumeCap - volumeCap) <= prior.volumeCap * 0.05 &&
      prior.expiresAtTurn > turn + AI_LISTING_TTL_TURNS / 2
    ) {
      continue;
    }
    const row: SupplyListing = {
      _id: id,
      corporationId: new ObjectId(spec.corpId),
      aiListed: true,
      slot,
      side: spec.side,
      commodity: spec.commodity,
      ...(spec.stateId ? { stateId: spec.stateId } : {}),
      volumeCap,
      pricePremium: spec.pricePremium,
      sizingBasis: spec.sizingBasis,
      durationTurns: NPP_CONTRACT_TERM_TURNS,
      expiresAtTurn: turn + AI_LISTING_TTL_TURNS,
      updatedAt: now,
    };
    writes.push({ replaceOne: { filter: { _id: id }, replacement: row, upsert: true } });
  }
  const stale = existing.filter((e) => !wanted.has(e._id)).map((e) => e._id);
  // A wanted listing and a stale one are different rows, so both halves of the
  // refresh travel in one unordered batch instead of two writes.
  const ops: AnyBulkWriteOperation<SupplyListing>[] = [
    ...writes,
    ...stale.map((id): AnyBulkWriteOperation<SupplyListing> => ({
      deleteOne: { filter: { _id: id, aiListed: true } },
    })),
  ];
  if (ops.length > 0) await collection.bulkWrite(ops, { ordered: false });
  return { upserted: writes.length, removed: stale.length };
}

const DECLINE_TEXT: Record<NppDeclineReason, string> = {
  stateOwned: "state-owned suppliers do not sign private supply agreements",
  embargo: "an embargo blocks trade between the two countries",
  noCapacity: "it has no spare capacity for this commodity right now",
  invalidVolume: "the volume on the proposal is not valid",
};

/**
 * Persist the supplier's answer to a player proposal. A counter is the same
 * revision a player counter writes (supplier-authored, so the buyer can accept
 * it); a decline withdraws the proposal. Both are guarded on the buyer's offer
 * still being the current one, so a proposal the player amended or cancelled in
 * the meantime is left alone.
 */
async function writeSupplierReplies(
  collection: Collection<SupplyAgreement>,
  args: {
    counters: Extract<NppAgreementDecision, { action: "counter" }>[];
    declines: Extract<NppAgreementDecision, { action: "decline" }>[];
    rawById: ReadonlyMap<string, SupplyAgreement>;
    turn: number;
    now: Date;
  }
): Promise<void> {
  const ops: AnyBulkWriteOperation<SupplyAgreement>[] = [];
  for (const d of args.counters) {
    const raw = args.rawById.get(d.agreementId);
    if (!raw) continue;
    const offer = {
      revision: (raw.currentOffer?.revision ?? 1) + 1,
      proposedByCorpId: raw.supplierCorpId,
      volumeCap: d.volumeCap,
      pricePremium: d.pricePremium,
      exclusive: raw.exclusive ?? false,
      ...(raw.durationTurns != null ? { durationTurns: raw.durationTurns } : {}),
      proposedAtTurn: args.turn,
      proposedAt: args.now,
    };
    ops.push({
      updateOne: {
        filter: { _id: raw._id!, status: "pending", proposedByCorpId: raw.buyerCorpId },
        update: {
          $set: {
            volumeCap: d.volumeCap,
            pricePremium: d.pricePremium,
            proposedByCorpId: raw.supplierCorpId,
            currentOffer: offer,
            updatedAt: args.now,
          },
          $push: { offers: offer },
          // An AI counter is a plain premium offer, so it drops any set price.
          ...(raw.priceMode
            ? { $unset: { priceMode: "", fixedUnitPrice: "", signingMarketPrice: "" } }
            : {}),
        },
      },
    });
  }
  for (const d of args.declines) {
    const raw = args.rawById.get(d.agreementId);
    if (!raw) continue;
    ops.push({
      updateOne: {
        filter: { _id: raw._id!, status: "pending", proposedByCorpId: raw.buyerCorpId },
        update: { $set: { status: "cancelled", updatedAt: args.now } },
      },
    });
  }
  if (ops.length > 0) await collection.bulkWrite(ops, { ordered: false });
}

/** Tell each proposing player how the AI supplier answered. */
async function notifySupplierReplies(args: {
  counters: Extract<NppAgreementDecision, { action: "counter" }>[];
  declines: Extract<NppAgreementDecision, { action: "decline" }>[];
  rawById: ReadonlyMap<string, SupplyAgreement>;
  nameById: ReadonlyMap<string, string | undefined>;
  userById: ReadonlyMap<string, Corporation["userId"] | undefined>;
}): Promise<void> {
  const inputs: NotificationInput[] = [];
  const label = (raw: SupplyAgreement) => COMMODITY_LABELS[raw.commodity] ?? raw.commodity;
  const supplierName = (raw: SupplyAgreement) =>
    args.nameById.get(raw.supplierCorpId.toString()) ?? "The supplier";
  for (const d of args.counters) {
    const raw = args.rawById.get(d.agreementId);
    const userId = raw && args.userById.get(raw.buyerCorpId.toString());
    if (!raw || !userId) continue;
    const pct = Math.round(d.pricePremium * 100);
    inputs.push({
      userId,
      type: "corp_supply_agreement_offer",
      title: "Supply agreement countered",
      message: `${supplierName(raw)} countered your ${label(raw)} supply proposal at ${pct > 0 ? "+" : ""}${pct}% of market for ${Math.floor(d.volumeCap)} units. AI suppliers accept at most 10% below market and only what they can spare. Accept or counter in the Commodities tab.`,
      metadata: {
        corporationId: raw.buyerCorpId.toString(),
        agreementId: d.agreementId,
        offerRevision: (raw.currentOffer?.revision ?? 1) + 1,
      },
    });
  }
  for (const d of args.declines) {
    const raw = args.rawById.get(d.agreementId);
    const userId = raw && args.userById.get(raw.buyerCorpId.toString());
    if (!raw || !userId) continue;
    inputs.push({
      userId,
      type: "corp_supply_agreement_update",
      title: "Supply agreement declined",
      message: `${supplierName(raw)} declined your ${label(raw)} supply proposal: ${DECLINE_TEXT[d.reason]}.`,
      metadata: {
        corporationId: raw.buyerCorpId.toString(),
        agreementId: d.agreementId,
        event: "declined",
      },
    });
  }
  await createNotifications(inputs);
}

/**
 * Load NPP corps, run the matcher, persist accepts / cancel notices / new
 * active NPP-NPP contracts. No-ops when the flag is off.
 */
export async function processNppSupplyAgreements(
  db: Db,
  turn: number,
  now: Date,
  plantsEnabled: boolean
): Promise<{ accepted: number; cancelled: number; proposed: number }> {
  const cfg = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { supplyAgreementsEnabled: 1, commandEconomyEnabled: 1 } }
  );
  if (cfg?.supplyAgreementsEnabled !== true) {
    return { accepted: 0, cancelled: 0, proposed: 0 };
  }
  const step = substepMarker();

  const nppCorps = await corporationsCollection(db)
    .find(
      { ceoType: "npp", suspended: { $ne: true } },
      {
        projection: { name: 1, countryId: 1, countryOwnerId: 1, ownershipState: 1, ceoType: 1 },
      }
    )
    .toArray();
  if (nppCorps.length === 0) return { accepted: 0, cancelled: 0, proposed: 0 };

  const corpIds = nppCorps.map((c) => c._id);
  // These reads share only the already-resolved NPP cohort. Launching them
  // together removes three sequential database waits from the turn's NPP
  // supply-agreement phase.
  const [sectors, rawAgreements, commodityPriceDocs, gameState, embargoes] = await Promise.all([
    corporateSectorsCollection(db)
      .find({ corporationId: { $in: corpIds } }, { projection: NPP_SUPPLY_SECTOR_PROJECTION })
      .toArray(),
    supplyAgreementsCollection(db)
      .find(
        {
          status: { $in: ["pending", "active", "cancelling"] },
          $or: [{ supplierCorpId: { $in: corpIds } }, { buyerCorpId: { $in: corpIds } }],
        },
        { projection: NPP_SUPPLY_AGREEMENT_PROJECTION }
      )
      .toArray(),
    commodityPricesCollection<{
      commodity: string;
      turn?: number;
      basePrice?: number;
      globalPrice?: number;
      nationalPrices?: Record<string, number>;
    }>(db)
      .find({})
      .toArray(),
    gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { currentYear: 1, worldEpochId: 1, producerOpening: 1 } }
    ),
    tradeEmbargoesCollection(db)
      .find(
        {
          mode: "block",
          $or: [{ expiresTurn: { $exists: false } }, { expiresTurn: { $gte: turn } }],
        },
        {
          projection: {
            sourceCountry: 1,
            targetCountry: 1,
            commodity: 1,
            direction: 1,
            mode: 1,
            expiresTurn: 1,
          },
        }
      )
      .toArray(),
  ]);
  step.mark("nppSupply.load");

  // Player buyers with a pending proposal at an AI supplier: one batched read.
  const externalBuyerIds = [
    ...new Set(
      rawAgreements
        .filter(
          (a) =>
            a.status === "pending" &&
            !corpIds.some((id) => id.equals(a.buyerCorpId)) &&
            a.proposedByCorpId?.equals(a.buyerCorpId)
        )
        .map((a) => a.buyerCorpId.toString())
    ),
  ];
  const externalBuyers = new Map<string, ExternalBuyer>();
  const externalBuyerUsers = new Map<string, Corporation["userId"]>();
  if (externalBuyerIds.length > 0) {
    const docs = await corporationsCollection(db)
      .find(
        { _id: { $in: externalBuyerIds.map((id) => new ObjectId(id)) } },
        { projection: { countryId: 1, userId: 1 } }
      )
      .toArray();
    for (const d of docs) {
      externalBuyers.set(d._id.toString(), { countryId: d.countryId });
      externalBuyerUsers.set(d._id.toString(), d.userId);
    }
  }
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const key = s.corporationId.toString();
    const list = sectorsByCorp.get(key) ?? [];
    list.push(s);
    sectorsByCorp.set(key, list);
  }

  const soldShareWorld = soldShareWorldOf(gameState, turn);
  const parties = nppCorps.map((c) =>
    toParty(c, sectorsByCorp.get(c._id.toString()) ?? [], soldShareWorld)
  );
  const nppIds = new Set(nppCorps.map((c) => c._id.toString()));

  const agreements: ExistingNppAgreement[] = rawAgreements.map(toExistingNppAgreement);
  const expiresAtById = new Map(
    rawAgreements.map((a) => [a._id!.toString(), a.expiresAtTurn] as const)
  );

  const priceByCommodity = new Map<
    string,
    {
      turn?: number;
      basePrice?: number;
      globalPrice?: number;
      nationalPrices?: Record<string, number>;
    }
  >();
  for (const doc of commodityPriceDocs) {
    const existing = priceByCommodity.get(doc.commodity);
    if (!existing || (doc.turn ?? 0) >= (existing.turn ?? 0)) {
      priceByCommodity.set(doc.commodity, doc);
    }
  }
  const priceRatioOf = (commodity: CommodityType, countryId: string): number | null => {
    const doc = priceByCommodity.get(commodity);
    if (!doc?.basePrice) return null;
    const price = doc.nationalPrices?.[countryId] ?? doc.globalPrice;
    if (!price || !Number.isFinite(price)) return null;
    return price / doc.basePrice;
  };

  // Planned economies produce a different commodity from the same media plant
  // and are derated differently, so the capacity checks inside the matcher need
  // both to size a contract against what the sink will credit.
  const currentYear = gameState?.currentYear;
  const decisions = decideNppSupplyAgreements({
    turn,
    plantsEnabled,
    parties,
    agreements,
    priceRatioOf,
    staggerEligible: (id) => glutStaggerEligible(id, turn),
    currentYear,
    commandEconomyEnabled: cfg?.commandEconomyEnabled === true,
    externalBuyers,
    tradeBlocked: buildTradeBlocked({
      embargoes,
      turn,
      currentYear,
      commandEconomyEnabled: cfg?.commandEconomyEnabled === true,
    }),
  });

  step.mark("nppSupply.decide");
  const activations = decisions.filter(
    (decision): decision is Extract<NppAgreementDecision, { action: "activate" }> =>
      decision.action === "activate"
  );
  const cancellations = decisions.filter(
    (decision): decision is Extract<NppAgreementDecision, { action: "cancelNotice" }> =>
      decision.action === "cancelNotice"
  );
  const counters = decisions.filter(
    (decision): decision is Extract<NppAgreementDecision, { action: "counter" }> =>
      decision.action === "counter"
  );
  const declines = decisions.filter(
    (decision): decision is Extract<NppAgreementDecision, { action: "decline" }> =>
      decision.action === "decline"
  );
  const rawById = new Map(rawAgreements.map((a) => [a._id!.toString(), a] as const));
  const nameById = new Map(nppCorps.map((c) => [c._id.toString(), c.name] as const));
  let accepted = 0;
  let cancelled = 0;
  let proposed = 0;
  const inserts: SupplyAgreement[] = [];

  for (const d of decisions) {
    if (d.action === "propose") {
      if (!nppIds.has(d.supplierCorpId) || !nppIds.has(d.buyerCorpId)) continue;
      inserts.push({
        volumeCapBasis: "scaledCapacity",
        supplierCorpId: new ObjectId(d.supplierCorpId),
        buyerCorpId: new ObjectId(d.buyerCorpId),
        commodity: d.commodity,
        ...(d.stateId ? { stateId: d.stateId } : {}),
        volumeCap: d.volumeCap,
        pricePremium: d.pricePremium,
        exclusive: false,
        status: "active",
        startsAtTurn: turn,
        durationTurns: NPP_CONTRACT_TERM_TURNS,
        expiresAtTurn: turn + NPP_CONTRACT_TERM_TURNS,
        proposedByCorpId: new ObjectId(d.supplierCorpId),
        createdAt: now,
        updatedAt: now,
      });
      proposed += 1;
    }
  }

  const agreementsCollection = supplyAgreementsCollection(db);
  const durationById = new Map(agreements.map((a) => [a.id, a.durationTurns]));
  // Contracts AI corporations signed with each other before AI contracts had a
  // term never expire, and every live contract is settled and rewritten each
  // turn. Give each a staggered expiry; after the first pass this finds none.
  const openEnded = openEndedAiContracts(rawAgreements, nppIds);
  const [, activationResult, cancellationResult] = await Promise.all([
    writeSupplierReplies(agreementsCollection, { counters, declines, rawById, turn, now }),
    openEnded.length > 0
      ? agreementsCollection.bulkWrite(
          openEnded.map((id) => ({
            updateOne: {
              filter: { _id: id, status: "active", expiresAtTurn: { $exists: false } },
              update: {
                $set: {
                  durationTurns: NPP_CONTRACT_TERM_TURNS,
                  expiresAtTurn: aiContractBackfillExpiry(id.toString(), turn),
                  updatedAt: now,
                },
              },
            },
          })),
          { ordered: false }
        )
      : null,
    activations.length > 0
      ? agreementsCollection.bulkWrite(
          activations.map((decision) => {
            const durationTurns = durationById.get(decision.agreementId);
            return {
              updateOne: {
                filter: { _id: new ObjectId(decision.agreementId), status: "pending" },
                // Same lifecycle stamps as the player accept path.
                update: {
                  $set: {
                    status: "active" as const,
                    startsAtTurn: turn,
                    ...(durationTurns != null ? { expiresAtTurn: turn + durationTurns } : {}),
                    updatedAt: now,
                  },
                },
              },
            };
          })
        )
      : null,
    cancellations.length > 0
      ? agreementsCollection.bulkWrite(
          cancellations.map((decision) => ({
            updateOne: {
              filter: { _id: new ObjectId(decision.agreementId), status: "active" },
              update: {
                $set: {
                  status: "cancelling",
                  cancelEffectiveTurn: contractCancelEffectiveTurn(
                    turn,
                    expiresAtById.get(decision.agreementId)
                  ),
                  updatedAt: now,
                },
              },
            },
          }))
        )
      : null,
  ]);
  accepted = activationResult?.modifiedCount ?? 0;
  cancelled = cancellationResult?.modifiedCount ?? 0;

  if (inserts.length > 0) {
    await agreementsCollection.insertMany(inserts);
  }

  await notifySupplierReplies({
    counters,
    declines,
    rawById,
    nameById,
    userById: externalBuyerUsers,
  });

  step.mark("nppSupply.write");

  await syncAiSupplyListings(db, {
    turn,
    now,
    plantsEnabled,
    parties,
    // Live and pending contracts, so spare capacity is net of committed volume.
    agreements,
    priceRatioOf,
    currentYear,
    commandEconomyEnabled: cfg?.commandEconomyEnabled === true,
  });
  step.mark("nppSupply.listings");
  return { accepted, cancelled, proposed };
}
