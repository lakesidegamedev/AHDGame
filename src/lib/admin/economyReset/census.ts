/**
 * Read-only census for the economy-only reset.
 *
 * Loads the live world under a turn fence, normalizes it into plain data and
 * builds the plan twice; the census refuses unless the fence and both plans
 * agree, so a world that moved while it was read never yields a digest. Never
 * writes to Mongo.
 */
import type { Db, Document, ObjectId } from "mongodb";
import { loadCampaignCurrencyRates } from "@/lib/campaigns/campaignCurrency";
import { getBankId } from "@/lib/centralBank/helpers";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { getCountryIdForCurrency, type CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { collectBalances } from "@/lib/ledger/balanceSnapshot";
import { SOVEREIGN_COUPON_CLAIMS_COLLECTION } from "@/lib/banking/fundedSovereignCoupons";
import { NON_ATOMIC_MONEY_FLOW_RECEIPTS_COLLECTION } from "@/lib/db/nonAtomicMoneyFlow";
import type { GameState } from "@/lib/db/types/gameState";
import {
  economyResetFullWipeCollections,
  type EconomyResetFullWipeCollection,
} from "./collections";
import { economyResetPlanDigest } from "./digest";
import { PRIVATE_HOLDER_COLLECTIONS } from "./rules/bonds";
import { buildEconomyResetPlan, type EconomyResetSource } from "./rules/plan";
import type { EconomyResetPlan } from "./types";

export const ECONOMY_RESET_PROCESSING_KIND = "economyReset";

/** Bank money moves kept by the partial wipe: sovereign coupon payout journals. */
export const KEPT_BANK_MONEY_MOVE_FILTER = { _id: { $regex: "^sovereign-coupon:" } };
export const WIPED_BANK_MONEY_MOVE_FILTER = { _id: { $not: { $regex: "^sovereign-coupon:" } } };
export const VOIDED_INCOME_TAX_FILTER = { status: { $in: ["plan", "unpaid"] } };
export const CORPORATE_BOND_FILTER = { issuerType: { $ne: "sovereign" } };

const FENCE_PROJECTION = {
  worldEpochId: 1,
  currentTurn: 1,
  isProcessing: 1,
  processingKind: 1,
  processingTargetTurn: 1,
  processingAbandonedAt: 1,
  preset: 1,
  economyReset: 1,
} as const;

type Fence = Pick<
  GameState,
  | "worldEpochId"
  | "currentTurn"
  | "isProcessing"
  | "processingKind"
  | "processingTargetTurn"
  | "processingAbandonedAt"
  | "preset"
  | "economyReset"
>;

export interface EconomyResetCensusOptions {
  expectedWorldEpoch: string;
  approvalReference: string;
  /**
   * "idle": the world must be at an idle turn fence (the census).
   * "own": the reset holds the processing lock itself (the apply rebuild).
   */
  lock: "idle" | "own";
}

function fenceOk(fence: Fence | null, options: EconomyResetCensusOptions): fence is Fence {
  if (!fence || fence.worldEpochId !== options.expectedWorldEpoch) return false;
  if (typeof fence.currentTurn !== "number") return false;
  if (fence.processingTargetTurn != null || fence.processingAbandonedAt != null) return false;
  if (options.lock === "own")
    return fence.isProcessing === true && fence.processingKind === ECONOMY_RESET_PROCESSING_KIND;
  return fence.isProcessing !== true && fence.processingKind == null && !fence.economyReset;
}

function hex(id: unknown): string {
  return typeof id === "string" ? id : (id as ObjectId).toHexString();
}

function amounts(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, amount] of Object.entries(value as Record<string, unknown>))
    if (typeof amount === "number" && Number.isFinite(amount)) out[key] = amount;
  return out;
}

