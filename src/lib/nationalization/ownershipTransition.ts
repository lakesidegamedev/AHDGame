import { transferFinancialHoldings } from "./transferFinancialHoldings";
import { transferCorporateArrears } from "./transferCorporateArrears";
import { combineLiabilityBooks } from "./rules/financialHoldings";
import { corporateCashArrearsAnchor } from "@/lib/bonds/corporateCredit";
import { sumHeldBondFaceAnchor } from "@/lib/bonds/corpExitEquity";
import { absorbSectorIntoNatCorp } from "@/lib/nationalization/siteAbsorption";
import { payShareholders } from "@/lib/nationalization/shareholderCompensation";
export { payShareholders } from "@/lib/nationalization/shareholderCompensation";
export type { PayShareholdersLedgerContext } from "@/lib/nationalization/shareholderCompensation";
import { TIER_MULTIPLIER } from "./constants";

import { moveProducerLiabilities } from "./producerLiabilities";
import { producerDebtAnchor, producerStockBookAnchor } from "./rules/fundedOwnership";

import type { Db } from "mongodb";

import { heldStakeValueAnchor, transferOwnedSharesToNatCorp } from "./heldEquityTransfer";
import { ObjectId } from "mongodb";
import { badRequest } from "@/lib/api/errors";
import type { Corporation, CorporateSector } from "@/lib/db/types";

import { splitCompensationBySector } from "./compensationSplit";
import type { CurrencyCode } from "@/lib/constants/currencies";

import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { buildPersonalBalanceInc, getHomeCurrency } from "@/lib/currency/characterFunds";
import { sumBondPrincipalAnchor } from "@/lib/bonds/bondPrincipalSum";

import { buildPrimeRateMap, computeSectorNpvSum } from "@/lib/bonds/corporateBondDefault";
import { cleanupShareMarketActivityForCorporations } from "@/lib/corporations/cleanupShareMarketActivity";

import { applyBrandFacilityLoss } from "@/lib/corporations/brandFacilityLoss";
import { stampSubjectDeleted } from "@/lib/financialTxLog/stampDeleted";

import type { CountryId } from "@/lib/constants/countries";
import {
  ensurePrimaryNationalCorporation,
  resolveNationalCorporationForSector,
} from "./nationalCorporation";
import {
  applyTier,
  computeWholeCorpValuation,
  sectorCompensationValuationAnchor,
  wholeCorpCompensationAnchor,
} from "./compensation";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";

import { getGameState } from "@/lib/gameState";
import { sumSectorBookValueAnchor } from "@/lib/corporations/sectorProfitBasis";
import { readStateOwnershipConcentration, sociMultiplier } from "./concentration";
import {
  creditTreasuryProceedsFromAnchor,
  debitTreasuryCompensation,
  settleFundedTreasuryCompensation,
} from "./treasury";
import {
  loadTreasuryCashContext,
  resolveTreasuryCashOptions,
  witnessTreasuryCash,
  type TreasuryCashOptions,
} from "./treasuryLedger";
import { snapshotCorporationCurrency } from "@/lib/ledger/balanceSnapshot";
import { deleteDissolvedCorporation } from "./dissolvedCorporation";
import type { CompensationTier } from "./constants";

import { applyNationalizationConsequences } from "./consequences/apply";
import { recordNationalizationLedger } from "./ledger";
import type { NationalizationMethod, NationalizationTrigger } from "./consequences/types";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import {
  combineConstructionBorrowerTransferPlans,
  prepareConstructionBorrowerTransfers,
  securedSiteMergeRefusal,
  settleConstructionBorrowerTransfers,
  type ConstructionBorrowerTransferPlan,
} from "@/lib/banking/constructionBorrowerTransfer";
import { assumedSecuredPrincipalAnchor } from "@/lib/banking/rules/constructionBorrowerTransfer";
import {
  assumeCorporateLoans,
  corporateLoanAssumptionCheck,
  loadLiveCorporateLoans,
  restoreCorporateLoans,
} from "@/lib/banking/corporateLoanAssumption";
import {
  acquireConstructionPropertyTransition,
  hasProtectedConstructionClaim,
  releaseConstructionPropertyTransition,
  reserveSectorsForTransition,
} from "@/lib/corporations/securedConstructionProperty";
import {
  settleFundedWholeCorpLiquidation,
  settleFundedWholeCorpShareholderPool,
} from "./fundedOwnershipSettlement";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

export {
  settleFundedWholeCorpLiquidation,
  settleFundedWholeCorpShareholderPool,
} from "./fundedOwnershipSettlement";

/**
 * Politics inputs the caller supplies; the money fields (valuation, compensation,
 * foreign-owner) are computed by the transition itself and merged in.
 */
export interface TransitionConsequenceInput {
  method: NationalizationMethod;
  triggers: NationalizationTrigger[];
  turn: number;
  governingPartyId?: string | null;
  actorCharacterId?: ObjectId;
}

/** Pairs a seized site with the holding `absorbSectorIntoNatCorp` folds it into. */
const nationalizedSiteMergeKey = (sector: Pick<CorporateSector, "stateId" | "sectorType">) =>
  `${sector.stateId}|${sector.sectorType}`;

/**
 * Settle one FOREIGN sector (held outside the nationalizing country) of a seized
 * corporation. The country cannot hold assets under another jurisdiction, so the
 * host country's own state enterprise for that lane takes the plants through the
 * normal absorption path. When the host has no state enterprise for the lane the
 * row is dissolved: the whole-corporation buyout already paid for it, and
 * capacity nobody operates simply stops.
 */
