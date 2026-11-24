import { buildElectricityNetwork } from "@/lib/electricityNetwork/rules/network";
/** Funded-market demand construction shared by the producer shadow and the live funded market. */
import {
  markPublicFairShare,
  publicFairShareOn,
} from "@/lib/market/producerMarket/publicFairShareRules";
import {
  markHomeCountryFirst,
  publicHomeFirstOn,
} from "@/lib/market/producerMarket/publicHomeFirstRules";
import { resolveSectorHostCurrencyCode } from "@/lib/currency/corporationCapital";
import type { CorporateSector } from "@/lib/db/types";
import { emptyProducerSectorOpening } from "@/lib/market/producerMarket/openingState";
import type { Db } from "mongodb";
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { eraScaledBasePrices } from "@/lib/constants/commodities";
import { TURNS_PER_DAY, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { householdDemandSpecs } from "@/lib/market/producerMarket/householdDemandRules";
import { incomeIndexByState } from "@/lib/market/rules/demandCurve";
import { currencyForCountry } from "@/lib/currency/sectorFxSpread";
import { HOUSEHOLD_OPENING_TURNS } from "@/lib/market/producerMarket/householdOpeningRules";
import { heldShares, incomeFloorShares } from "@/lib/market/producerMarket/householdSourceRules";
import { resolveSupplyPolicies } from "@/lib/market/internalSupply/rules";
import {
  householdTransferFunding,
  publicBuyerFunding,
} from "@/lib/market/producerMarket/publicBuyerRules";
import {
  carryLineKey,
  publicOrderId,
  withCarriedLines,
  type LineCarry,
} from "@/lib/market/producerMarket/publicCarryRules";
import { releaseCarriedLines } from "@/lib/market/rules/publicCarryRelease";
import { flooredPlantShare } from "@/lib/market/producerMarket/demandFloorRules";
import { investmentBuyerFunding } from "@/lib/market/producerMarket/capitalSpendRules";
import { marketingBuyerLines } from "@/lib/market/producerMarket/marketingBuyerRules";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { publicOrders, type ShadowProducer } from "@/lib/market/producerMarket/shadowRules";
import {
  plantEconomyShare,
  shadowBook,
  type ShadowAccountRole,
  type ShadowCarryState,
  type ShadowPlantCarry,
} from "@/lib/market/producerMarket/shadowCarryRules";
import type { ProfitOwnerKind } from "@/lib/market/producerMarket/profitDistributionRules";
import { type MarketAccount } from "@/lib/market/producerMarket/rules";
import type { ProductionPlan } from "@/lib/market/producerMarket/production";
import { fundedFreightDispatchMultiplier } from "@/lib/market/producerMarket/fundedFreightDispatchRules";
import {
  OVERSUPPLY_CUT_COMMODITIES,
  buyerPressureOf,
  cashCoverShare,
  oversupplyScale,
} from "@/lib/market/producerMarket/oversupplyCutRules";
import { producerRunBudget } from "@/lib/market/producerMarket/productionPlan";
import { gdpToAnchor } from "@/lib/currency/gdpAnchorRate";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { isPlannedEconomy } from "@/lib/constants/commandEconomy";
import {
  prepareProducerPhysicalSector,
  type ProducerPhysicalEnv,
} from "./producerPhysicalPreparation";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import type { CorporationLookups } from "./types";
import {
  createRouteEligibility,
  type RouteOffer,
  type RouteOrder,
} from "@/lib/market/producerMarket/routeRules";
import { importTariffTable, type ImportTariffTable } from "@/lib/market/producerMarket/tariffRules";
import {
  backgroundOrderEligibility,
  backgroundTradeLines,
  type BackgroundEconomy,
} from "@/lib/market/producerMarket/backgroundTradeRules";
import { laneKeyOf } from "@/lib/market/producerMarket/laneKey";
import { statesCollection } from "@/lib/db/repositories/states";
import {
  wideEconomyBaseline as buildWideEconomyBaseline,
  wideEconomyOrders as buildWideEconomyOrders,
  wideEconomyOffers as buildWideEconomyOffers,
  wideEconomyWeights as buildWideEconomyWeights,
  wideEconomyShortageBoost as buildWideEconomyShortageBoost,
  wideEconomyBoostOffers as buildWideEconomyBoostOffers,
  type WideEconomyBaseline,
  type WideEconomyMarketRow,
} from "@/lib/market/producerMarket/wideEconomyRules";
import { resolvePriceIndex, toRealOutput } from "@/lib/metricEngine/rules/priceLevel";

/**
 * Funded-market demand for one producer turn: every plant prepared from its
 * carried stock and receipt, household wallets, public buyers on the plant
 * economy's share of their budget, corporate marketing orders, trade-route
 * eligibility and the opening account balances. Shared by the telemetry shadow
 * and the live funded market so both settle the same demand.
 */
const PRICE_HEADROOM = 1.25;

export async function buildProducerTurnDemand(
  db: Db,
  input: {
    turn: number;
    worldEpoch: string;
    lookups: CorporationLookups;
    env: ProducerPhysicalEnv;
    sectorOps: readonly unknown[];
    carry: ShadowCarryState | null;
    /** Public buyer account per country; the shadow uses `public:<country>`. */
    publicAccountId?: (countryId: string) => string;
    /** Construction buyer account per country; the shadow uses `investment:<country>`. */
    investmentAccountId?: (countryId: string) => string;
    /** Wider-economy buyer account per country; the shadow uses `wide:<country>`. */
    wideEconomyAccountId?: (countryId: string) => string;
    /** Recent real shortage per lane, newest first (wideEconomyShortageBoost). */
    wideEconomyShortageHistory?: readonly Readonly<Record<string, number>>[];
    /** The world's stored wider-economy baseline, when one exists. */
    wideEconomyBaseline?: WideEconomyBaseline | null;
    /** Recent settled turns to build the baseline from when none is stored yet. */
    wideEconomyBaselineTurns?: readonly (readonly WideEconomyMarketRow[])[];
    /** Last turn's unspent public funding kept per budget line, by country (funded turn only). */
    publicCarryIn?: ReadonlyMap<string, LineCarry>;
    /** Optional timing hook, called at the end of each numbered step. */
    stage?: (name: string) => void;
    /** gameConfig.producerHouseholdIncomeFloor: target household income per turn (anchor); 0 or absent = off. */
    householdIncomeFloor?: number;
    /** Each country's plant-economy share at its first funded turn (see heldShares). */
    openingShareByCountry?: ReadonlyMap<string, number>;
    /** Background countries trading their macro economy (#5702); absent or empty: none. */
    backgroundEconomies?: readonly BackgroundEconomy[];
    /** Per-turn freight work left unfilled by funded orders in the previous country books. */
    freightGapsByCountry?: ReadonlyMap<string, number>;
    /** Last turn's buyer pressure per lane (`commodity|book`: requested / delivered). */
    lastBookPressure?: Readonly<Record<string, number>>;
  }
) {
  const { worldEpoch, carry } = input;
  const publicAccountId = input.publicAccountId ?? ((countryId: string) => `public:${countryId}`);
  const investmentAccountId =
    input.investmentAccountId ?? ((countryId: string) => `investment:${countryId}`);
  const wideEconomyAccountId =
    input.wideEconomyAccountId ?? ((countryId: string) => `wide:${countryId}`);
  const preparedSectors: ReturnType<typeof prepareProducerPhysicalSector>["prepared"][] = [];
  // Each plant's staffed headcount at its funded run, for the labour market.
  const headcountBySectorId = new Map<string, { desiredWorkers: number; workers: number }>();
  const walletScopes: ReturnType<typeof prepareProducerPhysicalSector>["walletScopes"][number][] =
    [];
  const legacyBySectorId = legacyPnlBySectorId(input.sectorOps);
  const env = isolatedShadowEnv(input.env);
  // Country tags exist only for the funded book (see fundedBookRules); with the
  // stage off they are omitted so a receipt is byte-identical to before.
  const tagCountry = (countryId: string | undefined) =>
    (env.fundedBookStage ?? 0) >= 1 && countryId ? { countryId } : {};
  const { lookups } = input;
  const pricingPolicies = lookups.corporations.some(
    (c) =>
      c.internalSupplyPolicy?.transferPricing && c.internalSupplyPolicy.transferPricing !== "free"
  )
    ? resolveSupplyPolicies(
        lookups.corporations.map((c) => ({
          id: c._id.toString(),
          totalShares: c.totalShares,
          holders: (c.shareholders ?? []).map((h) => ({
            corporationId: h.corporationId?.toString(),
            shares: h.shares,
          })),
          policy: c.internalSupplyPolicy,
        }))
      )
    : null;
  const base = eraScaledBasePrices(lookups.eraUnitScale);
  const refPrice = (commodity: CommodityType, stateId: string): number | null => {
    if (!isStateScopedCommodity(commodity)) {
      const carried = carry?.references[commodity];
      if (carried != null && Number.isFinite(carried) && carried > 0) return carried;
    }
    const ratio = isStateScopedCommodity(commodity)
      ? lookups.statePriceRatioByState?.get(stateId)?.get(commodity)
      : undefined;
    const r = ratio ?? lookups.priceRatioByCommodity.get(commodity) ?? 1;
    const p = base[commodity] * r;
    return Number.isFinite(p) && p > 0 ? p : null;
  };

  // 1. Prepare every producing plant, opening from last shadow turn's stock and receipt.
  const producers: ShadowProducer[] = [];
  const plannedFreightByCountry = new Map<string, number>();
  const dispatchableDepots: { plan: ProductionPlan; countryId: string; gap: number }[] = [];
  let skipped = 0;
  const cashByCorp = new Map<string, number>();
  const newCompanyCash = { total: 0 };
  const householdWallets = new Map<
    string,
    { accountId: string; stateId: string; countryId: string }
  >();
  const wageBillByWallet = new Map<string, number>();
  const planCountry = new Map<string, string>();
  const planSector = new Map<string, string>();
  const householdForPayee = new Map<string, string>();
  const firstWalletByCorp = new Map<string, { sectorId: string; wallet: string }>();
  const legacyRevenueByCountry = new Map<string, number>();
  const ownerKindByCompany = new Map<string, ProfitOwnerKind>();
  const skipReasons: Record<string, number> = {};
  const oversupplyLast = new Map<string, { offered: number; taken: number }>();
  const oversupplyPlans: ProductionPlan[] = [];
  const skippedSectors: { sectorId: string; reason: string }[] = [];
  for (const corp of lookups.corporations) {
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
      try {
        const sectorId = sector._id.toString();
        const openedSector = shadowOpeningSector(
          sector,
          worldEpoch,
          input.turn,
          carry?.plants[sectorId]
        );
        const {
          prepared,
          walletScopes: scopes,
          headcount,
        } = prepareProducerPhysicalSector({
          worldEpoch,
          env,
          corporation: corp,
          internalSupplyPolicy: pricingPolicies?.get(corp._id.toString())?.policy,
          sector: openedSector,
          inputPriceHeadroom: PRICE_HEADROOM,
          basePrices: base,
        });
        const sectorCountry = String(sector.countryId ?? corp.countryId ?? "");
        const plan = shadowCountryBooks(prepared.plan, sectorCountry);
        const freightGap = input.freightGapsByCountry?.get(sectorCountry);
        if (
          freightGap &&
          sector.sectorType === "logistics" &&
          sector.strategyId === "freight_only"
        ) {
          const output = plan.outputs.find((row) => row.commodity === "freight");
          const freightUnits =
            plan.capacityUnits *
            plan.activeFraction *
            plan.outputMultiplier *
            (output?.unitsPerOutput ?? 0);
          const otherProduction = plan.outputs.some(
            (row) => row.commodity !== "freight" && row.unitsPerOutput > 0
          );
          if (freightUnits > 0 && !otherProduction) {
            plannedFreightByCountry.set(
              sectorCountry,
              (plannedFreightByCountry.get(sectorCountry) ?? 0) + freightUnits
            );
            dispatchableDepots.push({ plan, countryId: sectorCountry, gap: freightGap });
          }
        }
        preparedSectors.push({ ...prepared, plan });
        const settled = openedSector.producerSettlement;
        const openingTurn =
          env.producerOpeningTurnsBySector?.get(sectorId) ??
          env.producerOpeningTurn ??
          input.turn - 1;
        if (settled && settled.worldEpoch === worldEpoch && settled.turn === openingTurn)
          for (const line of settled.products ?? [])
            if (OVERSUPPLY_CUT_COMMODITIES.has(line.commodity)) {
              const t = oversupplyLast.get(line.commodity) ?? { offered: 0, taken: 0 };
              t.offered += Math.max(0, line.offeredUnits ?? 0);
              // Own-site deliveries are offered but never sold: they were taken, not left over.
              t.taken +=
                Math.max(0, line.soldUnits ?? 0) + Math.max(0, line.internalDeliveredUnits ?? 0);
              oversupplyLast.set(line.commodity, t);
            }
        if (
          plan.outputs.some(
            (o) => OVERSUPPLY_CUT_COMMODITIES.has(o.commodity) && o.unitsPerOutput > 0
          )
        )
          oversupplyPlans.push(plan);
        headcountBySectorId.set(sectorId, {
          desiredWorkers: headcount.desiredWorkers,
          workers: headcount.workers,
        });
        walletScopes.push(...scopes);
        // Legacy plantsPnl is daily and in the sector host's currency; the
        // shadow is per turn in anchor units, so convert before comparing.
        const legacyLocal = legacyBySectorId.get(sectorId) ?? null;
        const hostRate = lookups.exchangeRatesByCurrency.get(
          (resolveSectorHostCurrencyCode(sector, corp) ?? "USD") as never
        );
        const legacy =
          legacyLocal && hostRate && hostRate > 0
            ? {
                revenue: legacyLocal.revenue / hostRate / TURNS_PER_DAY,
                profit: legacyLocal.profit / hostRate / TURNS_PER_DAY,
              }
            : null;
        producers.push({ plan, sectorType: sector.sectorType, legacy });
        if (legacy)
          legacyRevenueByCountry.set(
            sectorCountry,
            (legacyRevenueByCountry.get(sectorCountry) ?? 0) + Math.max(0, legacy.revenue)
          );
        if (!cashByCorp.has(plan.accountId)) {
          const carried = carry?.accounts[plan.accountId];
          if (carried != null) cashByCorp.set(plan.accountId, carried);
          else {
            const rate = lookups.exchangeRatesByCurrency.get(
              (corp.liquidCurrencyCode ?? "USD") as never
            );
            const live = rate && rate > 0 ? Math.max(0, (corp.liquidCapital ?? 0) / rate) : 0;
            cashByCorp.set(plan.accountId, live);
            newCompanyCash.total += live;
          }
          ownerKindByCompany.set(
            plan.accountId,
            isStateOwned(corp) ? "state" : corp.ceoType === "npp" ? "ai" : "player"
          );
        }
        planCountry.set(plan.id, sectorCountry);
        planSector.set(plan.id, sectorId);
        householdWallets.set(plan.labourRecipientAccountId, {
          accountId: plan.labourRecipientAccountId,
          stateId: sector.stateId,
          countryId: sectorCountry,
        });
        wageBillByWallet.set(
          plan.labourRecipientAccountId,
          (wageBillByWallet.get(plan.labourRecipientAccountId) ?? 0) + plan.labourCost
        );
        householdForPayee.set(plan.operatingRecipientAccountId, plan.labourRecipientAccountId);
        const first = firstWalletByCorp.get(plan.accountId);
        if (!first || sectorId < first.sectorId)
          firstWalletByCorp.set(plan.accountId, {
            sectorId,
            wallet: plan.labourRecipientAccountId,
          });
      } catch (error) {
        skipped++;
        const reason = error instanceof Error ? error.message : String(error);
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        skippedSectors.push({ sectorId: sector._id.toString(), reason });
      }
    }
  }

  for (const { plan, countryId, gap } of dispatchableDepots) {
    const planned = plannedFreightByCountry.get(countryId) ?? 0;
    plan.outputMultiplier *= fundedFreightDispatchMultiplier(gap, planned);
  }
  const oversupplyScales = applyOversupplyCut(
    oversupplyPlans,
    oversupplyLast,
    cashByCorp,
    input.lastBookPressure
  );
  input.stage?.("demand.plants");
  // 2. Households: carried savings, or a new run's opening of a few turns of
  //    the wages they are paid (owner decision 2026-10-18). Income-derived;
  //    no GDP or population sizing.
  let householdSeed = 0;
  const householdOpening = new Map<string, number>();
  for (const w of householdWallets.values()) {
    const carried = carry?.accounts[w.accountId];
    if (carried != null) householdOpening.set(w.accountId, carried);
    else {
      const seed = HOUSEHOLD_OPENING_TURNS * (wageBillByWallet.get(w.accountId) ?? 0);
      householdOpening.set(w.accountId, seed);
      householdSeed += seed;
    }
  }

  input.stage?.("demand.households");
  // 3. Public buyers: the existing budget outlay times the plant economy's
  //    share of GDP, so only the plant market's slice of a budget is spent here.
  const states = await statesCollection<{ _id: unknown; countryId?: string; gdp?: number }>(db)
    .find({}, { projection: { countryId: 1, gdp: 1 } })
    .toArray();
  const stateWeightsByCountry = new Map<string, Map<string, number>>();
  const gdpMillionsByCountry = new Map<string, number>();
  for (const s of states)
    if (s.countryId) {
      const m = stateWeightsByCountry.get(s.countryId) ?? new Map<string, number>();
      m.set(String(s._id), Math.max(0, s.gdp ?? 0));
      stateWeightsByCountry.set(s.countryId, m);
      gdpMillionsByCountry.set(
        s.countryId,
        (gdpMillionsByCountry.get(s.countryId) ?? 0) + Math.max(0, s.gdp ?? 0)
      );
    }
  const publicShareByCountry: Record<
    string,
    { valueAdded: number; gdpPerTurn: number; share: number; basis: "shadow" | "legacy" }
  > = {};
  const shareFor = (countryId: string): number => {
    const carried = carry?.valueAddedByCountry[countryId];
    const valueAdded = carried ?? legacyRevenueByCountry.get(countryId) ?? 0;
    const gdpPerTurn =
      (gdpToAnchor(gdpMillionsByCountry.get(countryId) ?? 0, countryId as never, lookups.preset) *
        1_000_000) /
      TURNS_PER_YEAR;
    const share = flooredPlantShare(
      plantEconomyShare(valueAdded, gdpPerTurn),
      input.env.demandFloorStage
    );
    publicShareByCountry[countryId] = {
      valueAdded,
      gdpPerTurn,
      share,
      basis: carried != null ? "shadow" : "legacy",
    };
    return share;
  };
  const funding = publicBuyerFunding(
    lookups.federalBudgets.map((b) => {
      const countryId = String(b.countryId);
      const code = resolveCountryCurrencyCode(b);
      const rate = (code && lookups.exchangeRatesByCurrency.get(code)) || 1;
      const plantShare = shareFor(countryId);
      const byCategory = Object.fromEntries(
        Object.entries(b.spending?.byCategory ?? {}).map(([k, v]) => [k, (v as number) / rate])
      );
      return {
        countryId,
        byCategory,
        plannedEconomy: isPlannedEconomy(countryId, lookups.eraYear ?? null, false),
        stateWeights: stateWeightsByCountry.get(countryId) ?? new Map(),
        plantShare,
      };
    }),
    TURNS_PER_YEAR
  ).map((f) => ({
    ...f,
    lines: f.lines.map((l) => ({ ...l, book: shadowBook(l.book, l.commodity, f.countryId) })),
  }));
  // Carry-forward: money a short line left unspent last turn joins that line's
  // budget (the wallet already holds it). Fresh outlay stays what is minted.
  const publicFreshByCountry = new Map(
    funding.map((f) => [
      f.countryId,
      new Map(f.lines.map((l) => [carryLineKey(l.commodity, l.book), l.amountLocal])),
    ])
  );
  const publicCarriedIn = new Map<string, number>();
  // Release stage (issue #5454): a line draws at most part of its carry a turn.
  // The rest is held, and kept for later turns with what this turn leaves unspent.
  const publicCarryHeld = new Map<string, LineCarry>();
  const carriedFunding = funding.map((f) => {
    const carryIn = input.publicCarryIn?.get(f.countryId);
    if (!carryIn) return f;
    let lines: typeof f.lines;
    if (input.env.publicCarryRelease) {
      const released = releaseCarriedLines(f.lines, carryIn);
      lines = released.lines;
      if (Object.keys(released.held).length > 0) publicCarryHeld.set(f.countryId, released.held);
    } else {
      lines = withCarriedLines(f.lines, carryIn);
    }
    const added =
      lines.reduce((s, l) => s + l.amountLocal, 0) - f.lines.reduce((s, l) => s + l.amountLocal, 0);
    if (added > 0) publicCarriedIn.set(f.countryId, added);
    return { ...f, lines };
  });
  const publicFunding = funding.reduce((s, f) => s + f.fundingLocal, 0);
  // Transfer lines of the same budgets (social security, welfare, pensions)
  // are household income; the treasury deducts them already.
  const transferBudgets = lookups.federalBudgets.map((b) => {
    const code = resolveCountryCurrencyCode(b);
    const rate = (code && lookups.exchangeRatesByCurrency.get(code)) || 1;
    return {
      countryId: String(b.countryId),
      byCategory: Object.fromEntries(
        Object.entries(b.spending?.byCategory ?? {}).map(([k, v]) => [k, (v as number) / rate])
      ),
    };
  });
  const currentShares = new Map(
    Object.entries(publicShareByCountry).map(([id, v]) => [id, v.share])
  );
  // Steady household income (producerHouseholdIncomeFloor > 0): hold each
  // country's opening share and top up to the income floor from its own
  // transfer lines. Off: transfers follow the live plant share as before.
  let transferShares: ReadonlyMap<string, number> = currentShares;
  let householdSource: {
    floorAnchor: number;
    plannedIncomeAnchor: number;
    topUpAnchor: number;
    shortfallAnchor: number;
    currentShares: Record<string, number>;
  } | null = null;
  const incomeFloor = input.householdIncomeFloor ?? 0;
  if (incomeFloor > 0) {
    const held = heldShares(currentShares, input.openingShareByCountry);
    const lineAnchorByCountry = new Map<string, number>();
    for (const t of householdTransferFunding(
      transferBudgets,
      [...householdWallets.values()],
      stateWeightsByCountry,
      new Map([...held.keys()].map((id) => [id, 1])),
      TURNS_PER_YEAR
    ))
      lineAnchorByCountry.set(t.countryId, (lineAnchorByCountry.get(t.countryId) ?? 0) + t.amount);
    const plannedIncomeAnchor = preparedSectors.reduce(
      (sum, p) => sum + (p.plan.labourCost ?? 0) + (p.plan.otherOperatingCost ?? 0),
      0
    );
    const floored = incomeFloorShares({
      shares: held,
      lineAnchorByCountry,
      plannedIncomeAnchor,
      floorAnchor: incomeFloor,
    });
    transferShares = floored.shares;
    householdSource = {
      floorAnchor: incomeFloor,
      plannedIncomeAnchor,
      topUpAnchor: floored.topUpAnchor,
      shortfallAnchor: floored.shortfallAnchor,
      currentShares: Object.fromEntries(currentShares),
    };
  }
  const householdTransfers = householdTransferFunding(
    transferBudgets,
    [...householdWallets.values()],
    stateWeightsByCountry,
    transferShares,
    TURNS_PER_YEAR
  );
  const householdTransferTotal = householdTransfers.reduce((sum, t) => sum + t.amount, 0);
  for (const t of householdTransfers)
    householdOpening.set(t.walletId, (householdOpening.get(t.walletId) ?? 0) + t.amount);
  const budgetCountries = new Set(lookups.federalBudgets.map((b) => String(b.countryId)));
  // Construction work on outstanding build orders, bought from producers. The
  // builds were paid when placed; this gives that cash its destination.
  const investmentFunding = investmentBuyerFunding(
    lookups.corporations.flatMap((corp) =>
      (lookups.sectorsByCorp.get(corp._id.toString()) ?? []).map((sector) => ({
        countryId: String(sector.countryId ?? corp.countryId ?? ""),
        stateId: String(sector.stateId ?? ""),
        buildQueue: sector.buildQueue ?? [],
      }))
    ),
    input.turn
  )
    // A construction buyer settles in its country's budget currency.
    .filter((f) => budgetCountries.has(f.countryId))
    .map((f) => ({
      ...f,
      lines: f.lines.map((l) => ({ ...l, book: shadowBook(l.book, l.commodity, f.countryId) })),
    }));
  const investmentFundingTotal = investmentFunding.reduce((s, f) => s + f.fundingLocal, 0);

  // The wider economy (gameConfig.wideEconomyStage): a background buyer in each
  // plant-country state, sized once from a market baseline and grown with real
  // GDP. Background countries have their own lines.
  const backgroundCountries = new Set((input.backgroundEconomies ?? []).map((e) => e.countryId));
  const wideOn = (input.env.wideEconomyStage ?? 0) >= 1;
  const priceIndexByCountry = new Map(
    lookups.federalBudgets.map((b) => [String(b.countryId), resolvePriceIndex(b.priceIndex)])
  );
  // State GDP is in local currency: shares between countries use the anchor.
  const localPerAnchorByCountry = new Map(
    lookups.federalBudgets.flatMap((b) => {
      const code = resolveCountryCurrencyCode(b);
      const rate = code ? lookups.exchangeRatesByCurrency.get(code) : undefined;
      return rate != null && Number.isFinite(rate) && rate > 0
        ? [[String(b.countryId), rate] as const]
        : [];
    })
  );
  const wideStates = wideOn
    ? states.flatMap((s) => {
        const countryId = s.countryId ?? "";
        if (!budgetCountries.has(countryId) || backgroundCountries.has(countryId)) return [];
        if (!stateWeightsByCountry.has(countryId)) return [];
        const realGdp = toRealOutput(Math.max(0, s.gdp ?? 0), priceIndexByCountry.get(countryId));
        const rate = localPerAnchorByCountry.get(countryId);
        return [
          {
            stateId: String(s._id),
            countryId,
            realGdp,
            ...(rate ? { anchorGdp: realGdp / rate } : {}),
          },
        ];
      })
    : [];
  const wideEconomyBaselineCreated =
    wideOn && !input.wideEconomyBaseline && (input.wideEconomyBaselineTurns?.length ?? 0) > 0
      ? buildWideEconomyBaseline({ turns: input.wideEconomyBaselineTurns!, states: wideStates })
      : null;
  // A stored baseline from before the anchor-currency split gets its weights
  // now, at this turn's rates; the turn stores them so they never move again.
  const backfilledWeights =
    wideOn && input.wideEconomyBaseline && !input.wideEconomyBaseline.weight
      ? buildWideEconomyWeights(
          input.wideEconomyBaseline.realGdp,
          input.wideEconomyBaseline.countryOfState,
          (c) => localPerAnchorByCountry.get(c)
        )
      : null;
  // No rates, no weights: keep the stored split rather than zeroing every line.
  const wideEconomyBaselineWeights =
    backfilledWeights && Object.keys(backfilledWeights).length > 0 ? backfilledWeights : null;
  const wideBaseline =
    input.wideEconomyBaseline && wideEconomyBaselineWeights
      ? { ...input.wideEconomyBaseline, weight: wideEconomyBaselineWeights }
      : (input.wideEconomyBaseline ?? wideEconomyBaselineCreated);
  const wideLineInput = wideBaseline
    ? {
        baseline: wideBaseline,
        realGdpNow: new Map(wideStates.map((s) => [s.stateId, s.realGdp])),
        accountId: wideEconomyAccountId,
        referencePrice: (c: string, stateId: string) => refPrice(c as CommodityType, stateId),
        isStateScoped: (c: string) => isStateScopedCommodity(c as CommodityType),
        mapBook: shadowBook,
      }
    : null;
  // Both sides trade only in the after-market pass (residualWideEconomyLines).
  const wideEconomyOrders = wideOn && wideLineInput ? buildWideEconomyOrders(wideLineInput) : [];
  // A persistently short lane gets a bigger seller, residual only as ever.
  const wideBoost = buildWideEconomyShortageBoost(input.wideEconomyShortageHistory ?? []);
  const wideEconomyOffers = wideOn && wideLineInput ? buildWideEconomyOffers(wideLineInput) : [];
  const wideEconomyBoostOffers =
    wideEconomyOffers.length > 0
      ? buildWideEconomyBoostOffers(wideEconomyOffers, wideBoost, laneKeyOf)
      : [];

  input.stage?.("demand.public");
  // 4. Accounts: company cash, households, funded public buyers, payees (empty at open).
  const roles: ShadowAccountRole[] = [];
  const accounts: MarketAccount[] = [];
  for (const [id, cash] of cashByCorp) {
    accounts.push({ id, cash });
    roles.push({ id, kind: "company", countryId: "" });
  }
  for (const w of householdWallets.values()) {
    accounts.push({ id: w.accountId, cash: householdOpening.get(w.accountId) ?? 0 });
    roles.push({ id: w.accountId, kind: "household", countryId: w.countryId });
  }
  for (const f of funding) {
    // The live funded turn rebuilds opening cash from the database wallets, so
    // the carry is already in the wallet there; this figure only seeds the
    // shadow. Do not make it authoritative without removing the carry from the wallet.
    accounts.push({
      id: publicAccountId(f.countryId),
      cash: f.fundingLocal + (publicCarriedIn.get(f.countryId) ?? 0),
    });
    roles.push({ id: publicAccountId(f.countryId), kind: "public", countryId: f.countryId });
  }
  // Construction buyers close like public buyers: unspent work returns to its sink.
  for (const f of investmentFunding) {
    accounts.push({ id: investmentAccountId(f.countryId), cash: f.fundingLocal });
    roles.push({ id: investmentAccountId(f.countryId), kind: "public", countryId: f.countryId });
  }
  for (const id of householdForPayee.keys())
    if (!householdWallets.has(id)) {
      accounts.push({ id, cash: 0 });
      roles.push({ id, kind: "operatingPayee", countryId: "" });
    }
  const openingById = new Map(accounts.map((a) => [a.id, a.cash]));

  input.stage?.("demand.accounts");
  // 5. Orders and trade routes: world-book buyers only reach sellers in their
  //    own country or on routes the live trade matrix leaves open.
  const walletCountry = new Map(
    [...householdWallets.values()].map((w) => [w.accountId, w.countryId])
  );
  // Demand curves (#5451, #5453): each wallet state's income in anchor against
  // the median across wallet states, and its country's prime rate. The
  // comparison is deliberately across countries: incomes are converted to
  // anchor first, so a richer country's households tilt toward discretionary
  // goods and a poorer one's toward essentials, at today's exchange rates.
  const walletStateCountry = new Map(
    [...householdWallets.values()].map((w) => [w.stateId, w.countryId] as const)
  );
  const demandCurve = input.env.demandCurve
    ? {
        incomeIndexByState: incomeIndexByState(
          [...walletStateCountry].map(([stateId, country]) => {
            const local = lookups.stateMetricsByState?.get(stateId)?.economic?.medianIncome?.value;
            const code = currencyForCountry(country);
            const rate = (code && lookups.exchangeRatesByCurrency.get(code)) || 1;
            return { stateId, income: typeof local === "number" ? local / rate : NaN };
          })
        ),
        primeRatePctByState: new Map(
          [...walletStateCountry].flatMap(([stateId, country]) => {
            const rate = lookups.primeRateByCountry.get(country);
            return typeof rate === "number" ? [[stateId, rate] as const] : [];
          })
        ),
      }
    : undefined;
  const households = householdDemandSpecs({
    wallets: [...householdWallets.values()],
    referencePrice: refPrice,
    priceHeadroom: PRICE_HEADROOM,
    ...(demandCurve ? { demandCurve } : {}),
  }).map((h) => {
    // Climate heat raises the energy share of a hot region's basket.
    const energyDemand = (h.stateId && lookups.climateEnergyDemandByState?.get(h.stateId)) || 1;
    return {
      ...h,
      ...tagCountry(walletCountry.get(h.accountId)),
      products: h.products.map((p) => ({
        ...p,
        ...(p.commodity === "energy" && energyDemand !== 1
          ? { weight: p.weight * energyDemand }
          : {}),
        book: shadowBook(p.book, p.commodity, walletCountry.get(h.accountId) ?? ""),
      })),
    };
  });
  const publicBuyerOrders = publicOrders(
    carriedFunding.map((f) => ({
      accountId: publicAccountId(f.countryId),
      ...tagCountry(f.countryId),
      lines: f.lines,
    })),
    (c, book) => refPrice(c as CommodityType, book.startsWith("state:") ? book.slice(6) : ""),
    PRICE_HEADROOM
  );
  // Public buyers clear their own country's sellers first (publicHomeFirstRules).
  if (publicHomeFirstOn(env.publicHomeFirstStage)) markHomeCountryFirst(publicBuyerOrders);
  // What is left on the world book is shared pro rata (publicFairShareRules).
  if (publicFairShareOn(env.publicFairShareStage)) markPublicFairShare(publicBuyerOrders);
  const investmentBuyerOrders = publicOrders(
    investmentFunding.map((f) => ({
      accountId: investmentAccountId(f.countryId),
      ...tagCountry(f.countryId),
      lines: f.lines,
    })),
    (c, book) => refPrice(c as CommodityType, book.startsWith("state:") ? book.slice(6) : ""),
    PRICE_HEADROOM
  );
  // Corporate advertising from funded marketing budgets, paid from the
  // corporation's own account (only corporations with plants hold one).
  const corpCountry = new Map<string, string>();
  const marketingBudgets = lookups.corporations.flatMap((corp) => {
    const id = corp._id.toString();
    const cash = cashByCorp.get(id);
    if (cash == null || !((corp.marketingBudget ?? 0) > 0)) return [];
    corpCountry.set(id, String(corp.countryId ?? ""));
    const rate = lookups.exchangeRatesByCurrency.get((corp.liquidCurrencyCode ?? "USD") as never);
    return [
      {
        accountId: id,
        dailyBudgetAnchor: readCorpEconomicAnchor(
          corp.marketingBudget ?? 0,
          corp.liquidCurrencyCode,
          rate ?? 1
        ),
        cashAnchor: cash,
      },
    ];
  });
  const marketingOrders = publicOrders(
    marketingBuyerLines(marketingBudgets, TURNS_PER_DAY).map((b) => ({
      ...b,
      ...tagCountry(corpCountry.get(b.accountId)),
    })),
    (c) => refPrice(c as CommodityType, ""),
    PRICE_HEADROOM
  ).map((o) => ({ ...o, id: `marketing:${o.accountId}` }));
  // Background countries (#5702): their macro supply and demand as offers and
  // orders on the world book, priced like every other buyer's references.
  const background = backgroundTradeLines({
    economies: input.backgroundEconomies ?? [],
    referencePrice: (c) => refPrice(c as CommodityType, ""),
    priceHeadroom: PRICE_HEADROOM,
    unitsPerTurnDivisor: TURNS_PER_DAY,
  });
  const backgroundOffers = background.offers;
  const backgroundOrders = background.orders;
  // Background buyers share scarce world supply like public buyers; in id order
  // the country code decided who got any (publicFairShareRules).
  if (publicFairShareOn(env.publicFairShareStage)) markPublicFairShare(backgroundOrders);
  const routes = lookups.tradeRoutes;
  const worldRouteOffers = (): RouteOffer[] => [
    ...producers.flatMap((p) =>
      p.plan.outputs
        .filter((o) => o.book === "world")
        .map((o) => ({
          id: JSON.stringify([p.plan.id, "output", o.commodity]),
          commodity: o.commodity,
          sellerCountry: planCountry.get(p.plan.id) ?? "",
        }))
    ),
    ...backgroundOffers.map((o) => ({
      id: o.id,
      commodity: o.commodity,
      sellerCountry: o.countryId ?? "",
    })),
  ];
  // A background order never buys its own country's offer, so it always names
  // its sellers: every other country's world offer on an open route.
  if (backgroundOrders.length > 0) {
    const eligible = backgroundOrderEligibility(
      backgroundOrders,
      worldRouteOffers(),
      routes
        ? (c, from, to) => routes.affinityFor(c as CommodityType, from as never, to as never) > 0
        : null
    );
    for (const o of backgroundOrders) o.eligibleOfferIds = eligible.get(o.id) ?? [];
  }
  let eligibleOffersByOrder: Record<string, readonly string[]> | undefined;
  if (routes) {
    const open = (c: string, from: string, to: string) =>
      routes.affinityFor(c as CommodityType, from as never, to as never) > 0;
    const offers: RouteOffer[] = worldRouteOffers();
    const orders: RouteOrder[] = [
      ...producers.flatMap((p) =>
        p.plan.inputs
          .filter((r) => r.book === "world")
          .map((r) => ({
            id: JSON.stringify([p.plan.id, "input", r.commodity]),
            commodity: r.commodity,
            buyerCountry: planCountry.get(p.plan.id) ?? "",
          }))
      ),
    ];
    // Producers and final buyers share the same indexed offers and cached lists.
    // Rebuilding the offer index for every final-buyer pair repeated world-wide work.
    const listFor = createRouteEligibility(offers, open);
    eligibleOffersByOrder = {};
    for (const order of orders) {
      const list = listFor(order.commodity, order.buyerCountry);
      if (list) eligibleOffersByOrder[order.id] = list;
    }
    const restrict = (row: { eligibleOfferIds?: readonly string[] }, list?: readonly string[]) => {
      if (list) row.eligibleOfferIds = list;
    };
    for (const h of households)
      for (const product of h.products)
        if (product.book === "world")
          restrict(
            product as { eligibleOfferIds?: readonly string[] },
            listFor(product.commodity, walletCountry.get(h.accountId) ?? "")
          );
    const publicCountry = new Map(funding.map((f) => [publicAccountId(f.countryId), f.countryId]));
    for (const o of publicBuyerOrders)
      if (o.book === "world")
        restrict(o, listFor(o.commodity, publicCountry.get(o.accountId) ?? ""));
    const investmentCountry = new Map(
      investmentFunding.map((f) => [investmentAccountId(f.countryId), f.countryId])
    );
    for (const o of investmentBuyerOrders)
      if (o.book === "world")
        restrict(o, listFor(o.commodity, investmentCountry.get(o.accountId) ?? ""));
    for (const o of marketingOrders)
      restrict(o, listFor(o.commodity, corpCountry.get(o.accountId) ?? ""));
    // Unlike a background country, the wider economy buys its own country's
    // output, and only plant output: never a background country's offer.
    const backgroundOfferIds = new Set(backgroundOffers.map((o) => o.id));
    for (const o of wideEconomyOrders)
      if (o.book === "world") {
        const list = listFor(o.commodity, o.countryId ?? "");
        restrict(
          o,
          list?.filter((id) => !backgroundOfferIds.has(id))
        );
      }
  }

  // Import tariffs (producerTariffStage): one rate per open route that can
  // carry a sale this turn. Needs the funded book's country tags.
  let importTariffs: ImportTariffTable | undefined;
  if (routes && (env.tariffStage ?? 0) >= 1 && (env.fundedBookStage ?? 0) >= 1) {
    const sellerCountriesByCommodity = new Map<string, Set<string>>();
    for (const o of worldRouteOffers()) {
      const set = sellerCountriesByCommodity.get(o.commodity) ?? new Set<string>();
      set.add(o.sellerCountry);
      sellerCountriesByCommodity.set(o.commodity, set);
    }
    importTariffs = importTariffTable({
      sellerCountriesByCommodity,
      buyerCountries: new Set([
        ...planCountry.values(),
        ...walletCountry.values(),
        ...funding.map((f) => f.countryId),
        ...investmentFunding.map((f) => f.countryId),
        ...wideEconomyOrders.flatMap((o) => (o.countryId ? [o.countryId] : [])),
        ...backgroundOffers.flatMap((o) => (o.countryId ? [o.countryId] : [])),
        ...backgroundOrders.flatMap((o) => (o.countryId ? [o.countryId] : [])),
      ]),
      importCostMultiplier: (c, from, to) =>
        routes.importCostMultiplierFor(c as CommodityType, from as never, to as never),
      open: (c, from, to) => routes.affinityFor(c as CommodityType, from as never, to as never) > 0,
    });
  }

  const references = Object.fromEntries(
    COMMODITY_TYPES.map((c) => [c, refPrice(c, "")] as const).filter(
      (e): e is readonly [CommodityType, number] => e[1] != null
    )
  );
  return {
    electricityNetwork:
      env.electricityNetworkMode && env.electricityNetworkMode !== "off"
        ? buildElectricityNetwork(
            lookups.eraYear ?? Number.parseInt(lookups.preset ?? "2027", 10),
            env.electricityNetworkMode
          )
        : undefined,
    backgroundOffers,
    backgroundOrders,
    skippedSectors,
    preparedSectors,
    walletScopes,
    accounts,
    cashByCorp,
    /** Scale the oversupply cut applied per good this turn (1 = none). */
    oversupplyScales,
    eligibleOffersByOrder,
    importTariffs,
    firstWalletByCorp,
    funding,
    /** Per public buyer: each line's order id, fresh outlay and full budget (fresh + carried-in). */
    publicCarryOrders: carriedFunding.map((f) => ({
      countryId: f.countryId,
      orders: f.lines.map((l) => ({
        id: publicOrderId(publicAccountId(f.countryId), l.commodity, l.book),
        commodity: l.commodity,
        book: l.book,
        budget: l.amountLocal,
        fresh: publicFreshByCountry.get(f.countryId)?.get(carryLineKey(l.commodity, l.book)) ?? 0,
      })),
    })),
    /** Carry each country held back this turn under the release stage. */
    publicCarryHeld,
    headcountBySectorId,
    householdForPayee,
    householdSeed,
    householdTransfers,
    householdTransferTotal,
    householdSource,
    householdWallets,
    households,
    wageBillByWallet,
    investmentBuyerOrders,
    investmentFunding,
    investmentFundingTotal,
    marketingOrders,
    wideEconomyOrders,
    wideEconomyOffers,
    wideEconomyBoostOffers,
    wideEconomyBaselineCreated,
    wideEconomyBaselineWeights,
    newCompanyCash,
    openingById,
    ownerKindByCompany,
    planCountry,
    planSector,
    producers,
    publicBuyerOrders,
    publicFunding,
    publicShareByCountry,
    references,
    roles,
    skipReasons,
    skipped,
    states,
  };
}

