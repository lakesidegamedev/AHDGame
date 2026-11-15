import { chooseNppCorporationName } from "@/lib/corporations/names/rules";
import {
  chooseRealCompanyName,
  isRealCompanyWorld,
  realCompanyLogoUrl,
  type RealNameKind,
} from "@/lib/corporations/names/realNames";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, GameState, NPP } from "@/lib/db/types";
import { chooseNppCorpCeo, type NppCorpCeoAffiliation } from "./nppCorpCeoSelection";
import {
  gatherNppCeoAffiliations,
  nppCeoSelectionLane,
  type GatherNppCeoAffiliationsOptions,
} from "@/lib/corporations/nppCeoAffiliations";
import type { State } from "@/lib/db/types/state";
import type { CountryId } from "@/lib/constants/countries";
import {
  assertPrivateEnterprisePermitted,
  isPrivateEnterpriseBlocked,
} from "@/lib/economy/queries/privateEnterpriseGate";
import { loadWorldEraUnitScale, loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import { getEraFounderShares, getEraNominalScale } from "@/lib/constants/sectorSeedEra";
import { autoGrantedNodeIds } from "@/lib/constants/techTree";
import { resolveGameYear } from "@/lib/era/era";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { OPERATING_SECTOR_TYPES, type CorporationType, DEFAULT_SHARE_PRICE, CEO_INITIAL_SHARES, DEFAULT_PROFIT_MARGIN, DEFAULT_SECTOR_STARTING_REVENUE, DEFAULT_SECTOR_STARTING_WORKERS, type OperatingSectorType } from "@/lib/constants/corporations";
import {
  COUNTRY_CURRENCY_MAP,
  getSeedCurrencyCode,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import {
  anchorToCorpCapital,
  getCurrencyFxRate,
  getSectorHostFxRate,
  resolveSectorHostCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { randomBrandColor } from "@/lib/corporations/brandColor";
import { nppOpeningUnits } from "@/lib/admin/seed/rules/nppOpeningSize";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { createNPP } from "@/lib/npp/generator";
import {
  generateTickerSymbol,
  insertCorporationWithTickerRetry,
} from "@/lib/corporations/tickerSymbol";
import { witnessCorporationStartingGrant } from "@/lib/corporations/startingGrantLedger";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { capacityRescaleRatio, revenuePerCapacityUnit } from "@/lib/constants/capacityEconomy";
import { JP_GEOGRAPHY } from "@/lib/countries/jp/geography";
import { US_NPP_CAPITAL_STATE } from "@/lib/countries/us/geographyFacts";
import { UK_NPP_CAPITAL_STATE } from "@/lib/countries/uk/geographyFacts";
import { DE_NPP_CAPITAL_STATE } from "@/lib/countries/de/geographyFacts";
import { CN_NPP_CAPITAL_STATE } from "@/lib/countries/cn/geographyFacts";
import { IE_NPP_CAPITAL_STATE } from "@/lib/countries/ie/geographyFacts";
import { RU_NPP_CAPITAL_STATE } from "@/lib/countries/ru/geographyFacts";
import { DD_NPP_CAPITAL_STATE } from "@/lib/countries/dd/geographyFacts";
import { NG_NPP_CAPITAL_STATE } from "@/lib/countries/ng/geographyFacts";
import { BR_NPP_CAPITAL_STATE } from "@/lib/countries/br/geographyFacts";
import { FR_NPP_CAPITAL_STATE } from "@/lib/countries/fr/geographyFacts";
import { IT_NPP_CAPITAL_STATE } from "@/lib/countries/it/geographyFacts";
import { ES_NPP_CAPITAL_STATE } from "@/lib/countries/es/geographyFacts";
import { SE_NPP_CAPITAL_STATE } from "@/lib/countries/se/geographyFacts";
import { TR_NPP_CAPITAL_STATE } from "@/lib/countries/tr/geographyFacts";
import { GR_NPP_CAPITAL_STATE } from "@/lib/countries/gr/geographyFacts";
import { AT_NPP_CAPITAL_STATE } from "@/lib/countries/at/geographyFacts";
import { FI_NPP_CAPITAL_STATE } from "@/lib/countries/fi/geographyFacts";
import { PL_NPP_CAPITAL_STATE } from "@/lib/countries/pl/geographyFacts";
import { HU_NPP_CAPITAL_STATE } from "@/lib/countries/hu/geographyFacts";
import { RO_NPP_CAPITAL_STATE } from "@/lib/countries/ro/geographyFacts";
import { YU_NPP_CAPITAL_STATE } from "@/lib/countries/yu/geographyFacts";
import { BG_NPP_CAPITAL_STATE } from "@/lib/countries/bg/geographyFacts";
import { CS_NPP_CAPITAL_STATE } from "@/lib/countries/cs/geographyFacts";
import { SCO_NPP_CAPITAL_STATE } from "@/lib/countries/sco/geographyFacts";
import { WAL_NPP_CAPITAL_STATE } from "@/lib/countries/wal/geographyFacts";
import { BLR_NPP_CAPITAL_STATE } from "@/lib/countries/blr/geographyFacts";
import { UKR_NPP_CAPITAL_STATE } from "@/lib/countries/ukr/geographyFacts";
import { BAL_NPP_CAPITAL_STATE } from "@/lib/countries/bal/geographyFacts";
import { CA_NPP_CAPITAL_STATE } from "@/lib/countries/ca/geographyFacts";
import { QC_NPP_CAPITAL_STATE } from "@/lib/countries/qc/geographyFacts";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

/**
 * Default founding book for an admin/NPP-spawned corporation, in ₳ at MODERN
 * (2019-calibrated) nominal magnitudes. Converted to the country's currency and
 * deflated by the era's nominal scale at spawn time — see the call site.
 */
export const NPP_DEFAULT_STARTING_CAPITAL_ANCHOR = 2_000_000;

/**
 * Capital state for each enabled country.
 * Used as default HQ when batch-spawning NPP corporations.
 */
// A capital here means "this country HAS a seedable capital region", nothing
// more. Whether a private corp may spawn there is decided by the marketization
// dial in spawnNppCorporation above, never by blanking an entry in this map.
// Blanks mean only "no seeded regions yet".
export const NPP_CAPITAL_STATES: Record<CountryId, string> = {
  US: US_NPP_CAPITAL_STATE,
  UK: UK_NPP_CAPITAL_STATE,
  JP: JP_GEOGRAPHY.nppCapitalState,
  DE: DE_NPP_CAPITAL_STATE,
  CN: CN_NPP_CAPITAL_STATE, // Huabei (North China) — the region containing Beijing
  IE: IE_NPP_CAPITAL_STATE,
  NG: NG_NPP_CAPITAL_STATE, // federal capital (Abuja/FCT) sits in the North-Central zone
  BR: BR_NPP_CAPITAL_STATE,
  HU: HU_NPP_CAPITAL_STATE,
  PL: PL_NPP_CAPITAL_STATE,
  RO: RO_NPP_CAPITAL_STATE,
  YU: YU_NPP_CAPITAL_STATE,
  BG: BG_NPP_CAPITAL_STATE,
  // Union republics: seeded regions exist, so these carry real capitals.
  UKR: UKR_NPP_CAPITAL_STATE,
  BLR: BLR_NPP_CAPITAL_STATE,
  CS: CS_NPP_CAPITAL_STATE,
  BAL: BAL_NPP_CAPITAL_STATE, // Riga: the largest Baltic city and the regional administrative centre
  RU: RU_NPP_CAPITAL_STATE,
  // Econ-tier market democracies: capital region (political capital where
  // administrative and market capital differ, e.g. Ankara). Must be seeded
  // by the econ-tier roster + region seeders for NPP corp HQ spawn.
  FR: FR_NPP_CAPITAL_STATE, // Île-de-France (Paris)
  IT: IT_NPP_CAPITAL_STATE, // Lazio (Rome)
  ES: ES_NPP_CAPITAL_STATE, // Comunidad de Madrid
  SE: SE_NPP_CAPITAL_STATE, // Stockholm
  TR: TR_NPP_CAPITAL_STATE, // Ankara (political capital)
  GR: GR_NPP_CAPITAL_STATE, // Attica (Athens)
  AT: AT_NPP_CAPITAL_STATE, // Vienna
  FI: FI_NPP_CAPITAL_STATE, // Uusimaa (Helsinki)
  DD: DD_NPP_CAPITAL_STATE, // regions not yet seeded
  SCO: SCO_NPP_CAPITAL_STATE, // Latent — sub-regions seeded at secession (cannot spawn pre-activation)
  WAL: WAL_NPP_CAPITAL_STATE, // Latent — sub-regions seeded at secession (cannot spawn pre-activation)
  CA: CA_NPP_CAPITAL_STATE,
  QC: QC_NPP_CAPITAL_STATE, // latent: regions exist only after independence
};

export interface SpawnNppCorporationInput {
  /** Human-readable name for the corporation */
  name: string;
  /** Sector type of the corporation and its founding sector */
  type: CorporationType;
  /** Country where the corporation is headquartered */
  countryId: CountryId;
  /** State code where the corporation is headquartered and operates */
  headquartersState: string;
  /** Starting liquid capital in the country's local currency (default: 2_000_000) */
  startingCapital?: number;
  /** Starting revenue for the initial sector (default: the standard opening plant for the lane) */
  startingRevenue?: number;
  /** Optional maximum daily revenue in anchor currency, for deposit-limited seeds. */
  maximumStartingRevenue?: number;
  /** Profit margin for the initial sector (default: 35%) */
  profitMargin?: number;
  /** Brand color hex (default: random from palette) */
  brandColor?: string;
  /** Optional ticker symbol (auto-generated if not provided) */
  tickerSymbol?: string;
  /** Set when `name` is a generated placeholder a modern world may replace with a real company. */
  realName?: RealNameKind;
  /**
   * Explicit NPP party sequentialId for the CEO. When omitted (or blank), the CEO
   * is chosen by {@link chooseNppCorpCeo}: an existing NPP without a corp is
   * preferred, balancing corp ownership across active parties + independents, and
   * only falling back to a freshly created `"independent"` NPP when none is free.
   * When set, the CEO is taken from (or created in) that party.
   */
  nppPartyId?: string;
  /**
   * Turn the corp was founded. Defaults to 0 (bootstrap/admin-batch spawns,
   * which represent pre-existing corps). Autonomous NPP founding
   * (nppFoundCorporation) passes the current turn so mid-sim founding is
   * stamped for audit/timeline data rather than reading as turn 0.
   */
  foundedAtTurn?: number;
  /** Initial operating strategy for the founding sector. Defaults to standard. */
  initialStrategyId?: string;
}

/**
 * Gather the per-affiliation inputs {@link chooseNppCorpCeo} needs for one
 * country: how many NPP-corps each participating affiliation (active non-defunct
 * parties + `"independent"`) already controls, and which of its active NPPs are
 * not yet a CEO and so free to take one.
 */
async function gatherNppCorpCeoAffiliations(
  db: Db,
  countryId: CountryId,
  options: GatherNppCeoAffiliationsOptions = {}
): Promise<NppCorpCeoAffiliation[]> {
  return gatherNppCeoAffiliations(db, countryId, options);
}

export interface SpawnNppCorporationResult {
  corporationId: string;
  sequentialId: number;
  name: string;
  type: CorporationType;
  countryId: CountryId;
  headquartersState: string;
  /** In the corp's local currency (`liquidCurrencyCode`), as persisted. */
  startingCapital: number;
  /**
   * In ₳ (anchor). This is the market-capture quantity, not the stored field:
   * the sector row persists it converted to the sector's host currency.
   */
  startingRevenue: number;
  sectorId: string;
  nppId: string;
  nppName: string;
  tickerSymbol: string;
}

function pickBrandColor(inputColor?: string): string {
  return inputColor ?? randomBrandColor();
}

export interface CreateNppCorporationShellInput {
  name: string;
  type: CorporationType;
  countryId: CountryId;
  headquartersState: string;
  currencyCode: CurrencyCode;
  preset: Awaited<ReturnType<typeof loadWorldPreset>>;
  /** Liquid capital in `currencyCode`; defaults to the era-scaled NPP founding book. */
  startingCapital?: number;
  brandColor?: string;
  tickerSymbol?: string;
  /** Set when `name` is a generated placeholder a modern world may replace with a real company. */
  realName?: RealNameKind;
  nppPartyId?: string;
  foundedAtTurn?: number;
  /** Tech nodes carried over in addition to the era's auto-granted set. */
  inheritedTechNodeIds?: readonly string[];
  /**
   * Value (in `currencyCode`) the corporation holds beyond its cash, priced into
   * the opening share price. A shell that is handed live plants must not list at
   * a cash-only price, or its public float sells for a fraction of what it owns.
   */
  additionalBookValueLocal?: number;
  /** Extra fields written on the corporation document at insert. */
  extraFields?: Partial<Corporation>;
  now: Date;
}

export interface CreateNppCorporationShellResult {
  corpDoc: Corporation;
  corpId: ObjectId;
  npp: NPP;
  startingCapital: number;
  sequentialId: number;
  tickerSymbol: string;
}

/**
 * A generated placeholder name becomes a real company in modern worlds when
 * the country and industry still have an unused one. Explicit names pass through.
 */
async function resolveNppCorporationName(
  db: Db,
  input: {
    requestedName: string;
    realName: RealNameKind | undefined;
    countryId: CountryId;
    lane: OperatingSectorType;
    worldYear: number | null;
  }
): Promise<string> {
  if (!input.realName || !isRealCompanyWorld(input.worldYear)) return input.requestedName;
  const existingNames = (
    await corporationsCollection(db).find({}).project<{ name: string }>({ name: 1 }).toArray()
  ).map((corp) => corp.name);
  return (
    chooseRealCompanyName({
      countryId: input.countryId,
      lane: input.lane,
      kind: input.realName,
      existingNames,
      rng: Math.random,
    }) ?? input.requestedName
  );
}

/**
 * Insert an NPP-run corporation with no sectors: CEO selection, founding book,
 * tech grants, share structure, and the witnessed starting grant. Shared by the
 * admin/seed spawn (which then grants the standard opening sector)
 * and dissolution succession (which re-parents the dissolved corporation's live
 * sectors instead).
 */
export async function createNppCorporationShell(
  db: Db,
  input: CreateNppCorporationShellInput
): Promise<CreateNppCorporationShellResult> {
  const {
    name: requestedName,
    type,
    countryId,
    headquartersState,
    currencyCode,
    preset,
    startingCapital: customCapital,
    brandColor,
    tickerSymbol: customTicker,
    nppPartyId,
    now,
  } = input;

  // Choose the CEO: prefer an existing NPP without a corp (balanced across
  // active parties + independents); only create a new NPP when none is free.
  // NPP engine 6: at v6 a free NPP with a good record in this lane wins.
  const sectorLane = await nppCeoSelectionLane(db, countryId, type);
  const affiliations = await gatherNppCorpCeoAffiliations(db, countryId, {
    withTrackRecords: sectorLane != null,
  });
  const choice = chooseNppCorpCeo({
    forcedParty: nppPartyId,
    affiliations,
    ...(sectorLane ? { sectorLane } : {}),
  });

  let npp: NPP | null = null;
  if (choice.kind === "existing") {
    npp = await nppsCollection(db).findOne({ _id: new ObjectId(choice.nppId) });
  }
  // Fall back to creating a fresh NPP when told to (choice.kind === "new") or if
  // the chosen existing NPP vanished between gather and fetch (defensive). Either
  // way `choice.party` holds the affiliation the balancer settled on.
  if (!npp) {
    npp = await createNPP({
      state: headquartersState,
      party: choice.party,
      countryId,
      targetOffice: null,
    });
  }

  // Determine starting capital. Two normalizations, both on the default only
  // (an explicit `customCapital` is taken literally):
  //
  //  1. FX: ~₳2M expressed in the country's own currency, so weak-currency
  //     countries are not seeded with tiny local books. A flat 2M LOCAL left some
  //     corps far below the nominal cash floors gating expansion. Converted at
  //     the world's market rate, the same rate the cash is valued at (the GDP
  //     normalization factor differs from it wherever authored GDP is not at the
  //     era's market rate).
  //  2. ERA: ₳2,000,000 is a MODERN absolute; 1953 nominal GDP is ~70x smaller, so
  //     the unscaled default handed a fresh NPP corp more cash than several 1953
  //     regional sector markets combined. Deflating by the era's nominal scale
  //     keeps the founding book the same share of the economy as in 2019. No-op
  //     for every modern preset.
  const techGameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        currentYear: 1,
        currentTurn: 1,
        startingYear: 1,
      },
    }
  );
  const worldYear =
    (techGameState ? resolveGameYear(techGameState) : null) ?? getStartingYearForPreset(preset);
  const operatingLane = type;
  const techGrantIds = autoGrantedNodeIds(operatingLane, worldYear);
  const name = await resolveNppCorporationName(db, {
    requestedName,
    realName: input.realName,
    countryId,
    lane: operatingLane,
    worldYear,
  });
  const logoUrl = realCompanyLogoUrl(name);
  const startingCapital =
    customCapital ??
    Math.round(
      anchorToCorpCapital(
        NPP_DEFAULT_STARTING_CAPITAL_ANCHOR * getEraNominalScale(preset),
        currencyCode,
        await getCurrencyFxRate(db, currencyCode)
      )
    );
  const techGrantIdsWithInherited = [
    ...new Set([...techGrantIds, ...(input.inheritedTechNodeIds ?? [])]),
  ];

  // Get next sequential ID for corporation
  const sequentialId = await getNextSequentialId(db, "corporation");

  // Generate ticker if not provided
  const tickerSymbol = customTicker ?? (await generateTickerSymbol(db, name));

  // Share allocation: NPP CEO gets 51%, public float gets 49%. The share base
  // deflates with the era for the same reason `startingCapital` above does —
  // on a fixed 10M base a 1953 corp prices below MIN_SHARE_PRICE and floors.
  const totalIssuedShares = getEraFounderShares(CEO_INITIAL_SHARES, preset);
  const nppShares = Math.floor(totalIssuedShares * 0.51);
  const publicFloatShares = totalIssuedShares - nppShares;

  // Calculate initial share price based on starting capital
  const initialSharePrice = Math.max(
    DEFAULT_SHARE_PRICE,
    Math.round(
      ((startingCapital + Math.max(0, input.additionalBookValueLocal ?? 0)) / totalIssuedShares) *
        100
    ) / 100
  );

  // Create the corporation document
  const corpId = new ObjectId();
  const corpDoc: Omit<Corporation, "_id"> & { _id: ObjectId } = {
    _id: corpId,
    name,
    tickerSymbol,
    type,
    ceoId: npp._id,
    ceoType: "npp",
    ceoVacant: false,
    userId: new ObjectId("000000000000000000000000"), // system placeholder
    countryId,
    headquartersState,
    liquidCapital: startingCapital,
    liquidCurrencyCode: currencyCode,
    marketingBudget: Math.round(startingCapital * 0.02), // 2% marketing
    marketingStrength: 10,
    logisticsBudget: Math.round(startingCapital * 0.01), // 1% logistics
    logisticsStrength: 0,
    rdBudget: Math.round(startingCapital * 0.01), // 1% R&D
    rdScore: 0,
    ...(techGrantIdsWithInherited.length > 0
      ? { unlockedTechNodeIds: techGrantIdsWithInherited }
      : {}),
    ceoSalary: 0,
    brandColor: pickBrandColor(brandColor),
    ...(logoUrl ? { logoUrl } : {}),
    sequentialId,
    totalShares: totalIssuedShares,
    sharePrice: initialSharePrice,
    shareholders: [{ nppId: npp._id, shares: nppShares }],
    publicFloat: publicFloatShares,
    dividendRate: 5, // 5% dividend — attractive to investors
    suspended: false,
    hiddenFromExchange: false,
    isPrivate: false,
    foundedAtTurn: input.foundedAtTurn ?? 0,
    createdAt: now,
    updatedAt: now,
    ...input.extraFields,
  };

  await insertCorporationWithTickerRetry(db, corpDoc as Corporation);
  await witnessCorporationStartingGrant(db, {
    corporationId: corpId,
    amountLocal: startingCapital,
    currencyCode,
    turn: input.foundedAtTurn,
    now,
  });

  return {
    corpDoc: corpDoc as Corporation,
    corpId,
    npp,
    startingCapital,
    sequentialId,
    tickerSymbol,
  };
}

