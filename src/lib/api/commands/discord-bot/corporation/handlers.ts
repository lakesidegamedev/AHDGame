import { corpIncomeBasis } from "@/lib/corporations/rules/incomeBasis";
import { loadWorkforceSkillByState } from "@/lib/politicalLegislation/workforceSkillLoader";
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBotToken } from "@/lib/api/requireBotToken";
import { checkRateLimit, rateLimitResponse, BOT_READ_LIMITS } from "@/lib/api/rateLimit";
import type { CorporateSector, State } from "@/lib/db/types";
import { bulkFetchCharacterNames } from "@/lib/db/characterLookup";
import { toAbsoluteUploadUrl } from "@/lib/discord";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  calculateWorkers,
  TURNS_PER_DAY,
} from "@/lib/constants/corporations";
import { calculateCorpStrengthProjection } from "@/lib/corporations/strengthProjection";
import { loadStrengthUpkeepStage } from "@/lib/corporations/strengthUpkeep";
import { loadCorporationDetailView } from "@/lib/corporations/queries/corporationDetail";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { BOND_MATURITY_LABELS } from "@/lib/db/types/bond";
import type { BondMaturityTurns } from "@/lib/db/types/bond";
import { calculateCreditScore, getBondCouponRate } from "@/lib/constants/bonds";
import { corporateBondMaturityLiquidity } from "@/lib/bonds/corporateCredit";
import { isBondDefaultCreditPenaltyActive } from "@/lib/bonds/corporateBondDefault";
import { getCountryConfig } from "@/lib/constants/countries";
import { getGameState } from "@/lib/gameState";
import { getPublicShareQuote, getRoundedPublicMarketCap } from "@/lib/corporations/marketQuote";
import { sectorEconomicRevenue } from "@/lib/corporations/sectorRevenueBasis";
import { roundMarketingStrength } from "@/lib/utils/formatters";
import {
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  fxRateForSectorHostFromMap,
  loadValuationFxRates,
  resolveCorpLiquidCurrencyCode,
  resolveSectorHostCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { getBankId } from "@/lib/centralBank/helpers";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://ahousedividedgame.com";
const LIST_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=60, no-transform",
};
const DETAIL_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, no-transform",
};

// ── List builder ────────────────────────────────────────────────────────────
async function buildCorpList(): Promise<{
  corporations: { id: string; name: string }[];
}> {
  const db = await getDb();
  const corps = await corporationsCollection(db)
    .find({})
    .project<{ _id: ObjectId; name: string }>({ _id: 1, name: 1 })
    .sort({ name: 1 })
    .toArray();

  return {
    corporations: corps.map((c) => ({ id: c._id.toString(), name: c.name })),
  };
}

const getCachedCorpList = unstable_cache(buildCorpList, ["discord-bot:corp-list"], {
  revalidate: 60,
  tags: ["discord-bot:corp-list"],
});

// ── Detail builder ──────────────────────────────────────────────────────────
type CorpDetailPayload =
  | { found: false }
  | {
      found: true;
      corporation: Record<string, unknown>;
      ceo: { name: string; profileUrl: string | null } | null;
      shareholders: { name: string; shares: number; percentage: number }[];
      financialBasis: "settled" | "estimate";
      financialTurn?: number;
      financials: Record<string, number>;
      balanceSheet: Record<string, number>;
      creditRating: { rating: string; compositeScore: number; effectiveCouponRate: number };
      bonds: Record<string, unknown>[];
      sectors: Record<string, unknown>[];
    };