/** Freight (and any other country-scoped shadow commodity) trades on one book per country. */
export function shadowCountryBooks(plan: ProductionPlan, countryId: string): ProductionPlan {
  const remap = <T extends { book: string; commodity: string }>(rows: readonly T[]): T[] =>
    rows.map((r) => ({ ...r, book: shadowBook(r.book, r.commodity, countryId) }));
  return {
    ...plan,
    inputs: remap(plan.inputs),
    outputs: remap(plan.outputs),
    outputStock: remap(plan.outputStock),
  };
}

/** Legacy plantsPnl this turn, read from the sector writes already computed (no I/O). */
export function legacyPnlBySectorId(
  sectorOps: readonly unknown[]
): Map<string, { revenue: number; profit: number }> {
  const out = new Map<string, { revenue: number; profit: number }>();
  for (const op of sectorOps as {
    updateOne?: {
      filter?: { _id?: { toString(): string } };
      update?: { $set?: { plantsPnl?: { revenue?: number; profit?: number } } };
    };
  }[]) {
    const id = op.updateOne?.filter?._id?.toString();
    const pnl = op.updateOne?.update?.$set?.plantsPnl;
    if (id && pnl && Number.isFinite(pnl.revenue) && Number.isFinite(pnl.profit))
      out.set(id, { revenue: pnl.revenue!, profit: pnl.profit! });
  }
  return out;
}