export interface GrantNppSectorInput {
  corpDoc: Pick<Corporation, "_id" | "countryId" | "liquidCurrencyCode">;
  stateId: string;
  /** Country the state belongs to (the sector's host). */
  countryId: CountryId;
  type: CorporationType;
  /** Opening revenue in ₳ on the standard strategy basis. */
  startingRevenue: number;
  /** Opening capacity in output units/day on the standard strategy basis. */
  startingCapacityUnitsStandard: number;
  profitMargin: number;
  initialStrategyId?: string;
  foundedAtTurn?: number;
  plantsEnabled: boolean;
  now: Date;
}

/**
 * Insert one NPP sector with its opening capacity granted instantly (no
 * build window).
 */
async function grantNppSector(
  db: Db,
  input: GrantNppSectorInput
): Promise<{ sectorId: ObjectId; capacityUnits: number }> {
  const {
    corpDoc,
    stateId,
    countryId,
    type,
    startingRevenue,
    profitMargin,
    plantsEnabled,
    startingCapacityUnitsStandard: standardUnits,
    now,
  } = input;

  // The seed/admin path grants capacity directly into `capitalStock` (instant,
  // in units): a world is seeded at t0, so no build queue could drain and a
  // corporation whose plants were all under construction would start a world
  // producing nothing.
  const startingCapacityUnitsStandard = plantsEnabled ? standardUnits : 0;
  const startingCapacityUnits = plantsEnabled
    ? startingCapacityUnitsStandard *
      capacityRescaleRatio(type, "standard", input.initialStrategyId)
    : 0;

  // ─── Currency: `corporateSectors.revenue` is stored in the sector's HOST-state
  // currency, NOT in ₳ (see src/lib/currency/corpEconomyFields.ts; readers call
  // `readCorpEconomicAnchor`, writers `writeCorpEconomicLocal`). This path wrote
  // the ₳ figure straight in, so every sector in a non-anchor-currency country
  // (JP fx ≈ 360, BR, NG, DE, CN, IE…) was read back at 1/fx of its true weight
  // by every ₳-denominated aggregate — tax rollups, GDP weighting, market-share
  // denominators, corp valuation. Capital mode hid it because the turn's
  // read→grow→write round-trips and cancels; plants exposes it because the
  // nameplate is rebuilt from currency-free capacity.
  //
  // The seeded sector is always domestic (HQ state ⇒ host country == corp
  // country), so host == `currencyCode`, but resolve it through the shared
  // helpers anyway so this stays correct if a spawn is ever cross-border.
  const sectorHostFxRate = await getSectorHostFxRate(db, { countryId }, corpDoc);
  const startingRevenueLocal = Math.round(
    writeCorpEconomicLocal(
      startingRevenue,
      resolveSectorHostCurrencyCode({ countryId }, corpDoc),
      sectorHostFxRate
    )
  );

  // Create the initial sector
  const sectorId = new ObjectId();
  const sectorDoc: Omit<CorporateSector, "_id"> & { _id: ObjectId } = {
    _id: sectorId,
    corporationId: corpDoc._id,
    countryId,
    stateId,
    sectorType: type,
    // Plants births grow via build orders, never via the growth slider.
    targetGrowthRate: plantsEnabled ? 0 : 3, // Moderate growth
    currentGrowthRate: 0,
    currentGrowthCost: 0,
    // HOST-currency, converted from the ₳ `startingRevenue` above.
    revenue: startingRevenueLocal,
    profitMargin,
    workers: DEFAULT_SECTOR_STARTING_WORKERS,
    ...(input.initialStrategyId ? { strategyId: input.initialStrategyId } : {}),
    createdAt: now,
    updatedAt: now,
    ...(plantsEnabled
      ? {
          capitalStock: startingCapacityUnits,
          ...seedPlantLedger(
            {
              sectorType: type,
              strategyId: input.initialStrategyId,
            },
            startingCapacityUnits
          ),
          // Born under plants — never needs the flip-turn migration.
          plantsStartTurn: input.foundedAtTurn ?? 0,
        }
      : {}),
  };

  await corporateSectorsCollection(db).insertOne(sectorDoc as CorporateSector);

  return { sectorId, capacityUnits: startingCapacityUnits };
}