async function settleForeignSector(
  db: Db,
  sector: CorporateSector,
  now: Date,
  absorbedAtTurn: number,
  plantsEnabled: boolean,
  transitionKey: string,
  constructionTransfers: ConstructionBorrowerTransferPlan
): Promise<void> {
  const hostCountryId = sector.countryId as CountryId;
  const hostEnterprise = await findStateEnterpriseForLane(db, hostCountryId, sector);
  if (hostEnterprise) {
    const hostMultiplier = sociMultiplier(await readStateOwnershipConcentration(db, hostCountryId));
    await absorbSectorIntoNatCorp(
      db,
      sector,
      hostEnterprise._id,
      absorbedAtTurn,
      now,
      hostMultiplier,
      plantsEnabled,
      transitionKey,
      undefined,
      constructionTransfers,
      undefined
    );
    return;
  }
  const removed = await corporateSectorsCollection(db).deleteOne({
    _id: sector._id,
    "constructionPropertyTransition.key": transitionKey,
  });
  if (removed.deletedCount !== 1)
    throw badRequest("The sector transition reservation was lost during release");
}

/**
 * The host country's existing state enterprise for a sector's lane: the lane's
 * own split-off, else the primary National Corporation that absorbs every lane
 * without one. Never created on demand.
 */
async function findStateEnterpriseForLane(
  db: Db,
  countryId: CountryId,
  sector: Pick<CorporateSector, "sectorType">
): Promise<Corporation | null> {
  const operatingSectorType = sector.sectorType;
  const corps = corporationsCollection(db);
  const assigned = await corps.findOne({
    countryOwnerId: countryId,
    assignedSectorTypes: operatingSectorType,
  });
  if (assigned) return assigned;
  return corps.findOne({ countryOwnerId: countryId, isPrimaryNationalCorporation: true });
}

// ── Single-sector absorption ──────────────────────────────────────────────────

export interface NationalizeSectorParams {
  countryId: CountryId;
  sectorId: ObjectId;
  tier: CompensationTier;
  consequence: TransitionConsequenceInput;
}

export interface NationalizeSectorResult {
  nationalCorporationId: ObjectId;
  /** Compensation credited to the donor's liquid capital, in the donor's currency. */
  compensationPaid: number;
  /**
   * The surviving NatCorp sector row after the taking: the re-parented donor row,
   * or the merge survivor when folded into an existing holding. Carries
   * `nationalizationProvenance` so a reversal can return the sector to its prior owner.
   */
  resultingSectorId: ObjectId;
}

/**
 * Single-sector nationalization: move one (stateId, sectorType) sector into the
 * country's National Corporation; the donor corp survives and is paid
 * `sectorNPV × tier` into its liquid capital.
 *
 * Valuation reuses the canonical `computeSectorNpvSum` (the same going-concern
 * NPV used by corporate-bond-default dissolution + issuance), so the sector is
 * valued identically everywhere. That helper returns ₳ (anchor); the payout is
 * converted back to the donor's currency at the persistence boundary.
 */
