import { buildAdviceOutputMultiplier } from "@/lib/corporations/rules/buildDemandProducers";
import { fullMixBuildRoom } from "@/lib/corporations/rules/buildDemandCapacity";
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
import { isOperatingSectorType } from "@/lib/constants/corporations";
import { enumerateCandidateBuckets, laneIdentities } from "@/lib/market/marketBuckets";
import type { SectorBuildOrder, State } from "@/lib/db/types";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
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
import { loadLegacyTechContext } from "@/lib/corporations/techTree/legacyTechContext";
import { corporationActionsPause } from "@/lib/corporations/corporationActionsPause";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  corpLiquidCapitalToAnchor,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";

import type { CountryId } from "@/lib/constants/countries";
import { loadCommandEconomyBlockedCountries } from "@/lib/economy/queries/commandEconomyMarketGate";
import { resolvePresetIdFromGameState } from "@/lib/world/presetId";
import { pinStateInTopSuggestions } from "@/lib/corporations/expandSuggestionPin";
import { fetchCorporationNationalSectorSharesByCountry } from "@/lib/corporations/marketShare";
import {
  retailCapacityExpansionPaused,
  retailDemandTransitionTurnsRemaining,
} from "@/lib/market/retailDemandTransition";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type SuggestionMode = "unowned" | "playerCorp";
type OwnershipFilter = "all" | "owned" | "unowned";

