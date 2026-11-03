import { corpToSectorCountrySpread } from "@/lib/currency/sectorFxSpread";
import { NextResponse } from "next/server";
import {
  buildRoomUnits,
  loadBuildRoomContext,
  loadCountryQueuedUnits,
  queuedUndeliveredUnits,
  supplyMixSharesCountryDemand,
} from "@/lib/corporations/buildRoom";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import {
  SPLIT_BASE_CAPTURE_FRACTION,
  UNOWNED_CAPTURE_BONUS_MULTIPLIER,
  MS_CAPTURE_DIVISOR,
  isOperatingSectorType,
  operatingSectorIdentity,
} from "@/lib/constants/corporations";
import type {
  Character,
  CorporateSector,
  GameState,
  SectorBuildOrder,
  StateMetrics,
  UnownedSector,
  State,
  Corporation,
  GameConfig,
} from "@/lib/db/types";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { computeUnownedHeadroomUnits } from "@/lib/market/unownedHeadroom";
import { getStrategyForOperatingModel } from "@/lib/constants/sectorStrategies";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { resolveCountryPrimeRates } from "@/lib/corporations/sectorGrowthCost";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import {
  evaluateMarketEntry,
  quoteFoundingEntry,
  type FoundingQuote,
  type FoundingQuoteInputs,
} from "@/lib/corporations/rules/marketEntry";
import { loadFoundingTechEffects } from "@/lib/corporations/foundingTechEffects";
import { corporationActionsPause } from "@/lib/corporations/corporationActionsPause";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  corpLiquidCapitalToAnchor,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";

import type { CountryId } from "@/lib/constants/countries";
import { calculateSplitCostAnchor } from "@/lib/corporations/marketActionCosts";
import { loadCommandEconomyBlockedCountries } from "@/lib/economy/queries/commandEconomyMarketGate";
import { resolvePresetIdFromGameState } from "@/lib/world/countryReadinessContract";
import { pinStateInTopSuggestions } from "@/lib/corporations/expandSuggestionPin";
import { fetchCorporationNationalSectorSharesByCountry } from "@/lib/corporations/marketShare";
import {
  retailCapacityExpansionPaused,
  retailDemandTransitionTurnsRemaining,
} from "@/lib/market/retailDemandTransition";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type SuggestionMode = "unowned" | "playerCorp";
type OwnershipFilter = "all" | "owned" | "unowned";