export async function nationalizeSector(
  db: Db,
  params: NationalizeSectorParams
): Promise<NationalizeSectorResult> {
  const now = new Date();
  const sectors = corporateSectorsCollection(db);
  const corps = corporationsCollection(db);

  const sector = await sectors.findOne({ _id: params.sectorId });
  if (!sector) throw new Error("Sector not found");

  const donor = await corps.findOne({ _id: sector.corporationId });
  if (!donor) throw new Error("Donor corporation not found");

  // Route to the NatCorp that owns this sector type (split-off if one claims it,
  // else the primary). Future takings of a split-off type land in the right corp.
  const nationalCorp = await resolveNationalCorporationForSector(
    db,
    params.countryId,
    sector.sectorType
  );

  // Valuation in ₳ via the canonical sector NPV (going-concern, growth-cost-net).
  const [centralBanks, fxByCurrency, donorFxRate, marketMode, gameState] = await Promise.all([
    centralBanksCollection(db).find({}).toArray(),
    loadFxRatesByCurrency(db),
    getCorpFxRate(db, donor),
    getMarketSystemModeForDb(db),
    getGameState(db),
  ]);
  const plantsEnabled = marketAtLeast(marketMode, "plants");
  const primeMap = buildPrimeRateMap(centralBanks);
  // Nationalization pays on steady-state earning power (revenue - maintenance),
  // not growth-cost-net NPV: a sector being actively grown must not value to 0
  // just because growth spending consumes current profit.
  //
  // Under plants the base switches to replacement-cost book (and the premium
  // inside applyTier switches with it).
  const grossValuationAnchor = sectorCompensationValuationAnchor(
    sector,
    computeSectorNpvSum([sector], primeMap, donor, fxByCurrency, {
      excludeGrowthCost: true,
      plantsEnabled,
    }),
    {
      plantsEnabled,
      currentYear: gameState?.currentYear,
      currentTurn: gameState?.currentTurn,
      eraUnitScale: await loadWorldEraUnitScale(db),
    }
  );

  // Debit the treasury BEFORE any mutation. The debit is unconditional — an
  // unaffordable payout pushes the treasury into the hole rather than blocking
  // the taking. Seizure (0 payout) moves nothing.
  const compensationKey = `nationalize-sector:${params.countryId}:${sector._id.toString()}:${gameState?.currentTurn ?? 0}`;
  const compensationLedger = await resolveTreasuryCashOptions(db);
  const ownsFundedReservation =
    sector.constructionPropertyTransition?.key === compensationKey &&
    sector.constructionPropertyTransition.kind === "nationalization";
  // The state takes the site with its secured construction loan, the same way
  // a whole-corp taking assumes the seized corporation's bonds: the National
  // Corporation becomes the borrower. Checked and locked before compensation.
  if (hasProtectedConstructionClaim(sector) && !sector.producerInventory) {
    const mergeRefusal = await securedSiteMergeRefusal(
      db,
      [sector],
      nationalCorp._id,
      nationalizedSiteMergeKey
    );
    if (mergeRefusal) throw badRequest(mergeRefusal);
  }
  const preparedTransfers = await prepareConstructionBorrowerTransfers(db, {
    sectors: [sector],
    toId: nationalCorp._id,
    toCurrency: resolveCorpLiquidCurrencyCode(nationalCorp) ?? undefined,
    operationKey: compensationKey,
    turn: gameState?.currentTurn ?? params.consequence.turn,
    ownsTransition: () => ownsFundedReservation || !!sector.pendingFundedNationalization,
  });
  if (!preparedTransfers.ok) throw badRequest(preparedTransfers.error);
  const constructionTransfers = preparedTransfers.plan;
  // The National Corporation repays the bank, so the former owner is paid for
  // the site net of what it still owes on it, the same way a whole-corp taking
  // nets the bonds the state assumes.
  const valuationAnchor = Math.max(
    0,
    grossValuationAnchor -
      assumedSecuredPrincipalAnchor(constructionTransfers.transfers, fxByCurrency)
  );
  const payoutAnchor = Math.max(
    0,
    applyTier(valuationAnchor, params.tier, { plantsEnabled }) -
      producerDebtAnchor(donor.producerPayables, sector._id.toHexString()) *
        TIER_MULTIPLIER[params.tier]
  );
  try {
    if (
      sector.pendingFundedNationalization &&
      (sector.pendingFundedNationalization.operationKey !== compensationKey ||
        !compensationLedger?.context?.treasuryCashLedgerEnabled)
    ) {
      throw new Error("Funded nationalization retry requires its original Treasury cash mode");
    }
    if (ownsFundedReservation && !compensationLedger?.context?.treasuryCashLedgerEnabled) {
      throw new Error("Funded nationalization retry requires its original Treasury cash mode");
    }
    if (compensationLedger?.context?.treasuryCashLedgerEnabled) {
      if (
        !(await acquireConstructionPropertyTransition(
          db,
          sector,
          compensationKey,
          "nationalization",
          false,
          true,
          constructionTransfers.hasTransfer(sector._id)
            ? constructionTransfers.claimFilterFor(sector)
            : undefined
        ))
      ) {
        throw badRequest("This sector is in another ownership change. Try again shortly.");
      }
      const reservation = await sectors.updateOne(
        {
          _id: sector._id,
          corporationId: donor._id,
          $or: [
            { pendingFundedNationalization: { $exists: false } },
            { pendingFundedNationalization: { operationKey: compensationKey } },
          ],
        },
        { $set: { pendingFundedNationalization: { operationKey: compensationKey } } }
      );
      if ((reservation?.matchedCount ?? 0) !== 1)
        throw new Error("Could not reserve the funded nationalization mode");
    }
    let fundedCompensationLocal: number | undefined;
    let fundedCompensationNewlySettled = false;
    let fundedTreasuryAmountLocal = 0;
    let fundedPayoutAnchor: number | undefined;
    if (compensationLedger?.context?.treasuryCashLedgerEnabled) {
      const settled = await settleFundedTreasuryCompensation(db, {
        countryId: params.countryId,
        donor,
        payoutAnchor,
        fxByCurrency,
        now,
        key: compensationKey,
        ledger: compensationLedger!,
      });
      fundedCompensationLocal = settled.donorAmountLocal;
      fundedCompensationNewlySettled = settled.newlySettled;
      fundedTreasuryAmountLocal = settled.treasuryAmountLocal;
      fundedPayoutAnchor = settled.payoutAnchor;
    } else {
      await debitTreasuryCompensation(db, params.countryId, payoutAnchor, fxByCurrency, now, {
        flow: "nationalization_compensation",
        key: compensationKey,
        ledger: compensationLedger,
      });
    }
    const effectivePayoutAnchor = fundedPayoutAnchor ?? payoutAnchor;

    // Snapshot the SOCI escalation multiplier at taking time so the transition
    // shock is fixed to today's concentration, not retroactively deepened later.
    const transitionMultiplier = sociMultiplier(
      await readStateOwnershipConcentration(db, params.countryId)
    );

    // Move the sector into the National Corporation, merging into an existing
    // (NatCorp, state, type) holding when present. Stamp the absorption turn so the
    // re-privatization cooldown (spec §13.4) can protect just-absorbed assets.
    // Brand facility-loss (Boeing rule): the donor survives a single-sector taking
    // but loses this plant to the state, so dent its brand proportional to the
    // sector's share of its revenue. Called before the sector is re-parented (the
    // aggregate still includes it). No-op when the donor has no loyalty.
    await applyBrandFacilityLoss(db, donor._id, sector.revenue);

    const resultingSectorId = await absorbSectorIntoNatCorp(
      db,
      sector,
      nationalCorp._id,
      params.consequence.turn,
      now,
      transitionMultiplier,
      plantsEnabled,
      compensationLedger?.context?.treasuryCashLedgerEnabled ? compensationKey : undefined,
      compensationLedger?.context?.treasuryCashLedgerEnabled ? compensationKey : undefined,
      constructionTransfers,
      { countryId: params.countryId, anchor: effectivePayoutAnchor }
    );
    await settleConstructionBorrowerTransfers(db, constructionTransfers);

    // Credit the donor in its own currency (counterparty of the treasury debit).
    let compensationPaid = 0;
    if (payoutAnchor > 0 || (fundedCompensationLocal ?? 0) > 0) {
      compensationPaid =
        fundedCompensationLocal ??
        Math.round(anchorToCorpLiquidCapital(payoutAnchor, donor, donorFxRate));
      if (fundedCompensationLocal === undefined) {
        const credited = await corps.updateOne(
          { _id: donor._id },
          { $inc: { liquidCapital: compensationPaid }, $set: { updatedAt: now } }
        );
        if ((credited?.matchedCount ?? 0) > 0) {
          await witnessTreasuryCash(db, compensationLedger, {
            flow: "nationalization_compensation",
            account: {
              kind: "corporation",
              corpId: donor._id.toString(),
              currency: snapshotCorporationCurrency(donor),
            },
            amount: compensationPaid,
            now,
            site: "ownershipTransition:compensation",
          });
        }
      } else if (fundedCompensationNewlySettled) {
        await witnessTreasuryCash(db, compensationLedger, {
          flow: "nationalization_compensation",
          account: { kind: "government", countryId: params.countryId },
          amount: -fundedTreasuryAmountLocal,
          now,
          site: "ownershipTransition:compensation",
        });
        await witnessTreasuryCash(db, compensationLedger, {
          flow: "nationalization_compensation",
          account: {
            kind: "corporation",
            corpId: donor._id.toString(),
            currency: snapshotCorporationCurrency(donor),
          },
          amount: compensationPaid,
          now,
          site: "ownershipTransition:compensation",
        });
      }
    }

    // Politics + investor-confidence (spec §12). Compensation here is in ₳ already.
    const consequenceResult = await applyNationalizationConsequences(db, {
      countryId: params.countryId,
      method: params.consequence.method,
      tier: params.tier,
      triggers: params.consequence.triggers,
      sectorTypes: [sector.sectorType],
      valuationAnchor,
      compensationAnchor: effectivePayoutAnchor,
      foreignOwnerCountryId: donor.countryId !== params.countryId ? donor.countryId : null,
      governingPartyId: params.consequence.governingPartyId ?? null,
      turn: params.consequence.turn,
      actorCharacterId: params.consequence.actorCharacterId,
    });

    // Acquisition ledger (Register tab). Best-effort — a failed write never aborts.
    try {
      await recordNationalizationLedger(db, {
        countryId: params.countryId,
        nationalCorporationId: nationalCorp._id,
        kind: "nationalize_sector",
        method: params.consequence.method,
        triggers: params.consequence.triggers,
        tier: params.tier,
        valuationAnchor,
        compensationAnchor: effectivePayoutAnchor,
        sectorTypes: [sector.sectorType],
        formerCorpName: donor.name,
        foreignOwnerCountryId: donor.countryId !== params.countryId ? donor.countryId : null,
        confidenceBefore: consequenceResult.confidenceBefore,
        confidenceAfter: consequenceResult.confidenceAfter,
        legitimacyDelta: consequenceResult.legitimacyDelta,
        turn: params.consequence.turn,
      });
    } catch (err) {
      console.error("[nationalizationLedger] sector ledger write failed:", err);
    }

    return { nationalCorporationId: nationalCorp._id, compensationPaid, resultingSectorId };
  } finally {
    // A loan follows its site only if the title actually moved.
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
  }
}

