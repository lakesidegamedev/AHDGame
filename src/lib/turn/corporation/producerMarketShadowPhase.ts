/**
 * Producer-market shadow phase (market recovery Phase 2, telemetry only).
 *
 * After the live corporation phase has computed this turn's sectors, prepare
 * every plant with the unified producer host and run the funded market in
 * memory: households seeded with a few turns of today's household spending and
 * paid this turn's wages, public buyers funded from the existing budget outlay.
 * Writes ONE summary document per turn to `producerMarketShadows` and nothing
 * else. It never moves money, never touches a sector or corporation, and a
 * failure is logged, never thrown into the turn.
 */
import { resolveSectorHostCurrencyCode } from "@/lib/currency/corporationCapital";
import type { CorporateSector } from "@/lib/db/types";
import { emptyProducerSectorOpening } from "@/lib/market/producerMarket/openingState";
import type { Db } from "mongodb";
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { eraScaledBasePrices } from "@/lib/constants/commodities";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  computeHouseholdConsumption,
  plantsHouseholdUnitScale,
} from "@/lib/turn/householdConsumption";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { householdDemandSpecs } from "@/lib/market/producerMarket/householdDemandRules";
import { HOUSEHOLD_OPENING_TURNS } from "@/lib/market/producerMarket/householdOpeningRules";
import { publicBuyerFunding } from "@/lib/market/producerMarket/publicBuyerRules";
import {
  publicOrders,
  runProducerShadow,
  type ShadowProducer,
} from "@/lib/market/producerMarket/shadowRules";
import { isPlannedEconomy } from "@/lib/constants/commandEconomy";
import {
  prepareProducerPhysicalSector,
  type ProducerPhysicalEnv,
} from "./producerPhysicalPreparation";
import type { CorporationLookups } from "./types";
import {
  routeEligibility,
  type RouteOffer,
  type RouteOrder,
} from "@/lib/market/producerMarket/routeRules";

export const PRODUCER_SHADOW_COLLECTION = "producerMarketShadows";
const PRICE_HEADROOM = 1.25;

