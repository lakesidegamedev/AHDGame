/** Loads the world and sibling-sector context the sector detail view is computed from. */
import { flowToRatioGdp } from "@/lib/budget/gdpDenominator";
import type {
  Corporation,
  CorporateSector,
  User,
  ImperialCharacter,
  State,
  CommodityPrice,
  GameState,
  StateBudget,
  Union,
  Tariff,
  Subsidy,
  UnownedSector,
} from "@/lib/db/types";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { canDirectSubsidiaryAsParent } from "@/lib/corporations/subsidiaries/authorization";
import { ObjectId } from "mongodb";
import { corporationPathIdFromDoc } from "@/lib/api/corporations/resolveQuery";
import { shouldRedactCorporation } from "@/lib/corporations/redaction";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import {
  getCorpFxRate,
  getSectorHostFxRate,
  resolveSectorHostCurrencyCode,
  resolveCorpLiquidCurrencyCode,
  loadFxRatesByCurrency,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { isPoliticalApprovalCountry } from "@/lib/politicalLegislation/politicalApprovalProvider";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import { findMergedRegionMetrics } from "@/lib/macroMetrics/merge";
import { loadOwnedMetricInputs } from "@/lib/resetMetrics/loadOwnedInputs";
import { ownedPoliticalModifiers } from "@/lib/resetMetrics/rules/ownedInputs";
import { buildPoliticalBaseModifiers } from "@/lib/politicalLegislation/marginAdapter";
import type { MacroEconomicValues } from "@/lib/constants/corporations";
import { loadActiveFtaPairs } from "@/lib/tariffs/ftaOverrides";
import type { SiblingCorpProjection } from "./sectorDetailTypes";
import type { AuthUser } from "@/lib/auth";
import type { Db, WithId } from "mongodb";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";

/** Reads the state, country, tariff, sibling and market context for one sector. */
export async function loadSectorDetailContext({
  user,
  request,
  isCeo,
  corporation,
  db,
  sector,
}: {
  user: AuthUser | null;
  request: Request;
  isCeo: boolean;
  corporation: Corporation;
  db: Db;
  sector: WithId<CorporateSector>;
}) {
  const viewerIsAdmin = user?.isAdmin === true;
  const modViewEnabled =
    !viewerIsAdmin &&
    user?.isModerator === true &&
    new URL(request.url).searchParams.get("modView") === "1";
  // The CEO of the controlling parent is an insider of its subsidiary, same
  // rule GET /api/corporations/[id] applies.
  let isParentCeo = false;
  let parentDirection: {
    parentName: string;
    parentPathId: string;
    protectedUntilTurn: number | null;
  } | null = null;
  const controllingParent = user && !isCeo ? getControllingCorporateParent(corporation) : null;
  if (user && controllingParent) {
    const parentCorp = await corporationsCollection(db).findOne(
      { _id: controllingParent.corporationId },
      { projection: { userId: 1, ceoVacant: 1, name: 1, sequentialId: 1 } }
    );
    isParentCeo =
      !!parentCorp &&
      parentCorp.ceoVacant !== true &&
      parentCorp.userId?.toString() === user.userId;
    // The parent CEO may retool an AI-run managed subsidiary's sectors; the
    // strategy command re-checks the same rule.
    if (
      parentCorp &&
      isParentCeo &&
      (await canDirectSubsidiaryAsParent(db, new ObjectId(user.userId), corporation))
    ) {
      parentDirection = {
        parentName: parentCorp.name,
        parentPathId: corporationPathIdFromDoc(parentCorp),
        protectedUntilTurn: sector.parentDirectedStrategy?.untilTurn ?? null,
      };
    }
  }
  const shouldRedact =
    !isParentCeo &&
    shouldRedactCorporation(corporation, user?.userId ?? undefined, viewerIsAdmin, modViewEnabled);
  // Financial fog of war (public corps only, non-insiders), mirrors the
  // protection GET /api/corporations/[id] already applies, so a competitor
  // can't see a public corp's live sector financials through this page when
  // the corp page itself would show them a fogged/delayed estimate instead.
  // Unlike the corp page, there is no per-sector historical snapshot to
  // build a jittered quarterly estimate from, so this takes the stricter
  // path of hiding the figures outright rather than approximating them.
  const isPublicCorp = !corporation.isPrivate && !corporation.countryOwnerId;
  const isInsider = isCeo || isParentCeo || viewerIsAdmin;
  const publicFinancialFog = isPublicCorp && !shouldRedact && !isInsider;

  // Look up the viewer's corporation (for attack/split UI)
  let viewerCorporation: Corporation | null = null;
  if (user) {
    const userDoc = await db
      .collection<User>("users")
      .findOne(
        { _id: new ObjectId(user.userId) },
        { projection: { activeCharacterType: 1, activeImperialCharacterId: 1 } }
      );
    const imperialActive =
      userDoc?.activeCharacterType === "imperial" && !!userDoc.activeImperialCharacterId;
    const viewerChar = imperialActive
      ? await db.collection<ImperialCharacter>("imperialCharacters").findOne(
          {
            _id: userDoc.activeImperialCharacterId,
            userId: new ObjectId(user.userId),
          },
          { projection: { _id: 1 } }
        )
      : await getCharacterByUserId(db, user.userId);
    if (viewerChar) {
      viewerCorporation = await corporationsCollection(db).findOne(
        {
          ceoId: viewerChar._id,
          ...(imperialActive ? { ceoType: "imperial" } : {}),
          ceoVacant: { $ne: true },
        },
        {
          projection: {
            _id: 1,
            userId: 1,
            ceoVacant: 1,
            marketingStrength: 1,
            liquidCapital: 1,
            splitEscalation: 1,
            headquartersState: 1,
            countryId: 1,
            liquidCurrencyCode: 1,
          },
        }
      );
    }
  }
  // Resolve viewer's home-currency FX rate so we can convert liquidCapital → ₳
  // before sending to the client (splitCost / attackCost are in ₳; mixing units
  // makes the Split panel warn "Need $X capital" against a raw local-currency
  // balance that the client's formatAmount helper then interprets as ₳).
  const [viewerCorpFxRate, sectorHostFxRate, corporationFxRate] = await Promise.all([
    viewerCorporation ? getCorpFxRate(db, viewerCorporation) : Promise.resolve(1.0),
    getSectorHostFxRate(db, sector, corporation),
    getCorpFxRate(db, corporation),
  ]);
  // The sector's economic fields are stored in its HOST-state currency (the
  // market it operates in), not the owning corp's, resolve that code/rate to
  // normalize sector.revenue to ₳ for the retool/cancel/attack cost previews.
  const sectorHostLiquidCode = resolveSectorHostCurrencyCode(sector, corporation);
  const corporationLiquidCode = resolveCorpLiquidCurrencyCode(corporation);
  const sectorAmountAnchor = (amount: number) =>
    readCorpEconomicAnchor(amount, sectorHostLiquidCode, sectorHostFxRate);
  const sectorAmountInCorpCurrency = (amount: number) =>
    writeCorpEconomicLocal(sectorAmountAnchor(amount), corporationLiquidCode, corporationFxRate);

  // Fetch state, all state ids, state metrics, CEO, commodity prices, corp siblings, and game state in parallel
  // SP4 §4a: the region's political board rides along for the margin overlay.
  const politicalDocPromise = isPoliticalApprovalCountry(sector.countryId)
    ? db
        .collection<PoliticalMetricsDoc>("politicalMetrics")
        .findOne({ _id: sector.stateId, countryId: sector.countryId })
    : Promise.resolve(null);
  const [state, allStates, stateMetrics, ceo, commodityPrices, allCorpSectors, gameState] =
    await Promise.all([
      statesCollection(db).findOne({ _id: sector.stateId, countryId: sector.countryId }),
      statesCollection(db)
        .find({}, { projection: { _id: 1, countryId: 1, name: 1 } })
        .toArray(),
      findMergedRegionMetrics(db, { _id: sector.stateId, countryId: sector.countryId }),
      corporation.ceoType === "imperial"
        ? db
            .collection("imperialCharacters")
            .findOne(
              { _id: corporation.ceoId },
              { projection: { name: 1, sequentialId: 1, avatarUrl: 1 } }
            )
        : corporation.ceoType === "npp"
          ? db
              .collection("npps")
              .findOne(
                { _id: corporation.ceoId },
                { projection: { name: 1, sequentialId: 1, avatarUrl: 1 } }
              )
          : charactersCollection(db).findOne(
              { _id: corporation.ceoId },
              {
                projection: {
                  name: 1,
                  sequentialId: 1,
                  avatarUrl: 1,
                  // Plants tier: the build-cost quote is acumen-sensitive, and
                  // this is the CEO document the quote is about. Projected here
                  // rather than re-read so the plants block costs no extra query.
                  "stats.businessAcumen": 1,
                },
              }
            ),
      db.collection<CommodityPrice>("commodityPrices").find({}).toArray(),
      db
        .collection<CorporateSector>("corporateSectors")
        .find(
          { corporationId: corporation._id },
          {
            projection: {
              _id: 1,
              stateId: 1,
              countryId: 1,
              revenue: 1,
              realizedRevenue: 1,
              profitMargin: 1,
              currentGrowthCost: 1,
              "plantsPnl.totalCost": 1,
              "plantsPnl.turn": 1,
              "plantsPnl.policyCredit": 1,
              operatingCapacityUnits: 1,
              capitalStock: 1,
              buildQueue: 1,
              freightBillingCharge: 1,
              // What each site made last turn, for the own-supply reason on inputs.
              "producerSettlement.turn": 1,
              "producerSettlement.products.commodity": 1,
              "producerSettlement.products.producedUnits": 1,
              "producerSettlement.products.soldUnits": 1,
              "producerSettlement.products.internalDeliveredUnits": 1,
            },
          }
        )
        .toArray(),
      gameStateCollection(db).findOne({ _id: "current" }),
    ]);
  const totalCorpSectors = allCorpSectors.length;
  // SP4 §4a: political margin overlay for playable regions (null elsewhere).
  const politicalDoc = await politicalDocPromise;
  const ownedInputs = (await loadOwnedMetricInputs(db)).get(sector.stateId);
  const politicalBaseModifiers = politicalDoc
    ? ownedInputs?.countryId === sector.countryId
      ? ownedPoliticalModifiers(
          politicalDoc.values,
          ownedInputs.observations,
          ownedInputs.countryId,
          ownedInputs.year
        )
      : buildPoliticalBaseModifiers(politicalDoc.values)
    : null;

  // Fetch federal budget for macroeconomic margin modifiers
  // Fallback to state or corporation countryId for pre-migration sectors
  const sectorCountryId = sector.countryId ?? state?.countryId ?? corporation.countryId;
  // Fetch all countries' federal budgets and all sibling states' state budgets so we can
  // apportion tax across every sector (not just this one), matches corp page math.
  // (stateCountryMap is redeclared later for commodity balance math; use inline lookup here.)
  const stateCountryLookup = new Map(allStates.map((s) => [s._id, s.countryId]));
  const siblingCountryIds = new Set<string>();
  const siblingStateIds = new Set<string>();
  for (const s of allCorpSectors) {
    siblingCountryIds.add(
      s.countryId ?? stateCountryLookup.get(s.stateId) ?? corporation.countryId
    );
    siblingStateIds.add(s.stateId);
  }
  const [federalBudget, allFederalBudgets, allSiblingStateBudgets, coveringIndustryUnionDoc] =
    await Promise.all([
      federalBudgetCollection(db).findOne(
        { countryId: sectorCountryId },
        {
          projection: {
            "economicFactors.inflationRate": 1,
            debtToGdpRatio: 1,
            surplus: 1,
            gdp: 1,
            gdpSmoothed: 1,
            unionsBanned: 1,
            "taxRates.domesticCorporateTax": 1,
            "taxRates.foreignCorporateTax": 1,
            investorConfidence: 1,
            stateOwnershipConcentration: 1,
            minimumWageKaitzRatio: 1,
          },
        }
      ),
      federalBudgetCollection(db)
        .find(
          { countryId: { $in: [...siblingCountryIds] } },
          {
            projection: {
              countryId: 1,
              "taxRates.domesticCorporateTax": 1,
              "taxRates.foreignCorporateTax": 1,
            },
          }
        )
        .toArray(),
      db
        .collection<StateBudget>("stateBudgets")
        .find(
          { _id: { $in: [...siblingStateIds] } },
          {
            projection: {
              _id: 1,
              "taxRates.domesticCorporateTax": 1,
              "taxRates.foreignCorporateTax": 1,
            },
          }
        )
        .toArray(),
      // One union covers every local in a country's industry. Return its
      // identity even while the presidency is vacant so a sector's workforce
      // can always link to the institution organizing it. Wage demands still
      // only count once that union has a leader, preserving the existing
      // player-run-union rule.
      //
      // Union dues v1 note: since players can found rivals, this find-one no
      // longer identifies THE union of the industry, only one of them. It is
      // kept for the existing wage-demand display, which predates rivals.
      // Which union actually represents THIS sector is a separate lookup
      // below, keyed on the sector's own `representingUnionId`.
      db.collection<Union>("unions").findOne(
        {
          countryId: sectorCountryId,
          sectorType: sector.sectorType,
          industryModel: sector.industryModel ?? null,
        },
        { projection: { name: 1, ownerId: 1, demandedWageLevel: 1, undergroundStrength: 1 } }
      ),
    ]);

  // Union dues v1: the union that actually holds this sector, which may be a
  // founded rival rather than the seeded industry union above, or nobody at
  // all. The sector page needs it to say whether organizing here is a first
  // claim or a raid.
  const representingUnionDoc = sector.representingUnionId
    ? await db
        .collection<Union>("unions")
        .findOne(
          { _id: sector.representingUnionId },
          { projection: { name: 1, undergroundStrength: 1 } }
        )
    : null;
  const macroEcon: MacroEconomicValues = {
    inflationRate: federalBudget?.economicFactors?.inflationRate ?? null,
    debtToGdpRatio: federalBudget?.debtToGdpRatio ?? null,
    surplusToGdpRatio: federalBudget ? flowToRatioGdp(federalBudget.surplus, federalBudget) : null,
  };

  // Load tariff policy and market context together; these reads are independent.
  const [allTariffs, activeSubsidies, activeFtaPairs, allSectorsRaw, siblingsSectors] =
    await Promise.all([
      db.collection<Tariff>("tariffs").find({}).toArray(),
      db.collection<Subsidy>("subsidies").find({ active: true }).toArray(),
      loadActiveFtaPairs(db),
      db
        .collection<CorporateSector>("corporateSectors")
        .find(
          {},
          {
            projection: {
              corporationId: 1,
              stateId: 1,
              countryId: 1,
              sectorType: 1,
              industryModel: 1,
              mediaDiscriminator: 1,
              revenue: 1,
              strategyId: 1,
              transitionFromStrategyId: 1,
              transitionStartTurn: 1,
              operatingCapacityUnits: 1,
              capitalStock: 1,
              plantCount: 1,
              producedUnits: 1,
              buildQueue: 1,
            },
          }
        )
        .toArray(),
      db
        .collection<CorporateSector>("corporateSectors")
        .find({
          stateId: sector.stateId,
          sectorType: sector.sectorType,
          industryModel: sector.industryModel ?? null,
          mediaDiscriminator: sector.mediaDiscriminator ?? null,
        })
        .toArray(),
    ]);

  // FTA coverage shares are unconditionally needed by getDomesticTariffMalus
  // and getTariffBlendWeights to scale broad-tariff friction by partner
  // exposure. blendPresenceKeys is additionally needed only when origin/corp
  // tariffs exist. Both are computed from the same sectors+corps slice.
  const corpIds = [...new Set(allSectorsRaw.map((s) => s.corporationId.toString()))];
  const siblingCorpIds = [...new Set(siblingsSectors.map((s) => s.corporationId.toString()))].map(
    (id) => new ObjectId(id)
  );
  const [corpsForLookup, siblingCorps, siblingFxByCurrency, unownedDoc] = await Promise.all([
    corpIds.length > 0
      ? corporationsCollection(db)
          .find(
            { _id: { $in: corpIds.map((cid) => new ObjectId(cid)) } },
            {
              projection: {
                _id: 1,
                countryId: 1,
                type: 1,
                industryModel: 1,
                mediaDiscriminator: 1,
                unlockedTechNodeIds: 1,
                techDecadeLane: 1,
                frontierProgrammes: 1,
                frontierMethods: 1,
              },
            }
          )
          .toArray()
      : Promise.resolve([] as Corporation[]),
    siblingCorpIds.length > 0
      ? corporationsCollection(db)
          .find({ _id: { $in: siblingCorpIds } })
          .project<SiblingCorpProjection>({
            _id: 1,
            name: 1,
            sequentialId: 1,
            brandColor: 1,
            countryId: 1,
            liquidCurrencyCode: 1,
            marketingStrength: 1,
            // Who actually OWNS the corp, for the market panel's player/NPP
            // split. `caretakerCeo` rides along because an NPP caretaker runs
            // a corp whose owner is still a player, and that corp belongs with
            // the player corps.
            ceoType: 1,
            caretakerCeo: 1,
          })
          .toArray()
      : Promise.resolve([] as SiblingCorpProjection[]),
    loadFxRatesByCurrency(db),
    db.collection<UnownedSector>("unownedSectors").findOne({
      stateId: sector.stateId,
      sectorType: sector.sectorType,
      industryModel: sector.industryModel ?? null,
      mediaDiscriminator: sector.mediaDiscriminator ?? null,
    }),
  ]);
  const corpByIdForLookup = new Map(corpsForLookup.map((c) => [c._id.toString(), c]));
  return {
    allTariffs,
    allSectorsRaw,
    corpByIdForLookup,
    activeFtaPairs,
    sectorCountryId,
    federalBudget,
    stateMetrics,
    gameState,
    state,
    siblingCorps,
    siblingsSectors,
    siblingFxByCurrency,
    unownedDoc,
    allStates,
    commodityPrices,
    sectorAmountAnchor,
    politicalBaseModifiers,
    macroEcon,
    totalCorpSectors,
    activeSubsidies,
    allFederalBudgets,
    allSiblingStateBudgets,
    allCorpSectors,
    shouldRedact,
    publicFinancialFog,
    ceo,
    corporationFxRate,
    viewerCorporation,
    viewerCorpFxRate,
    sectorHostFxRate,
    sectorHostLiquidCode,
    sectorAmountInCorpCurrency,
    coveringIndustryUnionDoc,
    representingUnionDoc,
    parentDirection,
  };
}
