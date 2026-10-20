/** Funded-market demand construction shared by the producer shadow and the live funded market. */
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
import { HOUSEHOLD_OPENING_TURNS } from "@/lib/market/producerMarket/householdOpeningRules";
import { publicBuyerFunding } from "@/lib/market/producerMarket/publicBuyerRules";
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
  routeEligibility,
  type RouteOffer,
  type RouteOrder,
} from "@/lib/market/producerMarket/routeRules";

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
  }
) {
  const { worldEpoch, carry } = input;
  const legacyBySectorId = legacyPnlBySectorId(input.sectorOps);
  const env = isolatedShadowEnv(input.env);
  const { lookups } = input;
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
  for (const corp of lookups.corporations) {
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
      try {
        const sectorId = sector._id.toString();
        const { prepared } = prepareProducerPhysicalSector({
          worldEpoch,
          env,
          corporation: corp,
          sector: shadowOpeningSector(sector, worldEpoch, input.turn, carry?.plants[sectorId]),
          inputPriceHeadroom: PRICE_HEADROOM,
        });
        const sectorCountry = String(sector.countryId ?? corp.countryId ?? "");
        const plan = shadowCountryBooks(prepared.plan, sectorCountry);
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
      }
    }
  }

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

  // 3. Public buyers: the existing budget outlay times the plant economy's
  //    share of GDP, so only the plant market's slice of a budget is spent here.
  const states = await db
    .collection<{ _id: unknown; countryId?: string; gdp?: number }>("states")
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
    const share = plantEconomyShare(valueAdded, gdpPerTurn);
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
      const share = shareFor(countryId);
      const byCategory = Object.fromEntries(
        Object.entries(b.spending?.byCategory ?? {}).map(([k, v]) => [
          k,
          ((v as number) / rate) * share,
        ])
      );
      return {
        countryId,
        byCategory,
        plannedEconomy: isPlannedEconomy(countryId, lookups.eraYear ?? null, false),
        stateWeights: stateWeightsByCountry.get(countryId) ?? new Map(),
      };
    }),
    TURNS_PER_YEAR
  ).map((f) => ({
    ...f,
    lines: f.lines.map((l) => ({ ...l, book: shadowBook(l.book, l.commodity, f.countryId) })),
  }));
  const publicFunding = funding.reduce((s, f) => s + f.fundingLocal, 0);

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
    accounts.push({ id: `public:${f.countryId}`, cash: f.fundingLocal });
    roles.push({ id: `public:${f.countryId}`, kind: "public", countryId: f.countryId });
  }
  for (const id of householdForPayee.keys())
    if (!householdWallets.has(id)) {
      accounts.push({ id, cash: 0 });
      roles.push({ id, kind: "operatingPayee", countryId: "" });
    }
  const openingById = new Map(accounts.map((a) => [a.id, a.cash]));

  // 5. Orders and trade routes: world-book buyers only reach sellers in their
  //    own country or on routes the live trade matrix leaves open.
  const walletCountry = new Map(
    [...householdWallets.values()].map((w) => [w.accountId, w.countryId])
  );
  const households = householdDemandSpecs({
    wallets: [...householdWallets.values()],
    referencePrice: refPrice,
    priceHeadroom: PRICE_HEADROOM,
  }).map((h) => ({
    ...h,
    products: h.products.map((p) => ({
      ...p,
      book: shadowBook(p.book, p.commodity, walletCountry.get(h.accountId) ?? ""),
    })),
  }));
  const publicBuyerOrders = publicOrders(
    funding.map((f) => ({ accountId: `public:${f.countryId}`, lines: f.lines })),
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
    marketingBuyerLines(marketingBudgets, TURNS_PER_DAY),
    (c) => refPrice(c as CommodityType, ""),
    PRICE_HEADROOM
  ).map((o) => ({ ...o, id: `marketing:${o.accountId}` }));
  const routes = lookups.tradeRoutes;
  let eligibleOffersByOrder: Record<string, readonly string[]> | undefined;
  if (routes) {
    const open = (c: string, from: string, to: string) =>
      routes.affinityFor(c as CommodityType, from as never, to as never) > 0;
    const offers: RouteOffer[] = producers.flatMap((p) =>
      p.plan.outputs
        .filter((o) => o.book === "world")
        .map((o) => ({
          id: JSON.stringify([p.plan.id, "output", o.commodity]),
          commodity: o.commodity,
          sellerCountry: planCountry.get(p.plan.id) ?? "",
        }))
    );
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
    eligibleOffersByOrder = routeEligibility(orders, offers, open);
    const listFor = (commodity: string, country: string) =>
      routeEligibility([{ id: "x", commodity, buyerCountry: country }], offers, open).x;
    for (const h of households)
      for (const product of h.products)
        if (product.book === "world")
          (product as { eligibleOfferIds?: readonly string[] }).eligibleOfferIds = listFor(
            product.commodity,
            walletCountry.get(h.accountId) ?? ""
          );
    for (const o of publicBuyerOrders)
      if (o.book === "world")
        o.eligibleOfferIds = listFor(o.commodity, o.accountId.slice("public:".length));
    for (const o of marketingOrders)
      o.eligibleOfferIds = listFor(o.commodity, corpCountry.get(o.accountId) ?? "");
  }

  const references = Object.fromEntries(
    COMMODITY_TYPES.map((c) => [c, refPrice(c, "")] as const).filter(
      (e): e is readonly [CommodityType, number] => e[1] != null
    )
  );
  return {
    accounts,
    cashByCorp,
    eligibleOffersByOrder,
    firstWalletByCorp,
    funding,
    householdForPayee,
    householdSeed,
    householdWallets,
    households,
    marketingOrders,
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
 * collectors later, so the shadow must never write into them: it works on deep
 * copies and starts with no pending strikes.
 */
export function isolatedShadowEnv(env: ProducerPhysicalEnv): ProducerPhysicalEnv {
  return {
    ...env,
    labourDemandByState: structuredClone(env.labourDemandByState),
    labourDemandWageIndexByState: structuredClone(env.labourDemandWageIndexByState),
    wageIndexByState: structuredClone(env.wageIndexByState),
    automationIndexByState: structuredClone(env.automationIndexByState),
    pendingStrikeEvents: [],
  };
}

/**
 * The live world has not had the producer opening conversion, so its sectors
 * carry no producer generation or inventory. For the shadow only, give each a
 * copy with an opening stamped on last turn: the stock and receipt the previous
 * shadow turn left, or on a new run its existing stock carried as sellable
 * output. Never written back.
 */
export function shadowOpeningSector(
  sector: CorporateSector,
  worldEpoch: string,
  turn: number,
  carried?: ShadowPlantCarry
): CorporateSector {
  const opening = emptyProducerSectorOpening(worldEpoch, Math.max(0, turn - 1));
  if (carried)
    return {
      ...sector,
      capacityBookAnchor: sector.capacityBookAnchor ?? 0,
      buildQueue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
      producerCapacity: opening.producerCapacity,
      producerInventory: {
        ...opening.producerInventory,
        inputStock: carried.inputStock,
        outputStock: carried.outputStock,
      },
      producerSettlement: { ...carried.receipt, turn: turn - 1 },
    } as CorporateSector;
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
  return {
    ...sector,
    capacityBookAnchor: sector.capacityBookAnchor ?? 0,
    buildQueue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
    producerCapacity: opening.producerCapacity,
    producerInventory: { ...opening.producerInventory, outputStock },
  };
}