// ── Whole-corp absorption ─────────────────────────────────────────────────────

export interface NationalizeWholeCorpParams {
  countryId: CountryId;
  corporationId: ObjectId;
  tier: CompensationTier;
  consequence: TransitionConsequenceInput;
}

export interface NationalizeWholeCorpResult {
  nationalCorporationId: ObjectId;
  sectorsAbsorbed: number;
  bondsAssumed: number;
  /** Total shareholder compensation paid out, in ₳. */
  shareholderPayoutAnchor: number;
}

/**
 * Whole-corp absorption (central model): pay shareholders pro-rata at
 * `valuation × tier`, move every sector into the country's National Corporation,
 * re-stamp the seized corp's issued bonds to the National Corporation (the state
 * assumes the debt — coupons keep paying, no default), then dissolve the seized
 * shell. Valuation inputs are captured BEFORE anything moves.
 */
export async function nationalizeWholeCorp(
  db: Db,
  params: NationalizeWholeCorpParams
): Promise<NationalizeWholeCorpResult> {
  const now = new Date();
  const corps = corporationsCollection(db);
  const sectors = corporateSectorsCollection(db);
  const bonds = bondsCollection(db);

  const target = await corps.findOne({ _id: params.corporationId });
  if (!target) throw new Error("Target corporation not found");
  if (target.countryOwnerId || target.ownershipState === "stateOwned") {
    throw new Error("Cannot nationalize a state-owned corporation");
  }

  const nationalizationOperationKey = `nationalize:${params.countryId}:${target._id.toHexString()}:${params.consequence.turn}`;
  const buyoutKey = `nationalize-corporation:${params.countryId}:${target._id.toString()}:${params.consequence.turn}`;
  const ledger: TreasuryCashOptions = { context: await loadTreasuryCashContext(db) };
  const hasFundedNationalizationMarker =
    target.pendingFundedNationalization?.operationKey === nationalizationOperationKey;
  if (
    (target.pendingFundedNationalization && !hasFundedNationalizationMarker) ||
    (hasFundedNationalizationMarker && !ledger.context?.treasuryCashLedgerEnabled)
  ) {
    throw new Error("Funded nationalization retry requires Treasury cash");
  }

  const targetSectors = await sectors.find({ corporationId: target._id }).toArray();
  const foreignFunded = targetSectors.filter(
    (site) => site.producerInventory && site.countryId && site.countryId !== params.countryId
  );
  if (foreignFunded.length) {
    const hostEnterprises = await corporationsCollection(db)
      .find(
        { countryOwnerId: { $in: [...new Set(foreignFunded.map((site) => site.countryId))] } },
        {
          projection: {
            countryOwnerId: 1,
            assignedSectorTypes: 1,
            isPrimaryNationalCorporation: 1,
          },
        }
      )
      .toArray();
    if (
      foreignFunded.some(
        (site) =>
          !hostEnterprises.some(
            (host) =>
              host.countryOwnerId === site.countryId &&
              (host.isPrimaryNationalCorporation ||
                host.assignedSectorTypes?.includes(site.sectorType))
          )
      )
    )
      throw badRequest(
        "A funded site abroad needs a receiving state enterprise or must be sold before this taking. Its stock and unpaid bills cannot be released without a successor."
      );
  }

  if (
    !ledger.context?.treasuryCashLedgerEnabled &&
    targetSectors.some(
      (sector) => sector.constructionPropertyTransition?.kind === "nationalization"
    )
  ) {
    throw new Error("Nationalization retry requires its original Treasury cash mode");
  }
  // Domestic financed sites go to their National Corporation with their loans,
  // the same way the seized corporation's bonds are assumed below. A foreign
  // financed site would be released to the open market with no buyer to repay
  // its lender, so it still blocks the taking.
  const financedSites = targetSectors.filter((sector) => hasProtectedConstructionClaim(sector));
  if (financedSites.some((s) => s.countryId && s.countryId !== params.countryId)) {
    throw badRequest(
      "A site this corporation holds abroad carries a construction loan. It must be repaid or sold before the taking."
    );
  }
  // The primary NatCorp is the bond and ordinary-loan assumption target and the
  // canonical return. Individual sectors may route to split-offs (resolved per
  // type below).
  const nationalCorp = await ensurePrimaryNationalCorporation(db, params.countryId);
  combineLiabilityBooks(target.operatingCashArrearsByCurrency, undefined);
  combineLiabilityBooks(target.federalTaxArrearsAnchorByCountry, undefined);
  await transferFinancialHoldings(db, target._id, nationalCorp._id, now, { dryRun: true });
  // Its ordinary bank loans become the National Corporation's debt, like its
  // bonds. Checked before any site is reserved or money moves.
  const loanRefusal = await corporateLoanAssumptionCheck(db, {
    fromId: target._id,
    toCurrency: resolveCorpLiquidCurrencyCode(nationalCorp) ?? undefined,
  });
  if (loanRefusal) throw badRequest(loanRefusal);
  const financedByDest = new Map<string, { dest: Corporation; sites: CorporateSector[] }>();
  for (const site of financedSites) {
    const dest = await resolveNationalCorporationForSector(db, params.countryId, site.sectorType);
    const group = financedByDest.get(dest._id.toHexString()) ?? { dest, sites: [] };
    group.sites.push(site);
    financedByDest.set(dest._id.toHexString(), group);
  }
  const transferPlans: ConstructionBorrowerTransferPlan[] = [];
  const abandonTransfers = () =>
    settleConstructionBorrowerTransfers(
      db,
      combineConstructionBorrowerTransferPlans(transferPlans)
    );
  for (const { dest, sites } of financedByDest.values()) {
    const mergeRefusal = await securedSiteMergeRefusal(
      db,
      sites.filter((s) => !s.producerInventory),
      dest._id,
      nationalizedSiteMergeKey
    );
    const prepared = mergeRefusal
      ? ({ ok: false, error: mergeRefusal } as const)
      : await prepareConstructionBorrowerTransfers(db, {
          sectors: sites,
          toId: dest._id,
          toCurrency: resolveCorpLiquidCurrencyCode(dest) ?? undefined,
          operationKey: nationalizationOperationKey,
          turn: params.consequence.turn,
          ownsTransition: (sector) =>
            sector.constructionPropertyTransition?.key ===
            `${nationalizationOperationKey}:${sector._id.toHexString()}`,
        });
    if (!prepared.ok) {
      await abandonTransfers();
      throw badRequest(prepared.error);
    }
    transferPlans.push(prepared.plan);
  }
  const constructionTransfers = combineConstructionBorrowerTransferPlans(transferPlans);
  const transitionKeys = await reserveSectorsForTransition(
    db,
    targetSectors,
    "nationalization",
    nationalizationOperationKey,
    true,
    constructionTransfers
  );
  if (!transitionKeys) {
    await abandonTransfers();
    throw badRequest(
      "A site of this corporation is in another ownership change. Try again shortly."
    );
  }
  if (ledger.context?.treasuryCashLedgerEnabled) {
    const marker = await corps.updateOne(
      {
        _id: target._id,
        $or: [
          { pendingFundedNationalization: { $exists: false } },
          { pendingFundedNationalization: { operationKey: nationalizationOperationKey } },
        ],
      },
      {
        $set: {
          pendingFundedNationalization: { operationKey: nationalizationOperationKey },
          updatedAt: now,
        },
      }
    );
    if ((marker?.matchedCount ?? 0) !== 1)
      throw new Error("Could not reserve the funded nationalization mode");
  }
  const transitionKeyBySectorId = new Map(
    targetSectors.map((sector, index) => [sector._id.toHexString(), transitionKeys[index]])
  );

  // ── 1. Capture valuation inputs BEFORE moving sectors/bonds (₳). ──
  const [
    targetBonds,
    heldStakes,
    heldBonds,
    centralBanks,
    fxByCurrency,
    targetFxRate,
    marketMode,
    corpGameState,
    ordinaryLoans,
  ] = await Promise.all([
    bonds.find({ corporationId: target._id, matured: false }).toArray(),
    corps
      .find(
        { "shareholders.corporationId": target._id },
        { projection: { shareholders: 1, sharePrice: 1, liquidCurrencyCode: 1, countryId: 1 } }
      )
      .toArray(),
    bonds.find({ "holders.corporationId": target._id, matured: false }).toArray(),
    centralBanksCollection(db).find({}).toArray(),
    loadFxRatesByCurrency(db),
    getCorpFxRate(db, target),
    getMarketSystemModeForDb(db),
    getGameState(db),
    loadLiveCorporateLoans(db, target._id, { ordinaryOnly: true }),
  ]);
  const corpPlantsEnabled = marketAtLeast(marketMode, "plants");
  const corpEraUnitScale = await loadWorldEraUnitScale(db);
  const primeMap = buildPrimeRateMap(centralBanks);
  // Steady-state valuation for the whole-corp payout — see nationalizeSector.
  // D11: under plants the sector leg of balance-sheet equity is replacement-cost
  // book, not capitalized earnings.
  const sectorNpvAnchor = corpPlantsEnabled
    ? sumSectorBookValueAnchor(
        targetSectors,
        corpGameState?.currentYear,
        corpEraUnitScale,
        corpGameState?.currentTurn
      )
    : computeSectorNpvSum(targetSectors, primeMap, target, fxByCurrency, {
        excludeGrowthCost: true,
      });
  const liquidCapitalAnchor = corpLiquidCapitalToAnchor(target.liquidCapital, target, targetFxRate);
  // Debt the state assumes: the corp's issued, non-matured bond principal,
  // the secured construction loans its National Corporations take on, and its
  // ordinary bank loans (construction loans excluded there, so none counts twice).
  const debtAnchor =
    corporateCashArrearsAnchor({
      operatingByCurrency: target.operatingCashArrearsByCurrency,
      federalTaxByCountryAnchor: target.federalTaxArrearsAnchorByCountry,
      fxByCurrency,
    }) +
    producerDebtAnchor(target.producerPayables) +
    sumBondPrincipalAnchor(targetBonds, fxByCurrency) +
    assumedSecuredPrincipalAnchor(constructionTransfers.transfers, fxByCurrency) +
    assumedSecuredPrincipalAnchor(
      ordinaryLoans.map((loan) => ({
        outstandingLocal: loan.outstanding,
        currency: loan.currency,
      })),
      fxByCurrency
    );
  // Shares the seized corp holds in other corporations pass to the National
  // Corporation (step 5b) as shares only, so the buyout pays holders market value,
  // like cash. Bond holdings retain their face-value asset basis.
  const heldEquityAnchor = heldStakeValueAnchor(heldStakes, target._id, fxByCurrency);
  const heldBondsAnchor = sumHeldBondFaceAnchor(heldBonds, target._id, fxByCurrency);
  const sharePriceAnchor = corpLiquidCapitalToAnchor(target.sharePrice, target, targetFxRate);
  // D11 — base and premium must move together. Under plants the sector leg is
  // replacement-cost book and carries the BOOK premium; cash is taken at par
  // (paying a premium on cash mints money); debt nets off cash first. Pre-fix,
  // `computeWholeCorpValuation`'s max(marketCap, equity) could hand a MARKET
  // base to `applyTier`'s BOOK premium — see `wholeCorpCompensationAnchor`.
  // Below plants the original market-cap-floored path is untouched.
  let valuationAnchor: number;
  let payoutPoolAnchor: number;
  if (corpPlantsEnabled) {
    const comp = wholeCorpCompensationAnchor({
      sectorBookAnchor: sectorNpvAnchor,
      nonSectorAssetsAnchor:
        liquidCapitalAnchor +
        heldEquityAnchor +
        heldBondsAnchor +
        targetSectors.reduce((n, s) => n + producerStockBookAnchor(s.producerInventory), 0),
      debtAnchor,
      tier: params.tier,
    });
    valuationAnchor = comp.valuationAnchor;
    payoutPoolAnchor = comp.payoutAnchor;
  } else {
    valuationAnchor = computeWholeCorpValuation({
      sharePrice: sharePriceAnchor,
      totalShares: target.totalShares,
      balanceSheetEquity:
        liquidCapitalAnchor + sectorNpvAnchor + heldEquityAnchor + heldBondsAnchor,
      debt: debtAnchor,
    });
    payoutPoolAnchor = applyTier(valuationAnchor, params.tier);
  }

  // ── 2. Debit the treasury BEFORE any mutation. Unconditional — an unaffordable
  //       taking deepens the treasury's debt rather than being blocked. The pool
  //       passes through the seized corporation, where every holder row settles. ──
  if (ledger.context?.treasuryCashLedgerEnabled) {
    await settleFundedWholeCorpShareholderPool(db, {
      countryId: params.countryId,
      target,
      poolAnchor: payoutPoolAnchor,
      fxByCurrency,
      forexEnabled: await isForexEnabled(),
      ledger,
      key: buyoutKey,
      now,
    });
  } else {
    await debitTreasuryCompensation(db, params.countryId, payoutPoolAnchor, fxByCurrency, now, {
      flow: "nationalization_buyout_pool",
      key: buyoutKey,
      ledger,
      passThroughCorpId: target._id.toString(),
    });

    // ── 3. Pay shareholders pro-rata (counterparty of the treasury debit). ──
    if (payoutPoolAnchor > 0) {
      await payShareholders(db, target, payoutPoolAnchor, fxByCurrency, now, {
        turn: ledger.context?.turn ?? params.consequence.turn,
        kind: "nationalize_whole",
        treasury: ledger,
        stockTaxActive:
          corpGameState?.stockHoldingTaxStartTurn !== undefined &&
          (ledger.context?.turn ?? params.consequence.turn) >=
            corpGameState.stockHoldingTaxStartTurn,
      });
    }
  }

  // ── 3b. Settle the dissolved corp's liquid cash. The shell is deleted below,
  //       so `liquidCapital` must be distributed, not destroyed. The state
  //       recoups cash up to the compensation paid shareholders; any cash
  //       beyond the buyout goes to the CEO. A seizure or vacant seat routes
  //       all of it to the treasury. Conserves money: ceoSurplus +
  //       treasuryRecoup === liquidCapital always.
  const forexEnabled = await isForexEnabled();
  if (liquidCapitalAnchor > 0 || ledger.context?.treasuryCashLedgerEnabled) {
    const ceoChar =
      params.tier === "seizure" || target.ceoVacant || !target.ceoId
        ? null
        : await charactersCollection(db).findOne({ _id: target.ceoId });
    const ceoSurplusAnchor = ceoChar ? Math.max(0, liquidCapitalAnchor - payoutPoolAnchor) : 0;
    const treasuryCashAnchor = liquidCapitalAnchor - ceoSurplusAnchor;

    if (ledger.context?.treasuryCashLedgerEnabled) {
      await settleFundedWholeCorpLiquidation(db, {
        countryId: params.countryId,
        target,
        ceo: ceoChar,
        ceoSurplusAnchor,
        treasuryCashAnchor,
        liquidCapitalAnchor,
        fxByCurrency,
        forexEnabled,
        ledger,
        key: buyoutKey,
        now,
      });
    } else {
      if (ceoChar && ceoSurplusAnchor > 0) {
        const currency = getHomeCurrency(ceoChar, corpGameState?.preset);
        const rate = fxByCurrency.get(currency as CurrencyCode) ?? 1;
        const amt = Math.round(forexEnabled ? ceoSurplusAnchor * rate : ceoSurplusAnchor);
        const credited = await charactersCollection(db).updateOne(
          { _id: ceoChar._id },
          { $inc: buildPersonalBalanceInc(amt, currency, forexEnabled), $set: { updatedAt: now } }
        );
        if ((credited?.matchedCount ?? 0) > 0) {
          await witnessTreasuryCash(db, ledger, {
            flow: "corporation_liquidation",
            account: { kind: "character", characterId: ceoChar._id.toString(), currency },
            amount: amt,
            now,
            site: "ownershipTransition:ceoSurplus",
          });
        }
      }
      if (treasuryCashAnchor > 0) {
        await creditTreasuryProceedsFromAnchor(db, params.countryId, treasuryCashAnchor, now, {
          flow: "corporation_liquidation",
          ledger,
        });
      }
    }
  }

  // ── 4. Partition by jurisdiction. DOMESTIC sectors are absorbed into the
  //       NatCorp that owns each sector TYPE (a taking spanning multiple types
  //       fans across split-offs + primary; each MERGES into the NatCorp's
  //       existing (state, type) holding so a repeat can't collide on the unique
  //       index). FOREIGN sectors (operated outside this country) cannot be held
  //       under another jurisdiction: the host country's state enterprise takes
  //       them, or they are dissolved when it has none. A sector with no countryId defaults to domestic (legacy-safe).
  const domesticSectors = targetSectors.filter(
    (s) => !s.countryId || s.countryId === params.countryId
  );
  const foreignSectors = targetSectors.filter(
    (s) => s.countryId && s.countryId !== params.countryId
  );

  // Snapshot the SOCI escalation multiplier at taking time (one value for the
  // whole-corp taking) so the transition shock is fixed to today's concentration.
  const transitionMultiplier = sociMultiplier(
    await readStateOwnershipConcentration(db, params.countryId)
  );

  // The buyout paid for the whole corporation, shared out over the sectors the
  // state keeps (by revenue) so a court reversal can recover each one's part.
  const compensationBySectorId = splitCompensationBySector(domesticSectors, payoutPoolAnchor);

  const destByType = new Map<string, ObjectId>();
  for (const s of domesticSectors) {
    let destId = destByType.get(s.sectorType);
    if (!destId) {
      const dest = await resolveNationalCorporationForSector(db, params.countryId, s.sectorType);
      destId = dest._id;
      destByType.set(s.sectorType, destId);
    }
    await absorbSectorIntoNatCorp(
      db,
      s,
      destId,
      params.consequence.turn,
      now,
      transitionMultiplier,
      corpPlantsEnabled,
      transitionKeyBySectorId.get(s._id.toHexString())!,
      undefined,
      constructionTransfers,
      {
        countryId: params.countryId,
        anchor: compensationBySectorId.get(s._id.toHexString()) ?? 0,
      }
    );
  }
  await settleConstructionBorrowerTransfers(db, constructionTransfers);
  for (const s of foreignSectors) {
    await settleForeignSector(
      db,
      s,
      now,
      params.consequence.turn,
      corpPlantsEnabled,
      transitionKeyBySectorId.get(s._id.toHexString())!,
      constructionTransfers
    );
  }

  // ── 5. State assumes the seized corp's issued bonds (re-stamp; no default). ──
  if (targetBonds.length > 0) {
    await bonds.updateMany(
      { corporationId: target._id, matured: false },
      { $set: { corporationId: nationalCorp._id, originalIssuerName: target.name, updatedAt: now } }
    );
  }

  // ── 5b. Transfer shares owned by the seized corp in other corporations. ──
  // Shares held by the seized corp must transfer to the National Corporation
  // rather than be silently destroyed during dissolution.
  await transferOwnedSharesToNatCorp(db, target, nationalCorp._id, heldStakes, now);

  // ── 6. Dissolve the seized shell. ──
  await moveProducerLiabilities(db, { fromId: target._id, toId: nationalCorp._id });
  await transferCorporateArrears(db, target._id, nationalCorp._id);
  await cleanupShareMarketActivityForCorporations(db, [target._id], now, forexEnabled);
  await stampSubjectDeleted(db, target._id, {
    sequentialId: target.sequentialId,
    deletedAt: now,
  });
  // The National Corporation now owes the seized corp's ordinary bank loans.
  // Moved after every step that can fail and just before the delete; handed
  // back if the delete fails while the corporation still exists.
  const assumedLoanIds = await assumeCorporateLoans(db, {
    fromId: target._id,
    toId: nationalCorp._id,
  });
  try {
    await deleteDissolvedCorporation(db, target._id, ledger, now, "ownershipTransition:dissolve", {
      reason: "nationalized",
      successorId: nationalCorp._id,
    });
  } catch (err) {
    if (
      assumedLoanIds.length > 0 &&
      (await corps.countDocuments({ _id: target._id }, { limit: 1 })) > 0
    )
      await restoreCorporateLoans(db, {
        ids: assumedLoanIds,
        fromId: target._id,
        toId: nationalCorp._id,
      });
    throw err;
  }
  // Keep every reservation through compensation, asset transfer, share/bond
  // settlement, and shell deletion. Only release after ownership is final.
  await Promise.all(
    targetSectors.map((sector) =>
      releaseConstructionPropertyTransition(
        db,
        sector._id,
        transitionKeyBySectorId.get(sector._id.toHexString())!
      )
    )
  );

  // Framing reflects domestic sectors actually nationalized; foreign holdings were
  // divested. target + targetSectors captured before shell deletion.
  const sectorTypesTaken = Array.from(new Set(domesticSectors.map((s) => s.sectorType)));
  const consequenceResult = await applyNationalizationConsequences(db, {
    countryId: params.countryId,
    method: params.consequence.method,
    tier: params.tier,
    triggers: params.consequence.triggers,
    sectorTypes: sectorTypesTaken,
    valuationAnchor,
    compensationAnchor: payoutPoolAnchor,
    foreignOwnerCountryId: target.countryId !== params.countryId ? target.countryId : null,
    governingPartyId: params.consequence.governingPartyId ?? null,
    turn: params.consequence.turn,
    actorCharacterId: params.consequence.actorCharacterId,
  });

  // Acquisition ledger (Register tab). Best-effort — a failed write never aborts.
  try {
    await recordNationalizationLedger(db, {
      countryId: params.countryId,
      nationalCorporationId: nationalCorp._id,
      kind: "nationalize_whole",
      method: params.consequence.method,
      triggers: params.consequence.triggers,
      tier: params.tier,
      valuationAnchor,
      compensationAnchor: payoutPoolAnchor,
      debtAnchor,
      shareholdersSettled: target.shareholders?.length ?? 0,
      sectorTypes: sectorTypesTaken,
      formerCorpName: target.name,
      foreignOwnerCountryId: target.countryId !== params.countryId ? target.countryId : null,
      confidenceBefore: consequenceResult.confidenceBefore,
      confidenceAfter: consequenceResult.confidenceAfter,
      legitimacyDelta: consequenceResult.legitimacyDelta,
      turn: params.consequence.turn,
    });
  } catch (err) {
    console.error("[nationalizationLedger] whole-corp ledger write failed:", err);
  }

  return {
    nationalCorporationId: nationalCorp._id,
    sectorsAbsorbed: domesticSectors.length,
    bondsAssumed: targetBonds.length,
    shareholderPayoutAnchor: payoutPoolAnchor,
  };
}
