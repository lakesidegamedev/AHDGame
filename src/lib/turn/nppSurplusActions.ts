/** NPP surplus sweeps that sell stock, build party organisation and found corporations. */
import { deriveCeoArchetype } from "@/lib/turn/ceoArchetype";
import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { StatePartyOrg, NPP } from "@/lib/db/types";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import {
  preloadNppBuildOrgSweepCache,
  nppBuildPartyOrg,
} from "@/lib/nppAutonomy/v3/party/nppBuildOrg";
import { careerArchetypeModifiersContinuous } from "@/lib/nppAutonomy/v3/careerArchetype";
import { boundedParallelMap } from "@/lib/indexFunds/boundedParallelMap";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { resolveShareExecutionPrice } from "@/lib/corporations/marketExecution";
import { getSeedCurrencyCode, COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { equityPoolCurrency } from "@/lib/equities/marketPool";
import { nppSellShares } from "@/lib/nppAutonomy/v3/finance/nppShares";
import {
  volumeNormalizedMultipliers,
  stockSellOpportunity,
  OPPORTUNITY_SELL_CAP,
} from "@/lib/nppAutonomy/v6/rules/opportunityInvesting";
import { loadPrivateEnterpriseBlockedCountries } from "@/lib/economy/queries/privateEnterpriseGate";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import {
  foundingShortagePressure,
  foundingSweepCap,
  foundingChanceMultiplier,
  foundingSectorWeights,
  pickWeightedIndex,
} from "@/lib/turn/npp/foundingSectorChoice";
import { buildNppPriceSignals } from "@/lib/turn/npp/priceSignals";
import {
  type FoundingRecipeWorld,
  foundingLanePeakShortage,
  foundingRecipeFor,
} from "@/lib/turn/npp/foundingRecipeChoice";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { presetUsesTechDiffusion } from "@/lib/constants/techTree/diffusion";
import { loadTechDiffusionSnapshot } from "@/lib/corporations/techTree/diffusion";
import { type OperatingSectorType, OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";
import {
  computeSectorConcentration,
  challengerBoost,
} from "@/lib/turn/npp/rules/sectorConcentration";
import { nppFoundCorporation } from "@/lib/nppAutonomy/v3/finance/nppFoundCorporation";
import {
  countryScopeFilter,
  NPP_ACTION_RNG_SALT,
  groupInOrder,
  NPP_SWEEP_PARTITION_CONCURRENCY,
} from "./nppActionShared";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";

// v3 party-org building: counteracts processPartyOrgTurn's unconditional
// per-turn Org decay, which nothing has ever offset autonomously (growth was
// player-`/build-org`-only). Runs over EXISTING statePartyOrg rows with
// presence (not every possible state×party pair) — narrower scope than the
// player route, sufficient to stop the long-run decay-to-zero this exists to
// fix. Gated by campaignAggressionMult (org-building is a form of
// organizing/campaigning), same probability shape as the bond/stock sweeps.
export const NPP_BUILD_ORG_BASE_PROBABILITY = 0.15;

// v3 stock-sell: NPPs occasionally take profits / rebalance out of an
// existing position — the counterpart to the stock-BUY sweep above. Iterates
// corporations (bounded by corp count, not NPP count — far fewer corps than
// NPPs hold shares) rather than NPPs, since only a fraction of NPPs actually
// hold a position at any point. Flat base probability (portfolio rebalancing
// isn't strongly personality-driven the way investing IN is) rather than
// archetype-scaled.
export const NPP_STOCK_SELL_BASE_PROBABILITY = 0.02;

export const NPP_STOCK_SELL_FRACTION = 0.4;

// v3 corporation founding: the natural next step after buy/sell — a
// sufficiently wealthy, entrepreneurial NPP starts their own company. Gated
// on ceoArchetype (aggressive/innovator — high ambition — found more often
// than cautious/costCutter) rather than the political careerArchetype,
// since "should I become a CEO" is thematically a corporate-behavior
// decision. Funds threshold is FOUNDING_FEE × a buffer so an NPP doesn't
// spend down to exactly zero on a single roll. The fee is denominated in ₳
// and converted to local at the founder's home rate, so it costs the same real
// value everywhere. With the 1.5x buffer the bar is ₳11,250, about the
// richest 5 to 10% of NPPs given how tightly NPP cash clusters per country.
export const NPP_FOUNDING_FEE_ANCHOR = 7_500;

export const NPP_FOUNDING_FUNDS_BUFFER = 1.5;

export const NPP_FOUNDING_BASE_PROBABILITY_BY_ARCHETYPE: Record<
  ReturnType<typeof deriveCeoArchetype>,
  number
> = {
  // Autonomy bump (t834): roughly doubled from {0.08,0.06,0.02,0.01}. NPP corps
  // are economically negligible (~0.09% of total market cap) and now sorted to
  // the bottom of / hidden from the exchange list, so a faster organic founding
  // rate adds market texture without crowding players or moving prices.
  aggressive: 0.15,
  innovator: 0.12,
  cautious: 0.05,
  costCutter: 0.03,
};

// How many of the wealthiest eligible NPPs per cycle even get considered —
// bounds the query instead of scanning all NPPs for "funds above threshold".
// Raised 200 → 300 alongside the probability bump to widen organic founding.
export const NPP_FOUNDING_CANDIDATE_POOL = 300;

/**
 * v3 party-org-building sweep — the missing counteraction to
 * `processPartyOrgTurn`'s unconditional decay (see constant comment above).
 * Iterates EXISTING statePartyOrg rows with presence, samples an acting NPP per
 * row weighted by campaign aggression, and rolls a campaignAggressionMult-scaled
 * chance to have them trigger `nppBuildPartyOrg` for that row.
 *
 * Candidates are loaded once and grouped in memory, so the organiser varies
 * and the phase makes no per-row round trip.
 */
export async function buildNppPartyOrgSurplus(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null = null
): Promise<void> {
  const rows = await db
    .collection<StatePartyOrg>("statePartyOrg")
    .find(
      { hasPresence: true, ...countryScopeFilter(countryScope) },
      { projection: { countryId: 1, stateId: 1, partyId: 1 } }
    )
    .toArray();
  if (rows.length === 0) return;

  // One query for every possible actor, grouped by the same key the rows use.
  const actorsByKey = new Map<string, Pick<NPP, "_id" | "personality">[]>();
  {
    const actorCursor = (await getNppsCollection(db)).find(
      {
        retiredAt: null,
        homeState: { $in: [...new Set(rows.map((r) => r.stateId))] },
        ...countryScopeFilter(countryScope),
      },
      { projection: { _id: 1, personality: 1, countryId: 1, homeState: 1, party: 1 } }
    );
    for await (const actor of actorCursor) {
      const key = `${actor.countryId ?? "US"}:${actor.homeState}:${actor.party}`;
      const list = actorsByKey.get(key) ?? [];
      list.push(actor);
      actorsByKey.set(key, list);
    }
    // Stable order so the weighted sample below is reproducible.
    for (const list of actorsByKey.values()) {
      list.sort((a, b) => (a._id.toString() < b._id.toString() ? -1 : 1));
    }
  }

  const rng = makeSeededRng(`npp-build-org:${currentTurn}${NPP_ACTION_RNG_SALT}`);

  // Immutable per-sweep inputs (national party docs, chair shields, state
  // price multipliers) loaded once; mutable state-party org/PS/treasury,
  // pressure, and gates stay live per action inside `nppBuildPartyOrg`.
  const sweepCountries = [...new Set(rows.map((r) => r.countryId as CountryId))];
  const sweepCache = await preloadNppBuildOrgSweepCache(db, sweepCountries);

  const builds: { actorId: ObjectId; countryId: CountryId; stateId: string; partySeq: number }[] =
    [];
  for (const row of rows) {
    const countryId = row.countryId as CountryId;
    const partySeq = Number(row.partyId);
    if (!Number.isFinite(partySeq)) continue;

    const pool = actorsByKey.get(`${countryId}:${row.stateId}:${row.partyId}`) ?? [];
    if (pool.length === 0) continue;

    // Sample the organiser weighted by campaign aggression — the local firebrand
    // is more likely to be the one doing the work, not guaranteed to be.
    const weights = pool.map((a) =>
      Math.max(0.01, careerArchetypeModifiersContinuous(a.personality).campaignAggressionMult)
    );
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = rng() * total;
    let actor = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        actor = pool[i];
        break;
      }
    }

    const { campaignAggressionMult } = careerArchetypeModifiersContinuous(actor.personality);
    if (rng() >= NPP_BUILD_ORG_BASE_PROBABILITY * campaignAggressionMult) continue;

    builds.push({ actorId: actor._id, countryId, stateId: row.stateId, partySeq });
  }

  // Every draw above reads only preloaded data, so the decisions are fixed
  // before anything is written. A build reads and writes only its own
  // country's parties, state org rows, pressure and treasuries, so countries
  // run concurrently while each keeps the original row order.
  await boundedParallelMap(
    groupInOrder(builds, (build) => build.countryId),
    NPP_SWEEP_PARTITION_CONCURRENCY,
    async (countryBuilds) => {
      for (const build of countryBuilds) {
        await nppBuildPartyOrg(
          db,
          build.actorId,
          build.countryId,
          build.stateId,
          build.partySeq,
          currentTurn,
          sweepCache
        );
      }
    }
  );
}

