import type { Db, ObjectId } from "mongodb";
import { assertSubsidiaryWithinCap } from "@/lib/mechanicalLaws/guards";
import { isPrivateEnterpriseBlocked } from "@/lib/economy/queries/privateEnterpriseGate";
import { ObjectId as Oid } from "mongodb";
import type { Character, Corporation, CorporateSector } from "@/lib/db/types";

import {
  CEO_INITIAL_SHARES,
  DEFAULT_SHARE_PRICE,
  operatingSectorIdentity,
  corporationTypeOfLane,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { getEraFounderShares } from "@/lib/constants/sectorSeedEra";
import { autoGrantedNodeIds } from "@/lib/constants/techTree";
import { STARTING_YEAR } from "@/lib/constants/turnTime";
import { resolveGameYear } from "@/lib/era/era";
import { getGameState } from "@/lib/gameState";
import {
  generateTickerSymbol,
  insertCorporationWithTickerRetry,
} from "@/lib/corporations/tickerSymbol";
import { openCeoTenure } from "@/lib/corporations/ceoHistory";
import { randomBrandColor } from "@/lib/corporations/brandColor";
import { getDefaultLegalStructureId } from "@/lib/corporations/legalStructure";
import {
  anchorToCorpLiquidCapital,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import {
  atomicallyDebitCorpLiquidCapital,
  refundCorpLiquidCapital,
} from "@/lib/financialTxLog/atomicCashGuard";
import { emitTx } from "@/lib/financialTxLog/emit";
import { creditTreasuryProceedsPaired } from "@/lib/nationalization/treasury";
import {
  isEligibleAsSubsidiaryParent,
  subsidiaryCeoBlockMessage,
  subsidiaryCeoBlockReason,
} from "../helpers";
import { collectSiblingSubsidiaryCeoUserIds, resolveParentCeoUserId } from "../parentContext";
import { pickOrCreateNppCeoForNewCorp } from "../nppCeoSelection";
import { spinOffCooldownTurnsRemaining, spinOffCostAnchor } from "../constants";
import { fail, type SubsidiaryCommandResult } from "../commandTypes";
import {
  releaseConstructionPropertyTransition,
  reserveSectorsForTransition,
} from "@/lib/corporations/securedConstructionProperty";
import {
  prepareConstructionBorrowerTransfers,
  settleConstructionBorrowerTransfers,
} from "@/lib/banking/constructionBorrowerTransfer";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

// PLANTS-GATED: a spin-off only re-points `corporationId` on the existing row, so
// capitalStock, buildQueue, CIP and plantsStartTurn ride along untouched. There
// is no plant state to fold and nothing for plants to erase.
export interface SpinOffInput {
  parent: Corporation;
  callerUserId: ObjectId;
  /** Operating lane carved out (the vehicles lane moves only vehicle plants). */
  sectorType: OperatingSectorType;
  name: string;
  tickerSymbol?: string;
  appointedCeoType: "character" | "npp";
  appointedCeoCharacterId?: ObjectId;
  forcedNppId?: string;
  turn: number;
  now: Date;
}

/**
 * Spin off one of a parent's sector types into a NEW, wholly parent-owned
 * PRIVATE corporation (no public float at creation — going public later uses the
 * existing IPO flow). The new corp is immediately a formalized subsidiary.
 */
export async function spinOff(
  db: Db,
  input: SpinOffInput
): Promise<SubsidiaryCommandResult<{ newCorporationId: string }>> {
  const {
    parent,
    callerUserId,
    sectorType,
    name,
    tickerSymbol,
    appointedCeoType,
    appointedCeoCharacterId,
    forcedNppId,
    turn,
    now,
  } = input;

  // Authorize: caller is parent CEO.
  if (parent.ceoVacant === true || !parent.userId || !parent.userId.equals(callerUserId)) {
    return fail("You must be the CEO of the parent corporation.", 403);
  }
  // Parent eligible (not national, not itself a subsidiary — no chaining).
  if (!isEligibleAsSubsidiaryParent(parent)) {
    return fail(
      "This corporation cannot spin off a subsidiary (national corporations and existing subsidiaries are excluded).",
      403
    );
  }
  // Cooldown.
  const cooldownRemaining = spinOffCooldownTurnsRemaining(parent.lastSpinOffTurn, turn);
  if (cooldownRemaining > 0) {
    return fail(`Spin-off is on cooldown for ${cooldownRemaining} more turn(s).`);
  }

  const nameTrimmed = name.trim();
  // A spin-off creates a brand-new PRIVATE corporation in the parent's country,
  // so it is a creation path and needs the same regime gate as founding and
  // privatization. Reachable today: the private corps still sitting inside
  // command economies awaiting remediation could each spin off more.
  if (await isPrivateEnterpriseBlocked(db, parent.countryId)) {
    return fail(
      "Private corporations cannot be founded in a command economy. The state controls all enterprise.",
      403
    );
  }

  if (!nameTrimmed) return fail("A corporation name is required.");

  // The new company is headquartered in the parent's country.
  const capRejection = await assertSubsidiaryWithinCap(db, parent, parent.countryId);
  if (capRejection) return fail(capRejection.error, capRejection.status);

  // Parent must have ≥1 sector of the requested type.
  const sectors = await db
    .collection<CorporateSector>("corporateSectors")
    .find({ corporationId: parent._id, ...operatingSectorIdentity(sectorType) })
    .toArray();
  if (sectors.length === 0) {
    return fail("The parent does not operate any sector of that type.");
  }

  // Resolve the CEO identity up front (before any writes).
  let ceoId: ObjectId;
  let ceoUserId: ObjectId; // system placeholder for NPP-run corps
  let ceoTypeResolved: "character" | "npp";
  const SYSTEM_USER = new Oid("000000000000000000000000");
  if (appointedCeoType === "character") {
    if (!appointedCeoCharacterId) return fail("A character is required to appoint a human CEO.");
    const character = await db
      .collection<Character>("characters")
      .findOne({ _id: appointedCeoCharacterId }, { projection: { userId: 1 } });
    if (!character || !character.userId) {
      return fail("The selected character cannot serve as CEO (no owning player).");
    }
    const parentCeoUserId = await resolveParentCeoUserId(db, parent);
    const siblingCeoUserIds = await collectSiblingSubsidiaryCeoUserIds(db, parent._id, new Oid());
    const block = subsidiaryCeoBlockReason({
      candidateUserId: character.userId,
      parentOwnerUserId: parent.userId,
      parentCeoUserId,
      siblingSubsidiaryCeoUserIds: siblingCeoUserIds,
    });
    if (block) return fail(subsidiaryCeoBlockMessage(block), 403);
    ceoId = appointedCeoCharacterId;
    ceoUserId = character.userId;
    ceoTypeResolved = "character";
  } else {
    ceoId = await pickOrCreateNppCeoForNewCorp(
      db,
      parent.countryId,
      parent.headquartersState,
      forcedNppId,
      sectorType
    );
    ceoUserId = SYSTEM_USER; // fully-NPP-run corp — system placeholder, NOT parent
    ceoTypeResolved = "npp";
  }

  // Cost: base spin-off cost + per-sector transfer fee (₳), converted to the
  // parent's local currency. Scales with the number of sectors being moved.
  const parentFx = await getCorpFxRate(db, parent);
  const costLocal = Math.round(
    anchorToCorpLiquidCapital(spinOffCostAnchor(sectors.length), parent, parentFx)
  );
  const newCorpId = new Oid();
  const currencyCode =
    parent.liquidCurrencyCode ??
    (COUNTRY_CURRENCY_MAP[parent.countryId] as CurrencyCode | undefined);
  const parentCurrency = resolveCorpLiquidCurrencyCode(parent);

  // A secured construction loan follows its site into the subsidiary, which
  // becomes the borrower and services it from its own cash.
  const preparedTransfers = await prepareConstructionBorrowerTransfers(db, {
    sectors,
    toId: newCorpId,
    toCurrency: currencyCode,
    operationKey: `spin-off:${newCorpId.toHexString()}`,
    turn,
  });
  if (!preparedTransfers.ok) return fail(preparedTransfers.error);
  const constructionTransfers = preparedTransfers.plan;
  const transitionKeys = await reserveSectorsForTransition(
    db,
    sectors,
    "subsidiary_spin_off",
    `spin-off:${parent._id.toHexString()}:${new Oid().toHexString()}`,
    false,
    constructionTransfers
  );
  if (!transitionKeys) {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    return fail("A sector changed or is in another ownership change. Try the spin-off again.");
  }
  const debit = await atomicallyDebitCorpLiquidCapital(db, parent._id, costLocal);
  if (!debit.ok) {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    await Promise.all(
      sectors.map((sector, index) =>
        releaseConstructionPropertyTransition(db, sector._id, transitionKeys[index])
      )
    );
    return fail(
      `Insufficient parent corporate funds. Spin-off costs ${costLocal.toLocaleString()} ${
        resolveCorpLiquidCurrencyCode(parent) ?? "USD"
      }.`
    );
  }

  const transferredSectorIds: ObjectId[] = [];
  try {
    const subsidiaryShares = getEraFounderShares(
      CEO_INITIAL_SHARES,
      await getGameStatePresetOrDefault(db)
    );
    // Baseline tech for the passed decade, matching a newly founded corp. Without it moved sectors lose tech margin, build discount and bonuses on transfer.
    const gameState = await getGameState(db);
    const baselineTechNodeIds = autoGrantedNodeIds(
      sectorType,
      resolveGameYear(gameState ?? {}) ?? STARTING_YEAR
    );
    // Create the wholly parent-owned private corp. Parent holds 100% of shares.
    const corpDoc: Omit<Corporation, "_id"> & { _id: ObjectId } = {
      _id: newCorpId,
      name: nameTrimmed,
      tickerSymbol: tickerSymbol?.trim() || (await generateTickerSymbol(db, nameTrimmed)),
      type: corporationTypeOfLane(sectorType),
      ...(operatingSectorIdentity(sectorType).industryModel
        ? { industryModel: operatingSectorIdentity(sectorType).industryModel }
        : {}),
      ...(operatingSectorIdentity(sectorType).mediaDiscriminator
        ? { mediaDiscriminator: operatingSectorIdentity(sectorType).mediaDiscriminator }
        : {}),
      ceoId,
      ceoType: ceoTypeResolved,
      ceoVacant: false,
      userId: ceoUserId,
      countryId: parent.countryId,
      headquartersState: parent.headquartersState,
      liquidCapital: 0,
      liquidCurrencyCode: currencyCode,
      marketingBudget: 0,
      marketingStrength: 0,
      logisticsBudget: 0,
      logisticsStrength: 0,
      rdBudget: 0,
      rdScore: 0,
      ceoSalary: 0,
      sequentialId: await getNextSequentialId(db, "corporation"),
      // Era share base: a fixed 10M shares at the flat DEFAULT_SHARE_PRICE
      // would open a 1953 subsidiary at a modern-sized market cap (~70x its
      // era). Deflating the base keeps the opening cap era-correct.
      totalShares: subsidiaryShares,
      sharePrice: DEFAULT_SHARE_PRICE,
      shareholders: [{ corporationId: parent._id, shares: subsidiaryShares }],
      publicFloat: 0,
      // Its own colour, not the parent's. A spin-off is a separate company and
      // its cap table should not look like the one it came out of.
      brandColor: randomBrandColor(),
      dividendRate: 0,
      suspended: false,
      hiddenFromExchange: false,
      isPrivate: true,
      legalStructure: getDefaultLegalStructureId(parent.countryId, { isPrivate: true }),
      isSpinOff: true,
      spunOffFromCorpId: parent._id,
      spunOffAtTurn: turn,
      subsidiaryFormalizedAtTurn: turn,
      foundedAtTurn: turn,
      ...(baselineTechNodeIds.length > 0 ? { unlockedTechNodeIds: baselineTechNodeIds } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await insertCorporationWithTickerRetry(db, corpDoc as Corporation);
    await openCeoTenure(db, newCorpId, { holderId: ceoId, ceoType: ceoTypeResolved, turn });

    // Reassign sector docs to the new corp: only corporationId changes, so
    // capitalStock, buildQueue, mothballed and plantsStartTurn ride along.
    // The A-anchored capex fields (CIP, each order's costPaidAnchor) are already
    // A by contract and must NOT go through the readCorpEconomicAnchor/
    // writeCorpEconomicLocal round-trip applied to revenue below. Re-denominating
    // them on a cross-currency spin-out would restate the money by the FX rate
    // and let the subsidiary cancel inherited orders for an inflated refund.
    const newFx = parentFx; // same country/currency as parent
    for (const [index, sector] of sectors.entries()) {
      const revenueAnchor = readCorpEconomicAnchor(sector.revenue, parentCurrency, parentFx);
      const growthAnchor = readCorpEconomicAnchor(
        sector.currentGrowthCost ?? 0,
        parentCurrency,
        parentFx
      );
      const newRevenueLocal = Math.round(
        writeCorpEconomicLocal(revenueAnchor, currencyCode, newFx)
      );
      const newGrowthLocal = Math.round(writeCorpEconomicLocal(growthAnchor, currencyCode, newFx));
      const moved = await db.collection<CorporateSector>("corporateSectors").updateOne(
        {
          _id: sector._id,
          corporationId: parent._id,
          "constructionPropertyTransition.key": transitionKeys[index],
          ...constructionTransfers.claimFilterFor(sector),
        },
        {
          $set: {
            corporationId: newCorpId,
            ...constructionTransfers.setFor(sector._id),
            revenue: newRevenueLocal,
            currentGrowthCost: newGrowthLocal,
            updatedAt: now,
          },
        }
      );
      if (moved.matchedCount !== 1)
        throw new Error("A sector changed during the subsidiary spin-off");
      transferredSectorIds.push(sector._id);
    }

    // Anchor the parent's spin-off cooldown.
    await corporationsCollection(db).updateOne(
      { _id: parent._id },
      { $set: { lastSpinOffTurn: turn, updatedAt: now } }
    );

    // The incorporation fee is government revenue, not destroyed money: it goes
    // to the parent's country treasury, and both legs are ledgered for
    // money-conservation checks.
    const feeCurrency = (parentCurrency ?? "USD") as CurrencyCode;
    const feeToTreasury = await creditTreasuryProceedsPaired(db, {
      countryId: parent.countryId,
      amountLocal: costLocal,
      now,
      flow: "incorporation_fee",
      key: `spin-off-fee:${newCorpId.toHexString()}`,
      site: "spinOff.incorporationFee",
    });
    await Promise.all([
      emitTx(db, {
        type: "corp_capital_seed",
        turn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: parent._id,
        subjectName: parent.name,
        amount: -costLocal,
        balanceAfter: debit.newBalance,
        currencyCode: feeCurrency,
        counterpartyType: "government",
        counterpartyName: `${parent.countryId} treasury`,
        meta: {
          kind: "spin_off",
          side: "incorporation_fee",
          sectorType,
          newCorporationId: newCorpId.toString(),
          transferredSectors: transferredSectorIds.length,
        },
      }),
      feeToTreasury > 0
        ? emitTx(db, {
            type: "gov_tax_revenue",
            turn,
            createdAt: now,
            subjectType: "government",
            countryId: parent.countryId,
            subjectName: `${parent.countryId} treasury`,
            amount: feeToTreasury,
            currencyCode: feeCurrency,
            counterpartyType: "corporation",
            counterpartyId: parent._id,
            counterpartyName: parent.name,
            meta: { kind: "spin_off", side: "incorporation_fee" },
          })
        : Promise.resolve(),
    ]);

    // A standing divestiture order (C3 merger remedy) is re-measured after the
    // spin-off. It does NOT discharge just because the business moved: the new
    // corp is wholly parent-owned, so the group's market share is unchanged.
    // This call is here so that the LATER sell-down settles the order promptly
    // via the same path, and so the parent sees an accurate state immediately.
    if (parent.pendingDivestiture) {
      try {
        const { settleDivestitureIfSatisfied } =
          await import("@/lib/corporations/mergerReview/divestiture");
        await settleDivestitureIfSatisfied(db, parent);
      } catch {
        // Best-effort: the turn sweep re-measures anyway.
      }
    }

    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    await Promise.all(
      sectors.map((sector, index) =>
        releaseConstructionPropertyTransition(db, sector._id, transitionKeys[index])
      )
    );

    return { ok: true, newCorporationId: newCorpId.toString() };
  } catch (err) {
    // Roll back: move any transferred sectors back, delete the new corp, refund.
    if (transferredSectorIds.length > 0) {
      // A financed site goes back with its claim naming the parent again, so
      // the settle below leaves its loan with the parent.
      const rollback = await db.collection<CorporateSector>("corporateSectors").bulkWrite(
        transferredSectorIds.map((sectorId) => {
          const index = sectors.findIndex((sector) => sector._id.equals(sectorId));
          return {
            updateOne: {
              filter: {
                _id: sectorId,
                "constructionPropertyTransition.key": transitionKeys[index],
              },
              update: {
                $set: {
                  corporationId: parent._id,
                  ...(constructionTransfers.hasTransfer(sectorId)
                    ? { "constructionFinancing.borrowerId": parent._id.toHexString() }
                    : {}),
                  updatedAt: new Date(),
                },
              },
            },
          };
        })
      );
      await settleConstructionBorrowerTransfers(db, constructionTransfers);
      if ((rollback.matchedCount ?? 0) !== transferredSectorIds.length) {
        throw new Error("The spin-off could not safely restore every reserved sector", {
          cause: err,
        });
      }
    }
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    await corporationsCollection(db).deleteOne({ _id: newCorpId });
    await refundCorpLiquidCapital(db, parent._id, costLocal);
    await Promise.all(
      sectors.map((sector, index) =>
        releaseConstructionPropertyTransition(db, sector._id, transitionKeys[index])
      )
    );
    throw err;
  }
}