/**
 * GET /api/corporations/[id]/expand-suggestions?sectorType=xxx&mode=unowned|playerCorp&ownership=all|owned|unowned
 * Returns up to 5 states with the best market opportunity for the given sector type.
 * mode=unowned (default): sorted by estimated capture from the unowned pool.
 * mode=playerCorp: sorted by total competitor revenue — markets with active player corps.
 * ownership (default all): owned = only states this corp already operates a sector in;
 *   unowned = only states it has not entered. Applied BEFORE the top-N slice so the
 *   best owned/new markets surface rather than being hidden behind the global top-N.
 * state (optional): pin this stateId into the returned top-N (Build-here deep link).
 * Includes competitor corporations already operating in each state.
 *
 * Plants worlds also return, per market, the entry verdict from
 * `evaluateMarketEntry` (the rules the founding command enforces) and the room
 * to build in capacity units, kept apart from the legacy unowned revenue pool.
 * CEO only.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const requestedLane = url.searchParams.get("sectorType");
    const modeParam = url.searchParams.get("mode") ?? "unowned";
    const mode: SuggestionMode = modeParam === "playerCorp" ? "playerCorp" : "unowned";
    const ownershipParam = url.searchParams.get("ownership") ?? "all";
    const ownership: OwnershipFilter =
      ownershipParam === "owned" ? "owned" : ownershipParam === "unowned" ? "unowned" : "all";
    // Optional comma-separated country filter. When set, the top-N is taken
    // WITHIN these countries (revealing markets outside the global top-N);
    // `availableCountries` in the response always lists every country with a
    // market in this sector, so the UI can show all of them regardless.
    const countrySet = new Set(
      (url.searchParams.get("country") ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    );
    // Optional deep-link pin from the state board "Build here" CTA.
    const pinStateId = (url.searchParams.get("state") ?? "").trim() || null;

    if (!isOperatingSectorType(requestedLane)) {
      return errorResponse(400, "Invalid or missing sectorType");
    }
    const lane = requestedLane;

    const { id } = await params;
    const db = await getDb();

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;
    const { sectorType, industryModel, mediaDiscriminator } = operatingSectorIdentity(lane);
    const marketFilter = { sectorType, industryModel, mediaDiscriminator };
    const operatingType = lane;

    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;

    const plantsMode = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
    const gameStateDoc = await db.collection<GameState>("gameState").findOne({ _id: "current" });
    const currentTurn = gameStateDoc?.currentTurn ?? 0;

    // Greenfield Retail builds are deliberately unavailable while the legacy
    // supply-derived demand is fading out. Reject before calculating and
    // presenting opportunities so the modal explains the pause instead of
    // inviting a build that the command will later refuse. Competitor mode is
    // still available because sector attacks transfer existing plants; its rows
    // carry the pause as their entry verdict instead.
    let retailPauseTurnsRemaining: number | null = null;
    if (plantsMode && sectorType === "retail") {
      const transition = await db.collection<GameConfig>("gameConfig").findOne(
        { _id: "default" },
        {
          projection: {
            retailDemandTransitionStartTurn: 1,
            retailDemandTransitionTurns: 1,
          },
        }
      );
      if (retailCapacityExpansionPaused(transition, currentTurn)) {
        retailPauseTurnsRemaining = retailDemandTransitionTurnsRemaining(transition, currentTurn);
        if (mode === "unowned") {
          return errorResponse(
            409,
            `New Retail sectors are paused while consumer demand is rebalanced (${retailPauseTurnsRemaining} turns remaining). Existing stores and plant transfers still operate normally.`
          );
        }
      }
    }

    // Demand gap for this sector type's output mix, per physical market (mean
    // over legs so one balanced line does not veto answering a deep shortage
    // in another — demand audit step 4). Most outputs use the candidate
    // country's reachable book;
    // state-local outputs use the candidate state's own balance.
    // unowned pool's headroom is claimable market SHARE, not buyers; ranking
    // and labelling it "untapped demand" steered players straight into gluts
    // (ticket #1027 follow-up).
    //
    // Scoped to each candidate market's own REACHABLE book rather than the world
    // aggregate (ticket #1077). The aggregate summed supply behind embargo walls
    // and supply from countries outside COUNTRY_ORDER that trade with nobody, so
    // a market running a real shortage read as a glut and every state on Earth
    // quoted "room for 0". A market a corporation cannot sell into must not
    // suppress the quote for one it can.
    const supplyMix =
      getStrategyForOperatingModel(sectorType, "standard", industryModel, mediaDiscriminator)
        .supply ?? {};
    const buildRoom = plantsMode ? await loadBuildRoomContext(db) : null;
    const countrySharedDemand = plantsMode && supplyMixSharesCountryDemand(supplyMix);
    const demandGapUnitsByState = new Map<string, number>();
    const demandGapUnitsByCountry = new Map<string, number>();
    const demandGapUnitsFor = (stateId: string, countryId: string): number => {
      if (!buildRoom) return Number.POSITIVE_INFINITY;
      const cache = countrySharedDemand ? demandGapUnitsByCountry : demandGapUnitsByState;
      const key = countrySharedDemand ? countryId : stateId;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const gap = buildRoom.demandGapUnits(supplyMix, stateId, countryId);
      cache.set(key, gap);
      return gap;
    };

    const { ObjectId } = await import("mongodb");
    const ms = corporation.marketingStrength ?? 0;
    const liquidCapital = corporation.liquidCapital ?? 0;
    const captureMultiplier = 1 + ms / MS_CAPTURE_DIVISOR;
    const fxByCurrency = await loadFxRatesByCurrency(db);
    const corpFx = fxRateForCorpFromMap(corporation, fxByCurrency);
    const liquidCurrencyCode = resolveCorpLiquidCurrencyCode(corporation);
    // Unrounded for the entry verdict so it compares exactly what the command does.
    const liquidCapitalAnchorExact = corpLiquidCapitalToAnchor(liquidCapital, corporation, corpFx);
    const liquidCapitalAnchor = Math.round(liquidCapitalAnchorExact);

    let stateIds: string[];

    if (mode === "playerCorp") {
      // Find states where competitor corps operate in this sector type
      const competitorSectors = await db
        .collection<CorporateSector>("corporateSectors")
        .find({
          ...marketFilter,
          corporationId: { $ne: corporation._id },
        })
        .project<{ stateId: string }>({ stateId: 1 })
        .toArray();

      stateIds = [...new Set(competitorSectors.map((s) => s.stateId))];
    } else {
      // Find states with unowned revenue pools
      const unownedIds = await db
        .collection<UnownedSector>("unownedSectors")
        // A plants market can be a valid greenfield build even before it earns
        // revenue. Filtering those rows out made zero-revenue markets vanish
        // from the only UI that can found their first plant.
        .find(plantsMode ? marketFilter : { ...marketFilter, revenue: { $gt: 0 } })
        .project<{ stateId: string }>({ stateId: 1 })
        .toArray();

      stateIds = [...new Set(unownedIds.map((u) => u.stateId))];
    }

    if (stateIds.length === 0) {
      return NextResponse.json({
        suggestions: [],
        availableCountries: [],
        liquidCapital: liquidCapitalAnchor,
        liquidCurrencyCode,
      });
    }

    // Fetch all relevant data for the candidate states in parallel
    const [states, ownedSectors, siblingCorpSectors, unownedSectors] = await Promise.all([
      db
        .collection<State>("states")
        .find({ _id: { $in: stateIds } }, { projection: { _id: 1, name: 1, countryId: 1 } })
        .toArray(),
      db
        .collection<CorporateSector>("corporateSectors")
        .find({ corporationId: corporation._id, ...marketFilter, stateId: { $in: stateIds } })
        .project<{ _id: string; stateId: string }>({ _id: 1, stateId: 1 })
        .toArray(),
      db
        .collection<CorporateSector>("corporateSectors")
        .find({ ...marketFilter, stateId: { $in: stateIds } })
        .project<{
          corporationId: string;
          stateId: string;
          revenue: number;
          buildQueue?: SectorBuildOrder[];
        }>({
          corporationId: 1,
          stateId: 1,
          revenue: 1,
          buildQueue: 1,
        })
        .toArray(),
      db
        .collection<UnownedSector>("unownedSectors")
        .find({ ...marketFilter, stateId: { $in: stateIds } })
        .toArray(),
    ]);

    // Loaded in competitor mode too under plants: a command-economy row there
    // is still shown, but its entry verdict must say it is closed.
    const commandEconomyBlockedCountries =
      mode === "unowned" || plantsMode
        ? await loadCommandEconomyBlockedCountries(
            db,
            states.map((s) => s.countryId)
          )
        : new Set<CountryId>();

    // Fetch competitor corporation details by ObjectId
    const competitorCorpIds = [
      ...new Set(
        siblingCorpSectors
          .filter((s) => s.corporationId.toString() !== corporation._id.toString())
          .map((s) => s.corporationId.toString())
      ),
    ];
    const validCompetitorIds = competitorCorpIds
      .filter((cid) => ObjectId.isValid(cid))
      .map((cid) => new ObjectId(cid));
    const competitorCorpsById =
      validCompetitorIds.length > 0
        ? await db
            .collection<Corporation>("corporations")
            .find({ _id: { $in: validCompetitorIds } })
            .project<{
              _id: { toString(): string };
              name: string;
              sequentialId?: number;
              logoUrl?: string;
              brandColor?: string;
              countryId?: string;
              liquidCurrencyCode?: string;
            }>({
              _id: 1,
              name: 1,
              sequentialId: 1,
              logoUrl: 1,
              brandColor: 1,
              countryId: 1,
              liquidCurrencyCode: 1,
            })
            .toArray()
        : [];
    const corpRefMap = new Map(competitorCorpsById.map((c) => [c._id.toString(), c]));
    const competitorFxByCorpId = new Map(
      competitorCorpsById.map((c) => [
        c._id.toString(),
        {
          code: resolveCorpLiquidCurrencyCode(c),
          rate: fxRateForCorpFromMap(c, fxByCurrency),
        },
      ])
    );

    // Command economies (USSR, East Germany, etc — and China pre-reform when
    // the marketization feature is on) run production through the state, not
    // private corporations. An "unowned" market there isn't a private-capture
    // opportunity, it's a modeling gap — exclude those states from the
    // unowned-mode candidate pool BEFORE building stateMap/availableCountries
    // so neither the suggestions nor the country filter chips surface them.
    // playerCorp mode is untouched — seeing which corps (including SOEs)
    // already compete somewhere is legitimate info either way.
    // Cross-border founding is allowed under plants (as it already was pre-plants):
    // the founding command and buildCapacity both price the host country's prime
    // rate and charge the cross-currency spread, so a foreign market is a real,
    // fully-modelled option. The only hard exclusion is command-economy countries,
    // whose "unowned" markets are a modeling gap rather than a capture opportunity.
    const eligibleStates = states.filter(
      (state) =>
        mode !== "unowned" || !commandEconomyBlockedCountries.has(state.countryId as CountryId)
    );

    // Build lookup maps
    const stateMap = new Map(eligibleStates.map((s) => [s._id, s]));

    // Every country with a candidate market in this sector (pre-filter), so the
    // UI can offer all of them as filter chips, not just the global top-N.
    const availableCountries = [
      ...new Set(eligibleStates.map((s) => s.countryId).filter(Boolean)),
    ].sort();
    const ownedStateMap = new Map(ownedSectors.map((s) => [s.stateId, s._id.toString()]));
    const unownedMap = new Map(unownedSectors.map((u) => [u.stateId, u]));

    // ─── Plants: what entering this market actually costs and delivers ───────
    //
    // Under plants, founding is a FIRST BUILD (see expandSector): an entry fee
    // plus a discounted starter build that ARRIVES after a construction lag.
    //
    // Priced through `quoteFoundingEntry` with tech effects from
    // `loadFoundingTechEffects`, the exact pair expandSector charges with, so
    // the modal's quote and the command's charge cannot drift. A preview that
    // disagrees with the confirm is worse than no preview.
    const eraUnitScale = await loadWorldEraUnitScale(db);

    let envelopeQuote: FoundingQuote | null = null;
    const quoteByState = new Map<string, FoundingQuote>();

    if (plantsMode) {
      const currentYear =
        gameStateDoc?.currentYear ??
        STARTING_YEAR + Math.floor((Math.max(1, currentTurn) - 1) / TURNS_PER_YEAR);
      const worldPreset = resolvePresetIdFromGameState(gameStateDoc);
      const identity = { sectorType, industryModel, mediaDiscriminator };
      const techEffects = await loadFoundingTechEffects(db, corporation, identity, currentYear);

      const ceoChar = corporation.ceoId
        ? await db
            .collection<Character>("characters")
            .findOne({ _id: corporation.ceoId }, { projection: { "stats.businessAcumen": 1 } })
        : null;

      const baseQuoteInputs: FoundingQuoteInputs = {
        identity,
        preset: worldPreset,
        currentYear,
        eraUnitScale: getEraUnitScale(worldPreset),
        techExpansionDiscount: techEffects.expansionDiscount,
        techGrowthCostMultiplier: techEffects.growthCostMultiplier,
        techDominanceShield: techEffects.dominanceShield,
        nationalMarketSharePercent: 0,
        primeRate: 0,
        acumen: ceoChar?.stats?.businessAcumen ?? NEUTRAL_STAT,
        hostCostOfLivingIndex: null,
      };
      // Fee, starter size and build time do not vary by state.
      envelopeQuote = quoteFoundingEntry(baseQuoteInputs);

      // Prime rate is per COUNTRY and cost of living per STATE, and both move
      // the build price, so a single blended quote would be wrong in most
      // states. One lookup per unique country, one bulk lookup for the states.
      const uniqueCountryIds = [...new Set(states.map((s) => s.countryId))];
      const [nationalShareByCountry, primeRateByCountry, costOfLivingDocs] = await Promise.all([
        fetchCorporationNationalSectorSharesByCountry(db, {
          corporationId: corporation._id,
          sectorType,
          industryModel,
          mediaDiscriminator,
          countryIds: uniqueCountryIds as CountryId[],
        }),
        resolveCountryPrimeRates(db, uniqueCountryIds as CountryId[]),
        db
          .collection<StateMetrics>("macroMetrics")
          .find({ _id: { $in: stateIds } }, { projection: { "economic.costOfLiving": 1 } })
          .toArray(),
      ]);
      const costOfLivingByState = new Map(
        costOfLivingDocs.map((d) => [d._id, d.economic?.costOfLiving?.value ?? null])
      );

      for (const state of states) {
        quoteByState.set(
          state._id,
          quoteFoundingEntry({
            ...baseQuoteInputs,
            // National dominance still follows the incumbent into a new state.
            nationalMarketSharePercent:
              nationalShareByCountry.get(state.countryId as CountryId) ?? 0,
            primeRate: primeRateByCountry.get(state.countryId) ?? 0,
            hostCostOfLivingIndex: costOfLivingByState.get(state._id) ?? null,
          })
        );
      }
    }

    // World-wide corporation-actions pause, the same check the command's guard runs.
    const actionsPause = corporationActionsPause(gameStateDoc);

    // Group siblings by stateId for competitor lookup
    // Capacity every operator still has under construction here, by state.
    const buildQueueTurn = currentTurn;
    const queuedUnitsByState = new Map<string, number>();
    for (const s of siblingCorpSectors) {
      const queued = queuedUndeliveredUnits(s.buildQueue, buildQueueTurn);
      if (queued > 0)
        queuedUnitsByState.set(s.stateId, (queuedUnitsByState.get(s.stateId) ?? 0) + queued);
    }
    // Country-shared lanes net off every plant under construction in the
    // country, read the same way the state board reads it.
    const queuedUnitsByCountry = countrySharedDemand
      ? await loadCountryQueuedUnits(
          db,
          marketFilter,
          eligibleStates.map((s) => s.countryId),
          buildQueueTurn
        )
      : new Map<string, number>();
    const countryDemandEstimateByCountry = new Map<string, number>();
    const siblingsByState = new Map<string, typeof siblingCorpSectors>();
    for (const s of siblingCorpSectors) {
      if (!siblingsByState.has(s.stateId)) siblingsByState.set(s.stateId, []);
      siblingsByState.get(s.stateId)!.push(s);
    }

    const ranked = stateIds
      .map((stateId) => {
        const state = stateMap.get(stateId);
        if (!state) return null;

        const unownedDoc = unownedMap.get(stateId);
        const unownedRevenue = Math.round(unownedDoc?.revenue ?? 0);
        // Unowned splits are retired under plants — zero the legacy quote so
        // clients never see a "Split cost" for an action that 403s.
        const splitCost = plantsMode ? 0 : calculateSplitCostAnchor(unownedRevenue);
        const estimatedRevenueCapture = plantsMode
          ? 0
          : Math.min(
              Math.round(
                unownedRevenue *
                  SPLIT_BASE_CAPTURE_FRACTION *
                  captureMultiplier *
                  UNOWNED_CAPTURE_BONUS_MULTIPLIER
              ),
              unownedRevenue
            );
        // Untapped demand, in output units per day. Self-healed from the ₳
        // pool for rows that predate the `headroomUnits` backfill — a bare 0
        // fallback would read as "no demand here" for a market that has plenty.
        const poolHeadroomUnits = plantsMode
          ? unownedDoc?.headroomUnits != null && Number.isFinite(unownedDoc.headroomUnits)
            ? unownedDoc.headroomUnits
            : computeUnownedHeadroomUnits(
                sectorType,
                unownedRevenue,
                eraUnitScale,
                industryModel,
                mediaDiscriminator
              )
          : null;
        // Room to build: demand buyers here are not getting, less capacity
        // already under construction for it. The unowned pool is legacy market
        // share, not physical demand, so it no longer caps this figure (a
        // market can be short with an empty pool).
        const countryDemandEstimate =
          countrySharedDemand && poolHeadroomUnits != null
            ? (countryDemandEstimateByCountry.get(state.countryId) ??
              buildRoomUnits(
                demandGapUnitsFor(state._id, state.countryId),
                queuedUnitsByCountry.get(state.countryId) ?? 0
              ))
            : null;
        if (countryDemandEstimate != null && !countryDemandEstimateByCountry.has(state.countryId)) {
          countryDemandEstimateByCountry.set(state.countryId, countryDemandEstimate);
        }
        const headroomUnits =
          poolHeadroomUnits != null && !countrySharedDemand
            ? buildRoomUnits(
                demandGapUnitsFor(state._id, state.countryId),
                queuedUnitsByState.get(state._id) ?? 0
              )
            : null;
        const stateQuote = plantsMode ? quoteByState.get(stateId) : undefined;
        const starterBuildCostAnchor = plantsMode ? (stateQuote?.starterBuildAnchor ?? 0) : null;
        // Under plants the price of entry is fee + starter build, not the split
        // cost — so afford must be checked against what is actually charged.
        const foundingBaseAnchor = plantsMode ? (stateQuote?.baseCostAnchor ?? 0) : null;
        const foundingTotalAnchor =
          foundingBaseAnchor == null
            ? null
            : foundingBaseAnchor +
              corpToSectorCountrySpread(corporation, state.countryId, foundingBaseAnchor)
                .spreadAnchor;
        const canAfford =
          foundingTotalAnchor != null
            ? liquidCapitalAnchorExact >= foundingTotalAnchor
            : splitCost === 0
              ? false
              : liquidCapitalAnchor >= splitCost;
        const ownedSectorId = ownedStateMap.get(stateId) ?? null;
        // The founding command's own rules, in its order. Plants only: legacy
        // worlds enter markets by splitting the pool, which has its own route.
        const entry = plantsMode
          ? evaluateMarketEntry({
              actionsPausedMessage: actionsPause?.message ?? null,
              nppControlled: corporation.ceoType === "npp",
              commandEconomy: commandEconomyBlockedCountries.has(state.countryId as CountryId),
              alreadyOperating: ownedSectorId != null,
              retailPauseTurnsRemaining,
              liquidCapitalAnchor: liquidCapitalAnchorExact,
              entryCostAnchor: foundingTotalAnchor,
            })
          : null;

        // Build competitor list for this state
        const stateSiblings = siblingsByState.get(stateId) ?? [];
        const competitors = stateSiblings
          .filter((s) => s.corporationId.toString() !== corporation._id.toString())
          .map((s) => {
            const ref = corpRefMap.get(s.corporationId.toString());
            const fx = competitorFxByCorpId.get(s.corporationId.toString());
            return {
              corpId: s.corporationId.toString(),
              name: ref?.name ?? "Unknown",
              sequentialId: ref?.sequentialId ?? null,
              logoUrl: ref?.logoUrl ?? null,
              brandColor: ref?.brandColor ?? null,
              revenue: Math.round(readCorpEconomicAnchor(s.revenue, fx?.code, fx?.rate ?? 1)),
            };
          });

        const totalCompetitorRevenue = competitors.reduce((sum, c) => sum + c.revenue, 0);
        // Room to build in capacity units: the state's own figure, or the
        // country-wide one when this lane's outputs all sell into the shared
        // national book. Same `buildRoomUnits` figure the state board shows.
        const roomToBuildUnits = plantsMode
          ? countrySharedDemand
            ? (countryDemandEstimate ?? 0)
            : (headroomUnits ?? 0)
          : null;

        return {
          stateId,
          stateName: state.name,
          countryId: state.countryId,
          unownedRevenue,
          splitCost,
          estimatedRevenueCapture,
          // Plants-tier fields; null in every other world.
          ...(countrySharedDemand ? {} : { headroomUnits }),
          starterBuildCostAnchor:
            starterBuildCostAnchor == null ? null : Math.round(starterBuildCostAnchor),
          foundingTotalAnchor,
          canAfford,
          ownedSectorId,
          competitors,
          totalCompetitorRevenue,
          // Plants: whether the founding command would accept this market now,
          // and why not. Legacy unowned revenue above is a separate figure that
          // does not limit building.
          entry,
          roomToBuildUnits,
          roomScope: plantsMode ? (countrySharedDemand ? "country" : "state") : null,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      // Ownership + country filters apply BEFORE the top-N slice, so a selected
      // country's (or owned/new) best markets surface even if they were outside
      // the global top-N.
      .filter((s) =>
        ownership === "owned"
          ? s.ownedSectorId !== null
          : ownership === "unowned"
            ? s.ownedSectorId === null
            : true
      )
      .filter((s) => countrySet.size === 0 || countrySet.has(s.countryId))
      .sort((a, b) =>
        mode === "playerCorp"
          ? b.totalCompetitorRevenue - a.totalCompetitorRevenue
          : plantsMode
            ? // A market the corporation cannot enter now (cannot afford, or
              // closed by a rule) is not the best next sector. Keep enterable
              // markets first, then compare the room to build.
              Number(b.entry?.canEnter ?? false) - Number(a.entry?.canEnter ?? false) ||
              (countrySharedDemand
                ? (countryDemandEstimateByCountry.get(b.countryId) ?? 0) -
                  (countryDemandEstimateByCountry.get(a.countryId) ?? 0)
                : (b.headroomUnits ?? 0) - (a.headroomUnits ?? 0))
            : b.estimatedRevenueCapture - a.estimatedRevenueCapture
      );
    const suggestions = pinStateInTopSuggestions(ranked, pinStateId, 5);

    return NextResponse.json({
      suggestions,
      countrySharedDemand,
      countryDemandEstimates: countrySharedDemand
        ? [...countryDemandEstimateByCountry].map(([countryId, headroomUnits]) => ({
            countryId,
            headroomUnits,
          }))
        : [],
      availableCountries,
      liquidCapital: liquidCapitalAnchor,
      liquidCurrencyCode,
      // Plants-tier founding quote. Constant across states, unlike the build
      // cost, so it rides on the envelope rather than being repeated per row.
      plantsMode,
      starterUnits: envelopeQuote ? Math.round(envelopeQuote.starterUnits) : null,
      foundingFeeAnchor: envelopeQuote ? envelopeQuote.entryFeeAnchor : null,
      foundingBuildTurns: envelopeQuote ? envelopeQuote.buildTurns : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