/**
 * v3 stock-sell sweep — the counterpart to `investNppStockSurplus`. Iterates
 * corporations (bounded by corp count) rather than NPPs, since only a
 * fraction of NPPs actually hold a share position at any point — far
 * cheaper than scanning every NPP to find the ones who happen to hold
 * stock. Batches the NPP-countryId lookup (needed by nppSellShares' home-
 * currency scope check) into one query rather than per-holding.
 * Excludes a corp's own CEO from selling THAT corp's stock: the flat
 * probability and fraction that trim a passive holder's position would sell
 * millions of shares of a CEO's controlling stake in one action, which is a
 * different decision this sweep was not designed for.
 */
export async function sellNppStockSurplus(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null = null,
  preset?: string,
  engine6 = false
): Promise<void> {
  const corps = await (
    await getCorporationsCollection(db)
  )
    .find(
      { "shareholders.nppId": { $exists: true }, ...countryScopeFilter(countryScope) },
      // Price fields widen the projection but not the query — same round trip,
      // and they turn a blind coin flip into an actual sell decision.
      {
        projection: {
          shareholders: 1,
          ceoId: 1,
          countryId: 1,
          isPrivate: 1,
          isNationalized: 1,
          countryOwnerId: 1,
          sharePrice: 1,
          fundamentalSharePrice: 1,
          totalShares: 1,
          publicFloat: 1,
          liquidCurrencyCode: 1,
          shareBuybackMode: 1,
        },
      }
    )
    .toArray();
  if (corps.length === 0) return;

  const nppIdByString = new Map<string, ObjectId>();
  for (const corp of corps) {
    for (const sh of corp.shareholders ?? []) {
      if (sh.nppId && (sh.shares ?? 0) > 0) nppIdByString.set(sh.nppId.toString(), sh.nppId);
    }
  }
  if (nppIdByString.size === 0) return;

  const nppDocs = await (
    await getNppsCollection(db)
  )
    .find(
      { _id: { $in: [...nppIdByString.values()] } },
      { projection: { countryId: 1, personality: 1 } }
    )
    .toArray();
  const countryById = new Map(nppDocs.map((n) => [n._id.toString(), n.countryId]));
  const personalityById = new Map(nppDocs.map((n) => [n._id.toString(), n.personality]));

  const rng = makeSeededRng(`npp-stock-sell:${currentTurn}${NPP_ACTION_RNG_SALT}`);
  const fxByCcy = await loadFxRatesByCurrency(db);

  const sales: {
    corp: (typeof corps)[number];
    holding: NonNullable<(typeof corps)[number]["shareholders"]>[number];
    nppId: ObjectId;
    countryId: CountryId;
    sharesToSell: number;
    homeRate: number;
  }[] = [];
  // Every holding that may be sold, with its price signal and engine 5 chance.
  // A risk-tolerant holder is slower to bail; a cautious one takes the gain.
  const candidates: {
    corp: (typeof corps)[number];
    holding: NonNullable<(typeof corps)[number]["shareholders"]>[number];
    nppId: ObjectId;
    priceRatio: number;
    riskMult: number;
  }[] = [];
  for (const corp of corps) {
    // Sell pressure responds to price. Above fundamentals, NPPs take profits;
    // underwater, they sit on the position. That's loss aversion, and it's what
    // makes a flat 3% coin flip stop looking like a random number generator with
    // a brokerage account.
    const execPrice = resolveShareExecutionPrice(corp);
    const fundamental = corp.fundamentalSharePrice ?? execPrice;
    const priceRatio =
      execPrice > 0 && fundamental > 0 ? Math.min(Math.max(execPrice / fundamental, 0.5), 2.5) : 1;

    for (const holding of corp.shareholders ?? []) {
      if (!holding.nppId || (holding.shares ?? 0) <= 0) continue;
      if (corp.ceoId?.equals(holding.nppId)) continue; // never sweep-sell a CEO's own stake

      const personality = personalityById.get(holding.nppId.toString());
      const riskMult = personality
        ? careerArchetypeModifiersContinuous(personality).riskToleranceMult
        : 1;
      candidates.push({ corp, holding, nppId: holding.nppId, priceRatio, riskMult });
    }
  }

  // Engine 5 scales each chance by the clamped price ratio. At v6 (NPP engine
  // 6) the response to overvaluation is sharper, normalized so the expected
  // number of sales over these holdings is the engine 5 one and no holding's
  // chance exceeds the engine 5 ceiling; see v6/rules/opportunityInvesting.ts.
  const sellProbabilities = engine6
    ? v6SellProbabilities(candidates)
    : candidates.map((c) => NPP_STOCK_SELL_BASE_PROBABILITY * c.priceRatio * (2 - c.riskMult));

  for (const [i, { corp, holding, nppId, priceRatio }] of candidates.entries()) {
    if (rng() >= sellProbabilities[i]) continue;

    // Trim size varies with conviction rather than being a flat half every time.
    const sellFraction = NPP_STOCK_SELL_FRACTION * Math.min(Math.max(priceRatio, 0.6), 1.4);
    const sharesToSell = Math.floor(holding.shares * Math.min(sellFraction, 1));
    if (sharesToSell < 1) continue;

    const countryId = countryById.get(nppId.toString()) as CountryId | undefined;
    if (!countryId) continue;
    const homeCurrency = preset
      ? getSeedCurrencyCode(countryId as CountryId, preset)
      : (COUNTRY_CURRENCY_MAP[countryId as CountryId] ?? "USD");
    const homeRate = fxByCcy.get(homeCurrency) ?? 1;

    sales.push({ corp, holding, nppId, countryId, sharesToSell, homeRate });
  }

  // Each draw above reads only the preloaded book, so the sales are fixed
  // before any executes. A sale's price and settlement read and write its
  // currency's equity pool, the corporation and its NPP holder, and NPPs trade
  // only in their home currency, so currencies run concurrently while each
  // keeps the original order.
  await boundedParallelMap(
    groupInOrder(sales, (sale) => equityPoolCurrency(sale.corp)),
    NPP_SWEEP_PARTITION_CONCURRENCY,
    async (currencySales) => {
      for (const { corp, holding, nppId, countryId, sharesToSell, homeRate } of currencySales) {
        // Proceeds credit nppInvestmentCashAnchor (the forex account), not funds.
        const result = await nppSellShares(
          db,
          { _id: nppId, countryId },
          corp._id,
          sharesToSell,
          currentTurn,
          homeRate,
          corp,
          preset
        );
        if (result.ok) {
          corp.publicFloat = (corp.publicFloat ?? 0) + sharesToSell;
          holding.shares -= sharesToSell;
        }
      }
    }
  );
}