/**
 * Spawn an NPP-run corporation.
 *
 * - Generates a new NPP character to serve as CEO.
 * - Creates a corporation with the NPP as ceoId and ceoType="npp".
 * - Allocates shares: 51% to NPP CEO, 49% to public float (purchasable by players).
 * - Creates one initial sector in the HQ state matching the corp type.
 * - Opens at the standard size for its lane, the same in every country.
 * - Does NOT charge founding costs — admin-spawned, no player wallet involved.
 */
export async function spawnNppCorporation(
  db: Db,
  input: SpawnNppCorporationInput
): Promise<SpawnNppCorporationResult> {
  const now = new Date();
  const {
    name,
    type,
    countryId,
    headquartersState,
    startingCapital: customCapital,
    startingRevenue: customRevenue,
    profitMargin: customMargin,
    brandColor,
    tickerSymbol: customTicker,
    nppPartyId,
  } = input;
  if (
    input.maximumStartingRevenue !== undefined &&
    (!Number.isFinite(input.maximumStartingRevenue) || input.maximumStartingRevenue <= 0)
  ) {
    throw new Error("Maximum seed revenue must be positive and finite");
  }
  // A planned economy has no private sector to spawn into. Throws rather than
  // returning a sentinel because every caller already handles a throw:
  // `batchSpawnNppCorporations` catches per-spawn and continues to the next
  // sector, and `nppFoundCorporation` catches and refunds the founding fee.
  //
  // This also defuses the NPP_CAPITAL_STATES booby trap below, where the
  // command-economy exclusion was encoded as an empty-string capital region with
  // the reasoning written on exactly one of ten entries.
  await assertPrivateEnterprisePermitted(db, countryId);

  // Validate state exists and belongs to the country
  const state = await statesCollection(db).findOne({ _id: headquartersState });
  if (!state) {
    throw new Error(`State "${headquartersState}" not found`);
  }
  if (state.countryId !== countryId) {
    throw new Error(
      `State "${headquartersState}" belongs to country "${state.countryId}", not "${countryId}"`
    );
  }
  const eraUnitScale = await loadWorldEraUnitScale(db);
  // Get currency for the country (preset-aware: 2027 euro members spawn EUR corps)
  const spawnPreset = await loadWorldPreset(db);
  const currencyCode =
    getSeedCurrencyCode(countryId, spawnPreset) ?? COUNTRY_CURRENCY_MAP[countryId];
  if (!currencyCode) {
    throw new Error(`No currency configured for country "${countryId}"`);
  }

  const preset = spawnPreset;

  // DENOMINATION: `startingRevenue` is ₳ (anchor) throughout this function and
  // is converted to the sector's HOST-state currency exactly once, at the
  // `corporateSectors` insert.
  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  const lane = type;
  const revenuePerUnit = revenuePerCapacityUnit(type, eraUnitScale);
  // Every opening corporation gets the same standard plants for its lane. An
  // explicit admin revenue or a deposit ceiling can only change that size.
  let startingRevenue: number;
  let startingUnits = 0;
  if (plantsEnabled) {
    startingUnits =
      customRevenue !== undefined ? customRevenue / revenuePerUnit : nppOpeningUnits(lane);
    if (input.maximumStartingRevenue !== undefined) {
      startingUnits = Math.min(startingUnits, input.maximumStartingRevenue / revenuePerUnit);
    }
    startingRevenue = startingUnits * revenuePerUnit;
  } else {
    startingRevenue = Math.min(
      customRevenue ?? DEFAULT_SECTOR_STARTING_REVENUE,
      input.maximumStartingRevenue ?? Infinity
    );
  }
  const profitMargin = customMargin ?? DEFAULT_PROFIT_MARGIN;

  const { corpDoc, corpId, npp, startingCapital, sequentialId, tickerSymbol } =
    await createNppCorporationShell(db, {
      name,
      type,
      countryId,
      headquartersState,
      currencyCode,
      preset,
      startingCapital: customCapital,
      brandColor,
      tickerSymbol: customTicker,
      realName: input.realName,
      nppPartyId,
      foundedAtTurn: input.foundedAtTurn,
      now,
    });

  const { sectorId } = await grantNppSector(db, {
    corpDoc,
    stateId: headquartersState,
    countryId,
    type,
    startingRevenue,
    startingCapacityUnitsStandard: startingUnits,
    profitMargin,
    initialStrategyId: input.initialStrategyId,
    foundedAtTurn: input.foundedAtTurn,
    plantsEnabled,
    now,
  });

  return {
    corporationId: corpId.toString(),
    sequentialId,
    name: corpDoc.name,
    type,
    countryId,
    headquartersState,
    startingCapital,
    startingRevenue,
    sectorId: sectorId.toString(),
    nppId: npp._id.toString(),
    nppName: npp.name,
    tickerSymbol,
  };
}