async function buildCorpDetail(nameLower: string): Promise<CorpDetailPayload> {
  const db = await getDb();

  // Find corporation by exact name (case-insensitive). The cache key is the
  // lowercased name, so two callers asking for the same corp share output.
  const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const corporation = await corporationsCollection(db).findOne({
    name: { $regex: new RegExp(`^${escapedName}$`, "i") },
  });

  if (!corporation) {
    return { found: false };
  }

  // Fetch CEO, sectors, bonds, game state in parallel
  const [ceo, sectors, outstandingBonds, gameState] = await Promise.all([
    charactersCollection(db).findOne(
      { _id: corporation.ceoId },
      { projection: { name: 1, sequentialId: 1 } }
    ),
    corporateSectorsCollection(db).find({ corporationId: corporation._id }).toArray(),
    bondsCollection(db)
      .find({ corporationId: corporation._id, matured: false })
      .sort({ createdAt: -1 })
      .toArray(),
    getGameState(),
  ]);

  const currentTurn = gameState?.currentTurn ?? 1;

  // Source the income statement from the SAME shared builder the website uses,
  // so the bot embed matches the corp page by construction. The builder returns
  // daily-unit, corp-LOCAL figures (the same units the fields below use) and
  // folds in the engine's realized income when a corporationHistory row exists.
  // Use the shared balance sheet as well so all debt and portfolio assets agree.
  const detail = await loadCorporationDetailView({
    db,
    corporation,
    currentTurn,
    viewerUserId: null,
  });
  const f = detail.financials;
  // Headline net income mirrors the website: prefer engine-realized income when
  // present, else the projected income (FinancialsTab.tsx / CorporationMasthead.tsx).
  const incomeBasis = corpIncomeBasis(f);
  const netIncome = incomeBasis.netIncome;

  // Resolve state names and unemployment for financial calculations
  const allStateIds = [corporation.headquartersState, ...sectors.map((s) => s.stateId)];
  const uniqueStateIds = [...new Set(allStateIds)];

  const states =
    uniqueStateIds.length > 0
      ? await statesCollection(db)
          .find({ _id: { $in: uniqueStateIds } })
          .project<Pick<State, "_id" | "name">>({ _id: 1, name: 1 })
          .toArray()
      : [];
  const stateNameMap = new Map(states.map((state) => [state._id, state.name]));
  // SP4: merged legacy + political-board read so playable regions' worker
  // counts keep matching the turn's adapter-fed values.
  const workforceSkillMap = await loadWorkforceSkillByState(db, uniqueStateIds);

  const ceoSalary = corporation.ceoSalary ?? 0;

  // Bond debt/interest — still needed for the balance-sheet and credit-rating
  // sections (the income-statement interest line now comes from `f`). Per-bond
  // anchor-normalize then convert to corp LOCAL (A30 mirror). Same-currency
  // issuers collapse to the raw sum; cross-currency bonds are handled correctly.
  // Valuation map, not the settlement map: this value is DISPLAYED and RANKED.
  // The settlement map leaves the six bloc currencies (PLZ/CSK/HUF/YUD/BGL/ROL,
  // 102 corps) missing on purpose, which converted them at 1.0. See
  // corporationCapital.ts.
  const fxByCurrency = await loadValuationFxRates(db);
  const corpCurrency = resolveCorpLiquidCurrencyCode(corporation);
  const corpFxRate = fxRateForCorpFromMap(corporation, fxByCurrency);

  // Sector economic fields are stored in each sector's HOST-market currency,
  // not the owning corp's. Normalize host -> ₳ for currency-invariant math
  // (e.g. workers) and host -> corp currency for anything shown as money.
  const sectorAmountAnchor = (amount: number, sector: CorporateSector) =>
    readCorpEconomicAnchor(
      amount,
      resolveSectorHostCurrencyCode(sector, corporation),
      fxRateForSectorHostFromMap(sector, corporation, fxByCurrency)
    );

  // Sector display rows. The income statement is sourced from `f` (shared
  // builder) above, so the hand-rolled per-sector revenue/maintenance
  // accumulation that used to live here is gone; only display fields remain.
  // Prefer realized revenue over nameplate (sectorEconomicRevenue, #3001/#3002,
  // same basis the balance-sheet loop below and the website already use).
  const sectorDetails = sectors.map((sector) => {
    const economicRevenue = sectorEconomicRevenue(sector);
    const revenueAnchor = sectorAmountAnchor(economicRevenue, sector);
    return {
      stateId: sector.stateId,
      stateName: stateNameMap.get(sector.stateId) ?? sector.stateId,
      revenue: Math.round(writeCorpEconomicLocal(revenueAnchor, corpCurrency, corpFxRate)),
      currentGrowthRate: sector.currentGrowthRate ?? sector.growthRate ?? 0,
      workers: calculateWorkers(revenueAnchor, workforceSkillMap.get(sector.stateId) ?? null),
    };
  });
  const GAME_DAYS_PER_YEAR = TURNS_PER_YEAR / TURNS_PER_DAY;
  const totalDebt = detail.balanceSheet.liabilities.totalDebt;
  const annualInterest = (f.bondInterestCost + f.bankLoanInterestCost) * GAME_DAYS_PER_YEAR;

  // Income statement — sourced entirely from the shared builder (`f`) so the
  // bot matches the website. `income` is the realized-or-projected net income
  // and flows to dividends, retained earnings and the credit-rating input below.
  const logisticsBudget = corporation.logisticsBudget ?? 0;
  const operatingCosts = f.operatingCosts;
  const operatingIncome = f.operatingIncome;
  const totalCosts = f.totalCosts;
  const income = netIncome;

  // Same projection as the website: anchor-converted budget, net of decay.
  const { marketingStrengthGrowth } = calculateCorpStrengthProjection(
    {
      marketingBudget: corporation.marketingBudget,
      marketingStrength: corporation.marketingStrength ?? 0,
      liquidCurrencyCode: corpCurrency,
      strengthUpkeepStage: await loadStrengthUpkeepStage(db),
    },
    corpFxRate
  );

  const totalShares = corporation.totalShares ?? 10_000_000;
  const marketCapitalization = getRoundedPublicMarketCap(corporation, totalShares);
  const listedSharePrice = Math.round(getPublicShareQuote(corporation) * 100) / 100;

  // Shareholders
  const shareholderIds = (corporation.shareholders ?? [])
    .map((sh) => sh.characterId)
    .filter((id): id is ObjectId => id !== undefined);
  const shareholderNameMap = await bulkFetchCharacterNames(db, shareholderIds);

  const shareholders = (corporation.shareholders ?? [])
    .filter((sh): sh is typeof sh & { characterId: ObjectId } => sh.characterId !== undefined)
    .map((sh) => ({
      name: shareholderNameMap.get(sh.characterId.toString())?.name ?? "Unknown",
      shares: sh.shares,
      percentage: Math.round((sh.shares / totalShares) * 10000) / 100,
    }))
    .sort((a, b) => b.shares - a.shares);

  const publicFloat = corporation.publicFloat ?? 0;
  const publicFloatPct = Math.round((publicFloat / totalShares) * 10000) / 100;

  const dividendRate = f.effectiveDividendRate;
  const dailyDividendPayout = Math.round(incomeBasis.dividendPaid);

  const totalSectorNPV = detail.balanceSheet.assets.totalSectorNPV;
  const totalAssets = detail.balanceSheet.assets.totalAssets;
  const bookValue = detail.balanceSheet.equity.bookValue;

  // Credit rating
  const annualIncome = income * GAME_DAYS_PER_YEAR;
  const totalEquity = totalAssets;
  const creditRating = calculateCreditScore(
    corporation.liquidCapital,
    totalDebt,
    annualIncome,
    annualInterest,
    totalEquity,
    {
      bondDefaultCreditPenaltyActive: isBondDefaultCreditPenaltyActive(corporation, currentTurn),
      nearTermLiquidityScore:
        corporateBondMaturityLiquidity({
          bonds: outstandingBonds,
          liquidCapitalAnchor: corpCapitalToAnchor(
            corporation.liquidCapital,
            corpCurrency,
            corpFxRate
          ),
          incomePerTurn: corpCapitalToAnchor(
            (income * GAME_DAYS_PER_YEAR) / TURNS_PER_YEAR,
            corpCurrency,
            corpFxRate
          ),
          annualCouponObligations: corpCapitalToAnchor(annualInterest, corpCurrency, corpFxRate),
          currentTurn,
          fxByCurrency,
        }).liquidityScore ?? undefined,
      persistedCompositeScore: corporation.creditCompositeSnapshot ?? undefined,
    }
  );

  // Prime rate for coupon
  const countryId = corporation.countryId;
  // getBankId: shared-bank members (IE → ECB) have no doc under their own id.
  const centralBank = await centralBanksCollection(db).findOne({ _id: getBankId(countryId) });
  const primeRate =
    centralBank?.primeRate ?? getCountryConfig(countryId).centralBank.defaultPrimeRate;
  const effectiveCouponRate = getBondCouponRate(primeRate, creditRating.rating);

  // Bonds summary
  const bondsSummary = outstandingBonds.map((b) => ({
    id: b._id.toString(),
    couponRate: b.couponRate,
    maturityLabel:
      BOND_MATURITY_LABELS[b.maturityTurns as BondMaturityTurns] ?? `${b.maturityTurns} turns`,
    totalIssued: b.totalIssued,
    marketPrice: b.marketPrice,
    turnsRemaining: Math.max(0, b.maturityTurn - currentTurn),
    defaulted: b.defaulted,
  }));

  const corpUrl = corporation.sequentialId
    ? `${BASE_URL}/corporation/${corporation.sequentialId}`
    : `${BASE_URL}/corporation/${corporation._id}`;

  const ceoUrl = ceo ? `${BASE_URL}/character/${ceo.sequentialId ?? ceo._id}` : null;

  return {
    found: true,
    corporation: {
      id: corporation._id.toString(),
      sequentialId: corporation.sequentialId,
      name: corporation.name,
      description: corporation.description ?? null,
      type: corporation.type,
      typeLabel: OPERATING_SECTOR_TYPE_LABELS[corporation.type],
      brandColor: corporation.brandColor ?? null,
      // Absolutise relative upload paths so Discord embeds can fetch them.
      logoUrl: toAbsoluteUploadUrl(corporation.logoUrl, BASE_URL),
      headquartersState: corporation.headquartersState,
      headquartersStateName:
        stateNameMap.get(corporation.headquartersState) ?? corporation.headquartersState,
      liquidCapital: Math.round(corporation.liquidCapital),
      sharePrice: listedSharePrice,
      totalShares,
      publicFloat,
      publicFloatPct,
      marketCapitalization: Math.round(marketCapitalization),
      marketingBudget: corporation.marketingBudget,
      marketingStrength: roundMarketingStrength(corporation.marketingStrength),
      marketingStrengthGrowth: Math.round(marketingStrengthGrowth * 1000) / 1000,
      ceoSalary,
      dividendRate,
      corpUrl,
      countryId: corporation.countryId,
      // All money fields above (liquidCapital, sharePrice, marketCapitalization,
      // marketingBudget, ceoSalary, financials.*, balanceSheet.*) are denominated
      // in this currency. Bot formatters should pair the number with this code.
      liquidCurrencyCode: corporation.liquidCurrencyCode ?? null,
    },
    ceo: ceo && !corporation.ceoVacant ? { name: ceo.name, profileUrl: ceoUrl } : null,
    shareholders,
    financialBasis: incomeBasis.isRealized ? "settled" : "estimate",
    ...(incomeBasis.isRealized && f.realizedIncomeTurn != null
      ? { financialTurn: f.realizedIncomeTurn }
      : {}),
    financials: {
      totalRevenue: Math.round(f.totalRevenue),
      maintenanceCosts: Math.round(f.maintenanceCosts),
      growthCosts: Math.round(f.growthCosts),
      marketingCosts: f.marketingCosts,
      logisticsCosts: Math.round(logisticsBudget),
      ceoSalaryCost: ceoSalary,
      operatingCosts: Math.round(operatingCosts),
      operatingIncome: Math.round(operatingIncome),
      bondInterestCost: Math.round(f.bondInterestCost),
      totalCosts: Math.round(totalCosts),
      income: Math.round(income),
      dailyDividendPayout,
      retainedEarnings: Math.round(incomeBasis.retained),
    },
    balanceSheet: {
      totalAssets,
      cashOnHand: Math.round(corporation.liquidCapital),
      sectorNPV: totalSectorNPV,
      totalDebt: Math.round(totalDebt),
      bookValue: Math.round(bookValue),
      totalEquity: Math.round(detail.balanceSheet.equity.totalEquity),
      marketCapitalization: Math.round(marketCapitalization),
    },
    creditRating: {
      rating: creditRating.rating,
      compositeScore: creditRating.compositeScore,
      effectiveCouponRate,
    },
    bonds: bondsSummary,
    sectors: sectorDetails,
  };
}

const getCachedCorpDetail = unstable_cache(buildCorpDetail, ["discord-bot:corp-detail"], {
  revalidate: 30,
  tags: ["discord-bot:corp-detail"],
});

// GET /api/discord-bot/corporation — Returns full corporation detail by name, or a list of all corporation names when ?list=true.
// Auth: requireBotToken
// Errors: 400, 401, 429
export async function GET(request: Request) {
  try {
    if (!requireBotToken(request)) {
      return errorResponse(401, "Unauthorized");
    }

    const rateLimit = checkRateLimit(
      "discord-bot:corporation",
      BOT_READ_LIMITS.maxRequests,
      BOT_READ_LIMITS.windowMs
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const url = new URL(request.url);
    const listMode = url.searchParams.get("list") === "true";
    const name = url.searchParams.get("name");

    if (listMode) {
      const data = await getCachedCorpList();
      return NextResponse.json(data, { headers: LIST_CACHE_HEADERS });
    }

    if (!name) {
      return errorResponse(400, "Must provide name or list=true");
    }

    const detail = await getCachedCorpDetail(name.toLowerCase());
    return NextResponse.json(detail, { headers: DETAIL_CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