/**
 * Plant preparation records labour demand, wage and automation indexes and
 * strike events into the environment it is given. The live turn persists those
 * collectors later, so the shadow must never write into them: it works on
 * copies of the collectors it mutates and starts with no pending strikes.
 * Copying a collector is a shallow copy of its per-state accumulators, which is
 * the whole of their state, and is cheaper than a generic deep clone.
 */
export function isolatedShadowEnv(env: ProducerPhysicalEnv): ProducerPhysicalEnv {
  return {
    ...env,
    labourDemandByState: new Map(env.labourDemandByState),
    labourDemandWageIndexByState: copyStateAccumulators(env.labourDemandWageIndexByState),
    wageIndexByState: copyStateAccumulators(env.wageIndexByState),
    automationIndexByState: copyStateAccumulators(env.automationIndexByState),
    pendingStrikeEvents: [],
    // The shadow measures the funded world, which buys advertising as an input.
    advertisingInput: true,
  };
}

/** A new map holding a copy of each state's accumulator, never the live one. */
function copyStateAccumulators<T extends { weighted: number; workers: number }>(
  source: ReadonlyMap<string, T>
): Map<string, T>;
function copyStateAccumulators<T extends { weighted: number; workers: number }>(
  source: ReadonlyMap<string, T> | undefined
): Map<string, T> | undefined;
function copyStateAccumulators<T extends { weighted: number; workers: number }>(
  source: ReadonlyMap<string, T> | undefined
): Map<string, T> | undefined {
  // structuredClone(undefined) was undefined; an absent collector stays absent.
  if (!source) return undefined;
  const copy = new Map<string, T>();
  for (const [stateId, accumulator] of source) copy.set(stateId, { ...accumulator });
  return copy;
}