/**
 * Batch spawn NPP corporations for a country — one per sector type.
 * Uses the country's capital state as HQ for all corps.
 */
export async function batchSpawnNppCorporations(
  db: Db,
  countryId: CountryId,
  options?: {
    /** Specific sector types to spawn (default: every operating lane) */
    sectorTypes?: OperatingSectorType[];
    /** Explicit model identities, used by fresh model-aware seeds. */
    sectorMarkets?: Array<{
      type: CorporationType;
    }>;
    /** Starting capital per corp (default: 2M local currency) */
    startingCapital?: number;
    /** Opening recipe for a deposit-specific seed miner. */
    initialStrategyId?: string;
    maximumStartingRevenue?: number;
    /** HQ state (default: country capital from NPP_CAPITAL_STATES) */
    headquartersState?: string;
    /**
     * How many competing corps to spawn per sector type (default: 1). Each
     * one opens at the same standard size, so several per sector model real
     * intra-sector competition.
     */
    perSectorCount?: number;
  }
): Promise<SpawnNppCorporationResult[]> {
  const defaultHq = NPP_CAPITAL_STATES[countryId];
  if (!defaultHq) {
    throw new Error(`No capital state configured for country "${countryId}"`);
  }

  // Eligibility before attempts: a planned economy has no private sector to
  // spawn into, and without this check every sector/slot below throws
  // PrivateEnterpriseBlockedError inside the loop (51 console.errors for a
  // 3/sector batch across 17 sectors) while spawning nothing. The check reads
  // the same marketization-dial gate the single-spawn path enforces, so a
  // country converting either direction is honoured with no caller change.
  // Returns [] so callers treat blocked like already-seeded: nothing to do.
  if (await isPrivateEnterpriseBlocked(db, countryId)) {
    return [];
  }

  const hqState = options?.headquartersState ?? defaultHq;

  const sectorMarkets: Array<{
    type: CorporationType;
  }> =
    options?.sectorMarkets ??
    (options?.sectorTypes ?? OPERATING_SECTOR_TYPES).map((lane) => {
      return {
        type: lane,
      };
    });
  const perSectorCount = Math.max(1, Math.floor(options?.perSectorCount ?? 1));
  const results: SpawnNppCorporationResult[] = [];
  const existingNames = (
    await corporationsCollection(db)
      .find({ countryId })
      .project<{ name: string }>({ name: 1 })
      .toArray()
  ).map((corp) => corp.name);

  for (const { type } of sectorMarkets) {
    const lane = type;
    for (let i = 0; i < perSectorCount; i++) {
      // Generate a thematic name based on sector and country — passing the
      // growing results list (including same-sector prior spawns this loop)
      // keeps names distinct across all perSectorCount competitors.
      const name = generateNppCorpName(countryId, lane, [
        ...existingNames,
        ...results.map((r) => r.name),
      ]);

      try {
        const result = await spawnNppCorporation(db, {
          name,
          realName: "sector",
          type,
          countryId,
          headquartersState: hqState,
          startingCapital: options?.startingCapital,
          initialStrategyId: options?.initialStrategyId,
          maximumStartingRevenue: options?.maximumStartingRevenue,
        });
        results.push(result);
      } catch (err) {
        console.error(`[spawnNpp] Failed to spawn ${lane} corp for ${countryId}:`, err);
        // Continue with other sectors/slots
      }
    }
  }

  return results;
}

/** Country and industry flavor, with collision-safe choices from the shared rules. */
export function generateNppCorpName(
  countryId: CountryId,
  type: OperatingSectorType,
  existingNames: string[]
): string {
  return chooseNppCorporationName(countryId, type, existingNames, Math.random);
}