/**
 * GET /api/corporations/[id]/expand-suggestions?sectorType=xxx&mode=unowned|playerCorp&ownership=all|owned|unowned
 * Returns up to 5 states with the best market opportunity for the sector type.
 * mode=unowned (default, the "new markets" list): every region of the world is a
 *   candidate; ranked by enterability, then room to build.
 * mode=playerCorp: ranked by total competitor revenue, i.e. markets with active player corps.
 * ownership (default all): owned = states this corp already operates in; unowned =
 *   states it has not entered. Applied BEFORE the top-N slice so the best owned/new
 *   markets surface instead of being hidden behind the global top-N.
 * state (optional): pin this stateId into the returned top-N (Build-here deep link).
 * Includes competitor corporations already operating in each state.
 *
 * Each market carries the entry verdict from `evaluateMarketEntry` (the rules the
 * founding command enforces) and the room to build in capacity units.
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
    const sectorType = lane;
    const marketFilter = { sectorType };

    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;

    const gameStateDoc = await gameStateCollection(db).findOne({ _id: "current" });
    const currentTurn = gameStateDoc?.currentTurn ?? 0;

    // Greenfield Retail builds are deliberately unavailable while the legacy
    // supply-derived demand is fading out. Reject before calculating and
    // presenting opportunities so the modal explains the pause instead of
    // inviting a build that the command will later refuse. Competitor mode is
    // still available because sector attacks transfer existing plants; its rows
    // carry the pause as their entry verdict instead.
    let retailPauseTurnsRemaining: number | null = null;
    if (sectorType === "retail") {
      const transition = await gameConfigCollection(db).findOne(
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

    // Funded markets use the same per-output sizing as local expansion below.
    // The legacy weighted appetite remains only for worlds without funded books.
    const supplyMix = getEffectiveStrategyRates(
      sectorType,
      "standard",
      null,
      null,
      currentTurn,
      resolvePresetIdFromGameState(gameStateDoc),
      gameStateDoc?.hardwareInputReliefStartTurn
    ).supply;
    const buildRoom = await loadBuildRoomContext(db);
    const candidateOutputMultiplier = buildAdviceOutputMultiplier({
      sector: { sectorType },
      supply: supplyMix,
      owner: corporation,
      techEnabled: gameStateDoc?.sectorTechTreesEnabled === true,
      legacyTech: await loadLegacyTechContext(db, {
        startingYear: gameStateDoc?.startingYear,
      }),
      turn: currentTurn,
      preset: resolvePresetIdFromGameState(gameStateDoc),
    });
    const countrySharedDemand = supplyMixSharesCountryDemand(supplyMix, buildRoom?.funded);
    const demandGapUnitsByState = new Map<string, number>();
    const demandGapUnitsByCountry = new Map<string, number>();
    const demandGapUnitsFor = (stateId: string, countryId: string): number => {
      const cache = countrySharedDemand ? demandGapUnitsByCountry : demandGapUnitsByState;
      const key = countrySharedDemand ? countryId : stateId;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const gap = buildRoom.demandGapUnits(supplyMix, stateId, countryId);
      cache.set(key, gap);
      return gap;
    };

    const { ObjectId } = await import("mongodb");
    const liquidCapital = corporation.liquidCapital ?? 0;
    const fxByCurrency = await loadFxRatesByCurrency(db);
    const corpFx = fxRateForCorpFromMap(corporation, fxByCurrency);
    const liquidCurrencyCode = resolveCorpLiquidCurrencyCode(corporation);
    // Unrounded for the entry verdict so it compares exactly what the command does.
    const liquidCapitalAnchorExact = corpLiquidCapitalToAnchor(liquidCapital, corporation, corpFx);
    const liquidCapitalAnchor = Math.round(liquidCapitalAnchorExact);

    let stateIds: string[];
    // New-market mode reads every region once and reuses the rows below.
    let allStates: Pick<State, "_id" | "name" | "countryId">[] | null = null;

    if (mode === "playerCorp") {
      // Find states where competitor corps operate in this sector type
      const competitorSectors = await corporateSectorsCollection(db)
        .find({
          ...marketFilter,
          corporationId: { $ne: corporation._id },
        })
        .project<{ stateId: string }>({ stateId: 1 })
        .toArray();

      stateIds = [...new Set(competitorSectors.map((s) => s.stateId))];
    } else {
      // Every region is a candidate: the goods market decides whether it pays.
      allStates = await statesCollection(db)
        .find({}, { projection: { _id: 1, name: 1, countryId: 1 } })
        .toArray();
      const laneId = laneIdentities().filter((l) => l.lane === lane);
      stateIds = enumerateCandidateBuckets(
        allStates.map((st) => st._id),
        new Set(),
        laneId
      ).map((b) => b.stateId);
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
    const [states, ownedSectors, siblingCorpSectors] = await Promise.all([
      allStates
        ? Promise.resolve(allStates)
        : statesCollection(db)
            .find({ _id: { $in: stateIds } }, { projection: { _id: 1, name: 1, countryId: 1 } })
            .toArray(),
      corporateSectorsCollection(db)
        .find({ corporationId: corporation._id, ...marketFilter, stateId: { $in: stateIds } })
        .project<{ _id: string; stateId: string }>({ _id: 1, stateId: 1 })
        .toArray(),
      corporateSectorsCollection(db)
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
    ]);

    // Loaded in competitor mode too: a command-economy row there is still shown,
    // but its entry verdict must say it is closed.
    const commandEconomyBlockedCountries = await loadCommandEconomyBlockedCountries(
      db,
      states.map((s) => s.countryId)
    );

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
        ? await corporationsCollection(db)
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

    // Command economies run production through the state, not private
    // corporations, so their states are not new-market candidates. Competitor
    // mode keeps them: seeing which corps (including SOEs) compete is useful.
    // Cross-border founding is allowed: the founding command prices the host
    // country's prime rate and the cross-currency spread.
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

    // ─── Plants: what entering this market actually costs and delivers ───────
    //
    // Founding is a FIRST BUILD (see expandSector): an entry fee
    // plus a discounted starter build that ARRIVES after a construction lag.
    //
    // Priced through `quoteFoundingEntry` with tech effects from
    // `loadFoundingTechEffects`, the exact pair expandSector charges with, so
    // the modal's quote and the command's charge cannot drift. A preview that
    // disagrees with the confirm is worse than no preview.

    let envelopeQuote: FoundingQuote | null = null;
    const quoteByState = new Map<string, FoundingQuote>();

    {
      const currentYear =
        gameStateDoc?.currentYear ??
        STARTING_YEAR + Math.floor((Math.max(1, currentTurn) - 1) / TURNS_PER_YEAR);
      const worldPreset = resolvePresetIdFromGameState(gameStateDoc);
      const techEffects = await loadFoundingTechEffects(db, corporation, sectorType, currentYear);

      const ceoChar = corporation.ceoId
        ? await charactersCollection(db).findOne(
            { _id: corporation.ceoId },
            { projection: { "stats.businessAcumen": 1 } }
          )
        : null;

      const baseQuoteInputs: FoundingQuoteInputs = {
        sectorType,
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
          countryIds: uniqueCountryIds as CountryId[],
        }),
        resolveCountryPrimeRates(db, uniqueCountryIds as CountryId[]),
        macroMetricsCollection(db)
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
    const queuedUnitsByCountry =
      countrySharedDemand && !buildRoom?.funded
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

        // Room to build: demand buyers here are not getting, less capacity
        // already under construction for it.
        const countryDemandEstimate = countrySharedDemand
          ? (countryDemandEstimateByCountry.get(state.countryId) ??
            buildRoomUnits(
              demandGapUnitsFor(state._id, state.countryId),
              queuedUnitsByCountry.get(state.countryId) ?? 0
            ))
          : null;
        if (countryDemandEstimate != null && !countryDemandEstimateByCountry.has(state.countryId)) {
          countryDemandEstimateByCountry.set(state.countryId, countryDemandEstimate);
        }
        const stateRoomUnits = !countrySharedDemand
          ? buildRoomUnits(
              demandGapUnitsFor(state._id, state.countryId),
              queuedUnitsByState.get(state._id) ?? 0
            )
          : null;
        const stateQuote = quoteByState.get(stateId);
        const starterBuildCostAnchor = stateQuote?.starterBuildAnchor ?? 0;
        // The price of entry is fee + starter build, so afford is checked
        // against what is actually charged.
        const foundingBaseAnchor = stateQuote?.baseCostAnchor ?? 0;
        const foundingTotalAnchor =
          foundingBaseAnchor +
          corpToSectorCountrySpread(corporation, state.countryId, foundingBaseAnchor).spreadAnchor;
        const canAfford = liquidCapitalAnchorExact >= foundingTotalAnchor;
        const ownedSectorId = ownedStateMap.get(stateId) ?? null;
        // The founding command's own rules, in its order.
        const entry = evaluateMarketEntry({
          actionsPausedMessage: actionsPause?.message ?? null,
          nppControlled: corporation.ceoType === "npp",
          commandEconomy: commandEconomyBlockedCountries.has(state.countryId as CountryId),
          alreadyOperating: ownedSectorId != null,
          retailPauseTurnsRemaining,
          liquidCapitalAnchor: liquidCapitalAnchorExact,
          entryCostAnchor: foundingTotalAnchor,
        });

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
        const buildDemand = buildRoom?.demandRows?.(
          supplyMix,
          state._id,
          state.countryId,
          candidateOutputMultiplier
        );
        const roomToBuildUnits = buildDemand
          ? fullMixBuildRoom(buildDemand)
          : countrySharedDemand
            ? (countryDemandEstimate ?? 0)
            : (stateRoomUnits ?? 0);

        if (buildDemand && countrySharedDemand && roomToBuildUnits != null) {
          countryDemandEstimateByCountry.set(state.countryId, roomToBuildUnits);
        }
        return {
          stateId,
          stateName: state.name,
          countryId: state.countryId,
          starterBuildCostAnchor: Math.round(starterBuildCostAnchor),
          foundingTotalAnchor,
          canAfford,
          ownedSectorId,
          competitors,
          totalCompetitorRevenue,
          // Whether the founding command would accept this market now, and why not.
          entry,
          roomToBuildUnits,
          roomScope: countrySharedDemand ? "country" : "state",
          buildDemand,
          buildDemandTurn: buildRoom?.demandTurn,
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
          : // A market the corporation cannot enter now (cannot afford, or closed
            // by a rule) is not the best next sector. Keep enterable markets
            // first, then compare the room to build.
            Number(b.entry.canEnter) - Number(a.entry.canEnter) ||
            (b.roomToBuildUnits ?? 0) - (a.roomToBuildUnits ?? 0)
      );
    const suggestions = pinStateInTopSuggestions(ranked, pinStateId, 5);

    return NextResponse.json({
      suggestions,
      countrySharedDemand,
      countryDemandEstimates: countrySharedDemand
        ? [...countryDemandEstimateByCountry].map(([countryId, roomToBuildUnits]) => ({
            countryId,
            roomToBuildUnits,
          }))
        : [],
      availableCountries,
      liquidCapital: liquidCapitalAnchor,
      liquidCurrencyCode,
      // Founding quote. Constant across states, unlike the build cost, so it
      // rides on the envelope rather than being repeated per row.
      starterUnits: envelopeQuote ? Math.round(envelopeQuote.starterUnits) : null,
      foundingFeeAnchor: envelopeQuote ? envelopeQuote.entryFeeAnchor : null,
      foundingBuildTurns: envelopeQuote ? envelopeQuote.buildTurns : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