/**
 * The live world has not had the producer opening conversion, so its sectors
 * carry no producer generation or inventory. For the shadow only, give each a
 * view with an opening stamped on last turn: the stock and receipt the previous
 * shadow turn left, or on a new run its existing stock carried as sellable
 * output. Never written back.
 *
 * The view is the projection plant preparation reads, not a copy of the whole
 * document: a live sector also carries the telemetry of every prior turn, and
 * copying all of that per sector was most of the shadow's document cost. Keep
 * this list in step with `prepareProducerPhysicalSector` and the rules it
 * calls; anything preparation reads that is not here arrives as undefined.
 */
function preparationView(
  sector: CorporateSector,
  opening: Pick<
    CorporateSector,
    "capacityBookAnchor" | "buildQueue" | "producerCapacity" | "producerInventory"
  > &
    Partial<Pick<CorporateSector, "producerSettlement">>
): CorporateSector {
  return {
    _id: sector._id,
    corporationId: sector.corporationId,
    countryId: sector.countryId,
    stateId: sector.stateId,
    sectorType: sector.sectorType,
    strategyId: sector.strategyId,
    transitionFromStrategyId: sector.transitionFromStrategyId,
    transitionStartTurn: sector.transitionStartTurn,
    retoolRescaleApplied: sector.retoolRescaleApplied,
    capitalStock: sector.capitalStock,
    capacityBookAnchor: opening.capacityBookAnchor,
    buildQueue: opening.buildQueue,
    mothballed: sector.mothballed,
    activeCapacityPercent: sector.activeCapacityPercent,
    producerCapacity: opening.producerCapacity,
    producerInventory: opening.producerInventory,
    producerQuotes: sector.producerQuotes,
    pricingPosture: sector.pricingPosture,
    pricingMode: sector.pricingMode,
    producerSettlement: opening.producerSettlement ?? sector.producerSettlement,
    labourStaffingFactor: sector.labourStaffingFactor,
    wageLevel: sector.wageLevel,
    unionization: sector.unionization,
    workerExpectationIndex: sector.workerExpectationIndex,
    representingUnionId: sector.representingUnionId,
    strikeStartedAtTurn: sector.strikeStartedAtTurn,
    strikeCooldownUntilTurn: sector.strikeCooldownUntilTurn,
    soeMandate: sector.soeMandate,
    nationalizedAtTurn: sector.nationalizedAtTurn,
    nationalizationTransitionMultiplier: sector.nationalizationTransitionMultiplier,
    productionPolicy: sector.productionPolicy,
    productionPolicyLevel: sector.productionPolicyLevel,
    cutoverTransition: sector.cutoverTransition,
    cutoverStruggling: sector.cutoverStruggling,
  } as CorporateSector;
}