export async function runProducerMarketShadowPhase(
  db: Db,
  input: {
    enabled: boolean;
    turn: number;
    worldEpoch: string | null | undefined;
    lookups: CorporationLookups;
    env: ProducerPhysicalEnv;
    /** This turn's sector writes; the legacy plantsPnl is read from them. */
    sectorOps: readonly unknown[];
  }
): Promise<void> {
  if (!input.enabled || !input.worldEpoch) return;
  try {
    const started = Date.now();
    const legacyBySectorId = legacyPnlBySectorId(input.sectorOps);
    const env = isolatedShadowEnv(input.env);
    const { lookups } = input;
    const base = eraScaledBasePrices(lookups.eraUnitScale);
    const refPrice = (commodity: CommodityType, stateId: string): number | null => {
      const ratio = isStateScopedCommodity(commodity)
        ? lookups.statePriceRatioByState?.get(stateId)?.get(commodity)
        : undefined;
      const r = ratio ?? lookups.priceRatioByCommodity.get(commodity) ?? 1;
      const p = base[commodity] * r;
      return Number.isFinite(p) && p > 0 ? p : null;
    };

    // 1. Prepare every producing plant with the new host.
    const producers: ShadowProducer[] = [];
    let skipped = 0;
    const cashByCorp = new Map<string, number>();
    const householdWallets = new Map<
      string,
      { accountId: string; stateId: string; countryId: string }
    >();
    const planCountry = new Map<string, string>();
    const operatingPayees = new Set<string>();
    const skipReasons: Record<string, number> = {};
    for (const corp of lookups.corporations) {
      for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
        try {
          const { prepared, walletScopes } = prepareProducerPhysicalSector({
            worldEpoch: input.worldEpoch,
            env,
            corporation: corp,
            sector: shadowOpeningSector(sector, input.worldEpoch, input.turn),
            inputPriceHeadroom: PRICE_HEADROOM,
          });
          // Legacy plantsPnl is in the sector host's currency; the shadow is in
          // anchor units, so convert before comparing.
          const legacyLocal = legacyBySectorId.get(sector._id.toString()) ?? null;
          const hostRate = lookups.exchangeRatesByCurrency.get(
            (resolveSectorHostCurrencyCode(sector, corp) ?? "USD") as never
          );
          const legacy =
            legacyLocal && hostRate && hostRate > 0
              ? { revenue: legacyLocal.revenue / hostRate, profit: legacyLocal.profit / hostRate }
              : null;
          producers.push({ plan: prepared.plan, sectorType: sector.sectorType, legacy });
          const rate = lookups.exchangeRatesByCurrency.get(
            (corp.liquidCurrencyCode ?? "USD") as never
          );
          cashByCorp.set(
            prepared.plan.accountId,
            rate && rate > 0 ? Math.max(0, (corp.liquidCapital ?? 0) / rate) : 0
          );
          const sectorCountry = String(sector.countryId ?? corp.countryId ?? "");
          planCountry.set(prepared.plan.id, sectorCountry);
          householdWallets.set(prepared.plan.labourRecipientAccountId, {
            accountId: prepared.plan.labourRecipientAccountId,
            stateId: sector.stateId,
            countryId: sectorCountry,
          });
          operatingPayees.add(prepared.plan.operatingRecipientAccountId);
          void walletScopes;
        } catch (error) {
          skipped++;
          const reason = error instanceof Error ? error.message : String(error);
          skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        }
      }
    }

    // 2. Household opening cash: a few turns of today's household spending.
    const states = await db
      .collection<{ _id: unknown; countryId?: string; gdp?: number; population?: number }>("states")
      .find({}, { projection: { countryId: 1, gdp: 1, population: 1 } })
      .toArray();
    const consumption = computeHouseholdConsumption({
      states: states.map((s) => ({
        stateId: String(s._id),
        countryId: s.countryId,
        gdp: s.gdp ?? 0,
        population: s.population ?? 0,
      })),
      metricsByState: new Map(
        [...(lookups.stateMetricsByState ?? new Map())].map(([id, m]) => [
          id,
          {
            medianIncome: m?.economic?.medianIncome?.value,
            unemploymentRate: m?.economic?.unemploymentRate?.value,
            consumerConfidence: m?.economic?.consumerConfidence?.value,
          },
        ])
      ),
      eraUnitScale: lookups.eraUnitScale,
      plantsUnitScale: plantsHouseholdUnitScale(lookups.preset),
    });
    const spendByState = new Map<string, number>();
    for (const [stateId, units] of consumption.byState) {
      let value = 0;
      for (const [c, u] of units) value += u * (refPrice(c, stateId) ?? 0);
      spendByState.set(stateId, value);
    }

    // 3. Public buyers from the existing budget outlay (anchor units).
    const stateWeightsByCountry = new Map<string, Map<string, number>>();
    for (const s of states)
      if (s.countryId) {
        const m = stateWeightsByCountry.get(s.countryId) ?? new Map<string, number>();
        m.set(String(s._id), Math.max(0, s.gdp ?? 0));
        stateWeightsByCountry.set(s.countryId, m);
      }
    const funding = publicBuyerFunding(
      lookups.federalBudgets.map((b) => {
        const rate = lookups.exchangeRatesByCurrency.get((b.currencyCode ?? "USD") as never) ?? 1;
        const byCategory = Object.fromEntries(
          Object.entries(b.spending?.byCategory ?? {}).map(([k, v]) => [k, (v as number) / rate])
        );
        return {
          countryId: String(b.countryId),
          byCategory,
          plannedEconomy: isPlannedEconomy(String(b.countryId), lookups.eraYear ?? null, false),
          stateWeights: stateWeightsByCountry.get(String(b.countryId)) ?? new Map(),
        };
      }),
      TURNS_PER_YEAR
    );
    const publicBuyers = funding.map((f) => ({
      accountId: `public:${f.countryId}`,
      lines: f.lines,
    }));

    // 4. Accounts: company cash, seeded households, funded public buyers, payees.
    const accounts = [
      ...[...cashByCorp].map(([id, cash]) => ({ id, cash })),
      ...[...householdWallets.values()].map((w) => ({
        id: w.accountId,
        cash: HOUSEHOLD_OPENING_TURNS * (spendByState.get(w.stateId) ?? 0),
      })),
      ...funding.map((f) => ({ id: `public:${f.countryId}`, cash: f.fundingLocal })),
      ...[...operatingPayees]
        .filter((id) => !householdWallets.has(id))
        .map((id) => ({ id, cash: 0 })),
    ];

    // 5. Trade routes: world-book buyers only reach sellers in their own
    //    country or on routes the live trade matrix leaves open.
    const households = householdDemandSpecs({
      wallets: [...householdWallets.values()],
      referencePrice: refPrice,
      priceHeadroom: PRICE_HEADROOM,
    });
    const publicBuyerOrders = publicOrders(
      publicBuyers,
      (c, book) => refPrice(c as CommodityType, book.startsWith("state:") ? book.slice(6) : ""),
      PRICE_HEADROOM
    );
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
      const walletCountry = new Map(
        [...householdWallets.values()].map((w) => [w.accountId, w.countryId])
      );
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
    }

    const references = Object.fromEntries(
      COMMODITY_TYPES.map((c) => [c, refPrice(c, "")] as const).filter(
        (e): e is readonly [CommodityType, number] => e[1] != null
      )
    );
    const summary = runProducerShadow({
      turn: input.turn,
      references,
      producers,
      skipped,
      accounts,
      households,
      publicOrders: publicBuyerOrders,
      eligibleOffersByOrder,
    });
    await db.collection(PRODUCER_SHADOW_COLLECTION).replaceOne(
      { _id: input.turn as never },
      {
        ...summary,
        legacyPrices: references,
        worldEpoch: input.worldEpoch,
        ms: Date.now() - started,
        at: new Date(),
      },
      { upsert: true }
    );
  } catch (error) {
    console.warn("[producerMarketShadow] shadow run failed (telemetry only):", error);
  }
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
 * copy with an opening stamped on last turn and its existing stock carried as
 * sellable output stock. Never written back.
 */
export function shadowOpeningSector(
  sector: CorporateSector,
  worldEpoch: string,
  turn: number
): CorporateSector {
  if (sector.producerCapacity && sector.producerInventory) return sector;
  const opening = emptyProducerSectorOpening(worldEpoch, Math.max(0, turn - 1));
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