/** Per-holding v6 sell chances; see the call site in `sellNppStockSurplus`. */
export function v6SellProbabilities(
  candidates: readonly { priceRatio: number; riskMult: number }[]
): number[] {
  const base = candidates.map((c) => NPP_STOCK_SELL_BASE_PROBABILITY * (2 - c.riskMult));
  const multipliers = volumeNormalizedMultipliers(
    candidates.map((c) => stockSellOpportunity(c.priceRatio)),
    base,
    candidates.reduce((sum, c, i) => sum + base[i] * c.priceRatio, 0),
    OPPORTUNITY_SELL_CAP
  );
  return base.map((p, i) => p * multipliers[i]);
}

/**
 * v3 corporation-founding sweep — the natural next step after buy/sell lets
 * NPPs accumulate capital. Bounds the candidate pool to the N wealthiest
 * NPPs (query, not a full scan) rather than checking all NPPs for "funds
 * above threshold". Sector type is picked deterministically (seeded roll
 * over CORPORATION_TYPES), weighted toward sectors whose outputs are short in
 * the founder's market and away from country-sectors already crowded with
 * companies (see foundingSectorChoice.ts). A uniform pick spread companies
 * evenly over sectors whatever the market needed.
 */
export async function foundNppCorporationsSurplus(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null = null,
  preset?: string
): Promise<void> {
  // Founding draws from the personal forex account (₳). Pre-filter the pool by
  // ₳ investment capital; the core enforces exact per-NPP affordability (the
  // local fee is converted back at the home rate there).
  const minFunds = NPP_FOUNDING_FEE_ANCHOR * NPP_FOUNDING_FUNDS_BUFFER;
  const fxByCcy = await loadFxRatesByCurrency(db);
  const homeRateOf = (countryId: CountryId): number => {
    const currency = preset
      ? getSeedCurrencyCode(countryId, preset)
      : (COUNTRY_CURRENCY_MAP[countryId] ?? "USD");
    return fxByCcy.get(currency) ?? 1;
  };
  // v4 autonomy sets `econScopeCountries` to null (global), which removed the
  // only barrier that had been keeping the NPP economic brain out of planned
  // economies: the v3 scope was a player-enablement rail, never a
  // command-economy gate. Resolve the live blocked set from the marketization
  // dial so a country converting in either direction is honoured with no code
  // change. One gameState read plus one federalBudget $in, once per sweep.
  const blockedSet = await loadPrivateEnterpriseBlockedCountries(db);
  const blockedCountries = [...blockedSet];
  const candidates = await (
    await getNppsCollection(db)
  )
    .find(
      {
        retiredAt: null,
        nppInvestmentCashAnchor: { $gte: minFunds },
        ...countryScopeFilter(countryScope),
        // Applied last and combined explicitly: `countryScopeFilter` writes its
        // own `countryId` key, so a second one here would silently clobber it.
        ...(countryScope
          ? { countryId: { $in: countryScope, $nin: blockedCountries } }
          : { countryId: { $nin: blockedCountries } }),
      },
      {
        projection: {
          countryId: 1,
          party: 1,
          homeState: 1,
          personality: 1,
          nppInvestmentCashAnchor: 1,
        },
      }
    )
    .sort({ nppInvestmentCashAnchor: -1 })
    .limit(NPP_FOUNDING_CANDIDATE_POOL)
    .toArray();
  if (candidates.length === 0) return;

  // Already-CEO exclusion, batched: one $in query over the whole pool instead
  // of one findOne per RNG-passing candidate (pool up to 300). Same filter
  // semantics as the per-row check it replaces, ids-only projection. The
  // command core keeps its own guarded check, so a founding between preload
  // and write stays excluded. No RNG consumed here, so the per-candidate
  // stream below is untouched.
  const alreadyCeoIds = new Set<string>();
  {
    const rows = await (
      await getCorporationsCollection(db)
    )
      .find(
        { ceoId: { $in: candidates.map((c) => c._id) }, ceoVacant: { $ne: true } },
        { projection: { ceoId: 1 } }
      )
      .toArray();
    for (const row of rows) {
      if (row.ceoId) alreadyCeoIds.add(row.ceoId.toString());
    }
  }

  const rng = makeSeededRng(`npp-found-corp:${currentTurn}${NPP_ACTION_RNG_SALT}`);

  // Sector choice follows the market: one price read and one count per sweep.
  const priceDocs = await db.collection<CommodityPrice>("commodityPrices").find({}).toArray();
  // Entry answers shortage: the more markets run short, the more NPPs try to
  // found and the more foundings one sweep may complete.
  const shortagePressure = foundingShortagePressure(
    priceDocs.map((p) => (p.basePrice && p.globalPrice ? p.globalPrice / p.basePrice : null))
  );
  const maxFoundings = foundingSweepCap(shortagePressure);
  const chanceMultiplier = foundingChanceMultiplier(shortagePressure);
  let founded = 0;
  const { priceRatioOf } = buildNppPriceSignals(new Map(priceDocs.map((p) => [p.commodity, p])));
  // Funded producer market: founding picks the recipe whose outputs are short,
  // and a lane's shortage counts every recipe it can run. Legacy worlds keep
  // the standard recipe and the static sector table.
  const world = await (
    await getGameStateCollection(db)
  ).findOne(
    { _id: "current" },
    {
      projection: {
        worldEpochId: 1,
        producerOpening: 1,
        currentYear: 1,
        startingYear: 1,
        currentTurn: 1,
        preset: 1,
      },
    }
  );
  const fundedWorld =
    world?.producerOpening != null && world.producerOpening.worldEpoch === world.worldEpochId;
  const recipeWorld: FoundingRecipeWorld = {
    currentYear:
      world?.currentYear ??
      (world?.startingYear ?? STARTING_YEAR) +
        Math.floor(((world?.currentTurn ?? currentTurn) - 1) / TURNS_PER_YEAR),
    techTreesEnabled: true,
    // Diffusion worlds: an AI founding adopts at its country's lag.
    techDiffusion:
      world && presetUsesTechDiffusion(world.preset)
        ? await loadTechDiffusionSnapshot(db)
        : undefined,
  };
  // Group canonical persisted identities by the operating lane used by founding.
  const operatingLaneExpression = (typeField: string) => ({
    $switch: {
      branches: [
        {
          case: {
            $and: [{ $eq: [typeField, "manufacturing"] }, { $eq: ["$industryModel", "vehicles"] }],
          },
          then: "manufacturing_vehicles",
        },
        {
          case: {
            $and: [
              { $eq: [typeField, "media"] },
              { $eq: ["$mediaDiscriminator", "entertainment"] },
            ],
          },
          then: "media_entertainment",
        },
      ],
      default: typeField,
    },
  });
  const cellCounts = await (
    await getCorporationsCollection(db)
  )
    .aggregate<{ _id: { c: string; t: string }; n: number }>([
      { $group: { _id: { c: "$countryId", t: operatingLaneExpression("$type") }, n: { $sum: 1 } } },
    ])
    .toArray();
  const existingByCell = new Map<string, number>(
    cellCounts.map((row) => [`${row._id.c}:${row._id.t}`, row.n])
  );
  const existingCount = (countryId: string, type: OperatingSectorType) =>
    existingByCell.get(`${countryId}:${type}`) ?? 0;
  // Capacity per firm per sector, world-wide, so a sector one firm dominates
  // draws new founders. One grouped read per sweep.
  const capacityRows = await (
    await getCorporateSectorsCollection(db)
  )
    .aggregate<{ _id: { t: string; c: ObjectId }; w: number }>([
      {
        $group: {
          _id: { t: operatingLaneExpression("$sectorType"), c: "$corporationId" },
          w: { $sum: { $ifNull: ["$capitalStock", 0] } },
        },
      },
    ])
    .toArray();
  const concentrationBySector = computeSectorConcentration(
    capacityRows.map((row) => ({
      sectorType: row._id.t,
      corporationId: row._id.c.toString(),
      weight: row.w,
    }))
  );

  for (const npp of candidates) {
    const archetype = deriveCeoArchetype(npp.personality);
    if (founded >= maxFoundings) break;
    if (rng() >= NPP_FOUNDING_BASE_PROBABILITY_BY_ARCHETYPE[archetype] * chanceMultiplier) continue;

    if (alreadyCeoIds.has(npp._id.toString())) continue;

    const homeCountryForSector = (npp.countryId ?? "US") as CountryId;
    const weights = foundingSectorWeights({
      types: OPERATING_SECTOR_TYPES as readonly OperatingSectorType[],
      countryId: homeCountryForSector,
      priceRatioOf,
      existingCount,
      challengerBoostOf: (type) => challengerBoost(concentrationBySector.get(type)),
      ...(fundedWorld
        ? {
            peakShortageOf: (type: OperatingSectorType) =>
              foundingLanePeakShortage(type, homeCountryForSector, priceRatioOf, recipeWorld),
          }
        : {}),
    });
    const sectorType = OPERATING_SECTOR_TYPES[
      pickWeightedIndex(weights, rng())
    ] as OperatingSectorType;
    const initialStrategyId = fundedWorld
      ? foundingRecipeFor(sectorType, homeCountryForSector, priceRatioOf, recipeWorld)
      : undefined;
    const cell = `${homeCountryForSector}:${sectorType}`;
    existingByCell.set(cell, (existingByCell.get(cell) ?? 0) + 1);

    const homeCountry = (npp.countryId ?? "US") as CountryId;
    const homeRate = homeRateOf(homeCountry);
    const outcome = await nppFoundCorporation(
      db,
      npp,
      sectorType,
      NPP_FOUNDING_FEE_ANCHOR * homeRate,
      currentTurn,
      homeRate,
      blockedSet,
      preset,
      initialStrategyId
    );
    if (outcome.ok) founded++;
  }
}