export function shadowOpeningSector(
  sector: CorporateSector,
  worldEpoch: string,
  turn: number,
  carried?: ShadowPlantCarry
): CorporateSector {
  const opening = emptyProducerSectorOpening(worldEpoch, Math.max(0, turn - 1));
  if (carried)
    return preparationView(sector, {
      capacityBookAnchor: sector.capacityBookAnchor ?? 0,
      buildQueue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
      producerCapacity: opening.producerCapacity,
      producerInventory: {
        ...opening.producerInventory,
        inputStock: carried.inputStock,
        outputStock: carried.outputStock,
      },
      producerSettlement: {
        ...carried.receipt,
        turn: turn - 1,
      } as CorporateSector["producerSettlement"],
    });
  if (sector.producerCapacity && sector.producerInventory) return sector;
  const outputStock = Object.entries(sector.inventoryUnits ?? {})
    .filter(([, units]) => typeof units === "number" && Number.isFinite(units) && units > 0)
    .map(([commodity, units]) => ({
      commodity,
      units: units as number,
      book: isStateScopedCommodity(commodity as CommodityType)
        ? `state:${sector.stateId}`
        : "world",
    }));
  return preparationView(sector, {
    capacityBookAnchor: sector.capacityBookAnchor ?? 0,
    buildQueue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
    producerCapacity: opening.producerCapacity,
    producerInventory: { ...opening.producerInventory, outputStock },
  });
}