async function loadSource(
  db: Db,
  fence: Fence,
  options: EconomyResetCensusOptions
): Promise<EconomyResetSource> {
  const config = await db.collection<Document>("gameConfig").findOne(
    { _id: "default" as never },
    {
      projection: {
        seedPreset: 1,
        preset: 1,
        commandEconomyEnabled: 1,
        ledgerShadow: 1,
        treasuryCashLedgerEnabled: 1,
      },
    }
  );
  // gameState.preset is the world's era (written by every reset); the
  // gameConfig fields are older fallbacks kept for legacy worlds.
  const preset = String(
    fence.preset ?? config?.seedPreset ?? config?.preset ?? DEFAULT_SEED_PRESET
  );
  const treasuryCashLedgerEnabled = config?.treasuryCashLedgerEnabled === true;
  const wipeCollections = economyResetFullWipeCollections();

  const [
    wipeCounts,
    rates,
    campaignRates,
    characters,
    imperials,
    npps,
    bonds,
    couponClaims,
    budgets,
    centralBanks,
    wallets,
    defenceContracts,
    pensionSchemes,
    openIncomeTax,
    collectedIncomeTax,
    openReceipts,
    partialMoves,
    bankLoanCount,
    wipedMoves,
    openingBalances,
    epoch,
  ] = await Promise.all([
    Promise.all(
      wipeCollections.map((name: EconomyResetFullWipeCollection) =>
        db.collection(name).countDocuments({})
      )
    ),
    db
      .collection<{ currencyCode: string; rate: number }>("exchangeRates")
      .find({}, { projection: { currencyCode: 1, rate: 1 } })
      .toArray(),
    loadCampaignCurrencyRates(db),
    db
      .collection<Document>("characters")
      .find(
        {},
        {
          projection: {
            countryId: 1,
            userId: 1,
            initialIncomeTier: 1,
            "demographics.wealth": 1,
            "currencyBalances.savings": 1,
            "currencyBalances.savingsHolder": 1,
            lineOfCredit: 1,
            pendingLocSettlement: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<Document>("imperialCharacters")
      .find({}, { projection: { _id: 1 } })
      .toArray(),
    db
      .collection<Document>("npps")
      .find(
        {
          $or: [
            { currencyBalances: { $exists: true } },
            { nppInvestmentCashAnchor: { $exists: true } },
            { lastIndexFundInvestmentTurn: { $exists: true } },
            { lineOfCredit: { $exists: true } },
          ],
        },
        { projection: { "currencyBalances.savings": 1, lineOfCredit: 1 } }
      )
      .toArray(),
    db
      .collection<Document>("bonds")
      .find(
        {},
        {
          projection: {
            issuerType: 1,
            countryId: 1,
            currencyCode: 1,
            totalIssued: 1,
            publicFloat: 1,
            holders: 1,
            matured: 1,
            "sovereignMaturityClaim.paid": 1,
            "sovereignMaturityClaim.holderLegs.collection": 1,
          },
        }
      )
      .toArray(),
    db
      .collection<Document>(SOVEREIGN_COUPON_CLAIMS_COLLECTION)
      .find({ settledTurn: { $exists: false } })
      .toArray(),
    db
      .collection<Document>("federalBudget")
      .find(
        {},
        {
          projection: {
            countryId: 1,
            currencyCode: 1,
            "defenseAppropriation.encumbered": 1,
            sovereignCouponClaims: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<Document>("centralBanks")
      .find({}, { projection: { reserveBalance: 1, pendingLocReserveCredit: 1 } })
      .toArray(),
    db
      .collection<Document>("producerEconomyAccounts")
      .find(
        { kind: "publicBuyer", worldEpoch: fence.worldEpochId },
        { projection: { countryId: 1, currency: 1, cash: 1 } }
      )
      .toArray(),
    db
      .collection<Document>("defenceContracts")
      .find(
        { status: { $in: ["pending", "active"] } },
        { projection: { countryId: 1, encumberedAmount: 1 } }
      )
      .toArray(),
    db
      .collection<Document>("pensionSchemes")
      .find({}, { projection: { assetsAnchor: 1, investedValueAnchor: 1 } })
      .toArray(),
    db.collection("playerIncomeTaxAssessments").countDocuments(VOIDED_INCOME_TAX_FILTER),
    db.collection("playerIncomeTaxAssessments").countDocuments({ status: "collected" }),
    db
      .collection(NON_ATOMIC_MONEY_FLOW_RECEIPTS_COLLECTION)
      .countDocuments({ status: "in_progress" }),
    db.collection("bankMoneyMoves").countDocuments({ status: "partial" }),
    db.collection("bankLoans").countDocuments({}),
    db
      .collection<{ _id: string }>("bankMoneyMoves")
      .countDocuments(WIPED_BANK_MONEY_MOVE_FILTER as never),
    collectBalances(db, { treasuryCashLedgerEnabled }),
    Promise.resolve(fence.worldEpochId!),
  ]);

  const anchorRates: Record<string, number> = {};
  for (const row of rates)
    if (typeof row.rate === "number" && Number.isFinite(row.rate) && row.rate > 0)
      anchorRates[row.currencyCode] = row.rate;

  const userIds = [...new Set(characters.map((c) => c.userId).filter(Boolean))];
  const referredUsers = new Set(
    (
      await db
        .collection<Document>("users")
        .find(
          { _id: { $in: userIds }, referredBy: { $exists: true, $ne: null } },
          { projection: { _id: 1 } }
        )
        .toArray()
    ).map((user) => hex(user._id))
  );

  const sovereign = bonds.filter((bond) => bond.issuerType === "sovereign");
  const corporate = bonds.filter((bond) => bond.issuerType !== "sovereign");
  const corporateIds = corporate.map((bond) => bond._id);
  const corporateBondHistory =
    corporateIds.length === 0
      ? 0
      : await db.collection("bondHistory").countDocuments({ bondId: { $in: corporateIds } });

  const nationalBudgets = budgets.filter(
    (budget) =>
      typeof budget.countryId === "string" &&
      String(budget._id) === getNationalBudgetId(budget.countryId as CountryId)
  );

  const currencies = new Set<string>();
  for (const row of [...characters, ...npps]) {
    for (const key of Object.keys(amounts(row.currencyBalances?.savings))) currencies.add(key);
    for (const key of Object.keys(amounts(row.lineOfCredit?.balances))) currencies.add(key);
    for (const key of Object.keys(amounts(row.lineOfCredit?.arrears))) currencies.add(key);
  }
  const bankIdByCurrency: Record<string, string> = {};
  for (const currency of [...currencies].sort())
    bankIdByCurrency[currency] = getBankId(getCountryIdForCurrency(currency as CurrencyCode));

  return {
    worldEpochId: epoch,
    currentTurn: fence.currentTurn!,
    preset,
    approvalReference: options.approvalReference,
    config: {
      commandEconomyEnabled: config?.commandEconomyEnabled === true,
      ledgerShadow: config?.ledgerShadow === true,
      treasuryCashLedgerEnabled,
    },
    wipeCounts: Object.fromEntries(wipeCollections.map((name, i) => [name, wipeCounts[i]])),
    partialWipeCounts: {
      bonds: corporate.length,
      bondHistory: corporateBondHistory,
      bankMoneyMoves: wipedMoves,
      playerIncomeTaxAssessments: openIncomeTax,
    },
    campaignRates,
    anchorRates,
    characters: characters.map((character) => ({
      id: hex(character._id),
      countryId: String(character.countryId ?? "US"),
      wealth: character.demographics?.wealth ?? character.initialIncomeTier ?? null,
      referred: character.userId ? referredUsers.has(hex(character.userId)) : false,
      savings: amounts(character.currencyBalances?.savings),
      savingsHolder: (character.currencyBalances?.savingsHolder ?? {}) as Record<string, string>,
      lineOfCredit: character.lineOfCredit
        ? {
            balances: amounts(character.lineOfCredit.balances),
            arrears: amounts(character.lineOfCredit.arrears),
          }
        : null,
      pendingLocSettlement: character.pendingLocSettlement != null,
    })),
    imperialCharacterIds: imperials.map((row) => hex(row._id)),
    npps: npps.map((npp) => ({
      id: hex(npp._id),
      hasMoney: true,
      savings: amounts(npp.currencyBalances?.savings),
      lineOfCredit: npp.lineOfCredit
        ? {
            balances: amounts(npp.lineOfCredit.balances),
            arrears: amounts(npp.lineOfCredit.arrears),
          }
        : null,
    })),
    sovereignBonds: sovereign
      .filter((bond) => Array.isArray(bond.holders) && bond.holders.length > 0)
      .map((bond) => {
        const claim = bond.sovereignMaturityClaim;
        const legs = claim && claim.paid !== true ? (claim.holderLegs ?? []) : [];
        return {
          id: hex(bond._id),
          countryId: String(bond.countryId ?? ""),
          currency: String(bond.currencyCode ?? ""),
          totalIssued: Number(bond.totalIssued ?? 0),
          publicFloat: Number(bond.publicFloat ?? 0),
          holders: (bond.holders as Document[]).map((holder) => ({
            units: Number(holder.units ?? 0),
            ...(holder.bankTreasuryTradeId
              ? { bankTreasuryTradeId: String(holder.bankTreasuryTradeId) }
              : {}),
            ...(holder.saleIntentId ? { saleIntentId: hex(holder.saleIntentId) } : {}),
          })),
          privateMaturityLegs: (legs as { collection?: string }[]).filter((leg) =>
            PRIVATE_HOLDER_COLLECTIONS.includes(String(leg.collection))
          ).length,
        };
      }),
    corporateBonds: corporate.map((bond) => ({
      id: hex(bond._id),
      currency: String(bond.currencyCode ?? ""),
      totalIssued: Number(bond.totalIssued ?? 0),
    })),
    couponClaims: couponClaims.map((row) => ({
      id: String(row._id),
      pendingProjection: row.pendingSettlementProjection != null,
      currency: String(row.claim?.currencyCode ?? ""),
      amountLocal: Number(row.claim?.amountLocal ?? 0),
      holders: ((row.claim?.holders ?? []) as Document[]).map((holder) => ({
        kind: String(holder.kind),
        amountLocal: Number(holder.amountLocal ?? 0),
      })),
    })),
    legacyCouponClaims: budgets
      .filter(
        (budget) =>
          Array.isArray(budget.sovereignCouponClaims) && budget.sovereignCouponClaims.length > 0
      )
      .map((budget) => ({
        budgetId: String(budget._id),
        claims: (budget.sovereignCouponClaims as Document[]).map((claim) => ({
          id: String(claim.id),
          amountLocal: Number(claim.amountLocal ?? 0),
          holders: ((claim.holders ?? []) as Document[]).map((holder) => ({
            kind: String(holder.kind),
            amountLocal: Number(holder.amountLocal ?? 0),
          })),
        })),
      })),
    centralBanks: centralBanks.map((bank) => ({
      bankId: String(bank._id),
      reserveBalance: typeof bank.reserveBalance === "number" ? bank.reserveBalance : 0,
      pendingLocReserveCredit: bank.pendingLocReserveCredit != null,
    })),
    bankIdByCurrency,
    publicBuyerWallets: wallets.map((wallet) => ({
      walletId: String(wallet._id),
      countryId: String(wallet.countryId),
      currency: String(wallet.currency),
      cash: Number(wallet.cash ?? 0),
    })),
    budgets: nationalBudgets.map((budget) => ({
      budgetId: String(budget._id),
      countryId: String(budget.countryId),
      currencyCode: String(
        resolveCountryCurrencyCode({
          countryId: budget.countryId,
          currencyCode: budget.currencyCode,
        }) ?? ""
      ),
      storedCurrencyCode:
        typeof budget.currencyCode === "string" && budget.currencyCode.trim() !== ""
          ? budget.currencyCode
          : null,
      defenseEncumbered: Number(budget.defenseAppropriation?.encumbered ?? 0),
    })),
    openDefenceContracts: defenceContracts.map((contract) => ({
      countryId: String(contract.countryId),
      encumberedAmount: Number(contract.encumberedAmount ?? 0),
    })),
    pensionSchemes: pensionSchemes.map((scheme) => ({
      id: hex(scheme._id),
      assetsAnchor: Number(scheme.assetsAnchor ?? 0),
      ...(typeof scheme.investedValueAnchor === "number"
        ? { investedValueAnchor: scheme.investedValueAnchor }
        : {}),
    })),
    incomeTax: { open: openIncomeTax, collected: collectedIncomeTax },
    openMoneyFlowReceipts: openReceipts,
    partialBankMoneyMoves: partialMoves,
    bankLoanCount,
    openingBalances,
  };
}

export interface EconomyResetCensus {
  plan: EconomyResetPlan;
  planDigest: string;
}

/**
 * Build the plan under a read fence. Throws when the world is not at the
 * expected fence or changed while it was read.
 */
export async function captureEconomyResetPlan(
  db: Db,
  options: EconomyResetCensusOptions
): Promise<EconomyResetCensus> {
  const readFence = () =>
    db
      .collection<GameState>("gameState")
      .findOne({ _id: "current" }, { projection: FENCE_PROJECTION }) as Promise<Fence | null>;
  const before = await readFence();
  if (!fenceOk(before, options))
    throw new Error("The expected world is not at an idle turn fence for the economy reset");
  const first = buildEconomyResetPlan(await loadSource(db, before, options));
  const second = buildEconomyResetPlan(await loadSource(db, before, options));
  const after = await readFence();
  const firstDigest = economyResetPlanDigest(first);
  if (
    !fenceOk(after, options) ||
    after.currentTurn !== before.currentTurn ||
    firstDigest !== economyResetPlanDigest(second)
  )
    throw new Error("The live world changed during the economy reset census");
  return { plan: first, planDigest: firstDigest };
}