/**
 * Trim planned output of glutted goods (oversupplyCutRules). Single-good plants
 * run less; joint plants keep their run and make less of that good only.
 * Returns the scale applied per good (1 = none).
 */
export function applyOversupplyCut(
  plans: readonly ProductionPlan[],
  last: ReadonlyMap<string, { offered: number; taken: number }>,
  cashByAccount: ReadonlyMap<string, number>,
  lastBookPressure?: Readonly<Record<string, number>>
): Map<string, number> {
  const scales = new Map<string, number>();
  if (plans.length === 0) return scales;
  const { fixedBills, variableNeed } = producerRunBudget(plans);
  const cover = new Map<string, number>();
  const coverOf = (accountId: string) => {
    let c = cover.get(accountId);
    if (c == null) {
      c = cashCoverShare(
        cashByAccount.get(accountId) ?? 0,
        fixedBills.get(accountId) ?? 0,
        variableNeed.get(accountId) ?? 0
      );
      cover.set(accountId, c);
    }
    return c;
  };
  for (const commodity of OVERSUPPLY_CUT_COMMODITIES) {
    const seen = last.get(commodity);
    if (!seen) continue;
    let planned = 0;
    for (const p of plans)
      for (const o of p.outputs)
        if (o.commodity === commodity)
          planned +=
            p.capacityUnits *
            p.activeFraction *
            p.outputMultiplier *
            o.unitsPerOutput *
            coverOf(p.accountId);
    const lastBuyerPressure = buyerPressureOf(lastBookPressure, commodity);
    const scale = oversupplyScale({
      lastOffered: seen.offered,
      lastTaken: seen.taken,
      plannedSupply: planned,
      ...(lastBuyerPressure != null ? { lastBuyerPressure } : {}),
    });
    scales.set(commodity, scale);
    if (!(scale < 1)) continue;
    for (const p of plans) {
      if (!p.outputs.some((o) => o.commodity === commodity && o.unitsPerOutput > 0)) continue;
      const only = p.outputs.every((o) => o.commodity === commodity || !(o.unitsPerOutput > 0));
      if (only) p.outputMultiplier *= scale;
      else
        p.outputs = p.outputs.map((o) =>
          o.commodity === commodity ? { ...o, unitsPerOutput: o.unitsPerOutput * scale } : o
        );
    }
  }
  return scales;
}
