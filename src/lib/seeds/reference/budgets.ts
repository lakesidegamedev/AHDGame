import {
  initializeIncomeTaxRates,
  incomeBaseShares,
  DEFAULT_INCOME_POPULATION,
} from "@/lib/budget/rules/incomeTaxTiers";
import { initializeCapitalGainsTaxRates } from "@/lib/budget/rules/capitalGainsTax";
import { NG_1991_NOMINAL_GDP_NGN } from "@/lib/countries/ng/data/ngGdp1991";
import { rebaseBudgetNominals } from "./rules/rebaseBudgetNominals";
import { anchorBudget1991 } from "./rules/anchorBudget1991";
import { projectBudget2027 } from "./rules/projectBudget2027";
import { NATIONAL_FIGURES_2027 } from "./nationalFigures2027";
import { calibrateOpeningInflation1991 } from "./openingInflation1991";
import {
  FISCAL_ANCHORS_1991,
  FISCAL_ANCHOR_COUNTRIES_1991,
  gdp1991LegacyLcu,
  type FiscalAnchorCountry1991,
} from "@/lib/constants/fiscalAnchors1991";
import { IRISH_GROSS_GOVERNMENT_DEBT_1991_IEP, NATIVE_NOMINAL_GDP_1991 } from "./nominalGdp1991";
import {
  fitOpeningFiscalEnvelope,
  PLAYER_RESET_DEFICIT_GDP_SHARE_1991,
} from "./rules/openingFiscalEnvelope";
import { ObjectId } from "mongodb";
import { calculatePolicyOptionAnnualCost } from "@/lib/budget/costs";
import { computeTaxBaseGdpShareBaseline } from "@/lib/budget/revenue";
import { isLegislationTypeActive } from "@/lib/era/legislationCatalog";
import { getCostClass } from "@/lib/era/legislationCostCatalog";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { EnactedLaw, FederalBudget, StateBudget } from "@/lib/db/types/budget";
import type { LegislationPolicyOption, LegislationType } from "@/lib/db/types/legislation";
import {
  SECTOR_MARKET_GDP_FRACTION,
  SECTOR_TYPE_COUNT,
  OPERATING_SECTOR_TYPE_LABELS,
  OPERATING_SECTOR_TYPES,
  operatingSectorIdentity,
  corporationTypeOfLane,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import type { CorporationType } from "@/lib/constants/corporations";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { computeSectorImpliedUnits } from "@/lib/market/unownedHeadroom";
import {
  commandEconomySoeSectors,
  scheduledMarketizationLevel,
  COMMAND_CEILING,
} from "@/lib/constants/commandEconomy";
import { getEraTrendGdpGrowth } from "@/lib/constants/monetaryEra";
import { makeSeedSoeState } from "@/lib/economy/soe";
import { HOUSEHOLD_PRICE_INDEX_BASELINE } from "@/lib/economy/householdPriceIndex";
import {
  COUNTRY_POLICY_CONFIGS,
  NATIONAL_DEFAULT_OPTION_INDEXES,
  NATIONAL_DEFAULTS,
  UK_NATIONAL_DEFAULT_OPTION_INDEXES,
  UK_NATIONAL_DEFAULTS,
} from "./basePolicies";
import { INITIAL_RATES, getInitialRates } from "@/lib/constants/currencies";
import {
  TRANSITION_1991_BUDGET_COUNTRIES,
  shouldUseFullAuthoredBudgetBaseline,
} from "./rules/budgetBaselineMode";
import { euroConversionFactor, isEuroAdopted } from "@/lib/currency/rules/euroAdoption";
import { US_NATIONAL_BUDGET_2023 } from "@/lib/countries/us/data/nationalBudget2023";
import { US_NATIONAL_BUDGET_2027 } from "@/lib/countries/us/data/nationalBudget2027";
import { HU_NATIONAL_BUDGET_2027 } from "@/lib/countries/hu/data/nationalBudget2027";
import { BG_NATIONAL_BUDGET_2027 } from "@/lib/countries/bg/data/nationalBudget2027";
import { CA_NATIONAL_BUDGET_2027 } from "@/lib/countries/ca/data/nationalBudget2027";
import { US_NATIONAL_BUDGET_2007 } from "@/lib/countries/us/data/nationalBudget2007";
import { US_NATIONAL_BUDGET_1999 } from "@/lib/countries/us/data/nationalBudget1999";
import { US_NATIONAL_BUDGET_1991 } from "@/lib/countries/us/data/nationalBudget1991";
import { UK_NATIONAL_BUDGET_1991 } from "@/lib/countries/uk/data/nationalBudget1991";
import { JP_NATIONAL_BUDGET_1991 } from "@/lib/countries/jp/data/nationalBudget1991";
import { DE_NATIONAL_BUDGET_1991 } from "@/lib/countries/de/data/nationalBudget1991";
import { IE_NATIONAL_BUDGET_1991 } from "@/lib/countries/ie/data/nationalBudget1991";
import { BR_NATIONAL_BUDGET_1991 } from "@/lib/countries/br/data/nationalBudget1991";
import { CN_NATIONAL_BUDGET_1991 } from "@/lib/countries/cn/data/nationalBudget1991";
import { NG_NATIONAL_BUDGET_1991 } from "@/lib/countries/ng/data/nationalBudget1991";
import { FR_NATIONAL_BUDGET_1991 } from "@/lib/countries/fr/data/nationalBudget1991";
import { IT_NATIONAL_BUDGET_1991 } from "@/lib/countries/it/data/nationalBudget1991";
import { ES_NATIONAL_BUDGET_1991 } from "@/lib/countries/es/data/nationalBudget1991";
import { SE_NATIONAL_BUDGET_1991 } from "@/lib/countries/se/data/nationalBudget1991";
import { TR_NATIONAL_BUDGET_1991 } from "@/lib/countries/tr/data/nationalBudget1991";
import { COUNTRY_POLICY_CONFIGS_1953 } from "./basePolicies1953";
import { US_NATIONAL_BUDGET_1953 } from "@/lib/countries/us/data/nationalBudget1953";
import { UK_NATIONAL_BUDGET_1953 } from "@/lib/countries/uk/data/nationalBudget1953";
import { RU_NATIONAL_BUDGET_1953 } from "@/lib/countries/ru/data/nationalBudget1953";
import { FR_NATIONAL_BUDGET_1953 } from "@/lib/countries/fr/data/nationalBudget1953";
import { IT_NATIONAL_BUDGET_1953 } from "@/lib/countries/it/data/nationalBudget1953";
import { ES_NATIONAL_BUDGET_1953 } from "@/lib/countries/es/data/nationalBudget1953";
import { SE_NATIONAL_BUDGET_1953 } from "@/lib/countries/se/data/nationalBudget1953";
import { TR_NATIONAL_BUDGET_1953 } from "@/lib/countries/tr/data/nationalBudget1953";
import { GR_NATIONAL_BUDGET_1953 } from "@/lib/countries/gr/data/nationalBudget1953";
import { AT_NATIONAL_BUDGET_1953 } from "@/lib/countries/at/data/nationalBudget1953";
import { FI_NATIONAL_BUDGET_1953 } from "@/lib/countries/fi/data/nationalBudget1953";
import { DE_NATIONAL_BUDGET_1953 } from "@/lib/countries/de/data/nationalBudget1953";
import { JP_NATIONAL_BUDGET_1953 } from "@/lib/countries/jp/data/nationalBudget1953";
import { CN_NATIONAL_BUDGET_1953 } from "@/lib/countries/cn/data/nationalBudget1953";
import { BR_NATIONAL_BUDGET_1953 } from "@/lib/countries/br/data/nationalBudget1953";
import { IE_NATIONAL_BUDGET_1953 } from "@/lib/countries/ie/data/nationalBudget1953";
import { NG_NATIONAL_BUDGET_1953 } from "@/lib/countries/ng/data/nationalBudget1953";
import { DD_NATIONAL_BUDGET_1953 } from "@/lib/countries/dd/data/nationalBudget1953";
import { US_NATIONAL_BUDGET_1979 } from "@/lib/countries/us/data/nationalBudget1979";
import { RU_NATIONAL_BUDGET_1979 } from "@/lib/countries/ru/data/nationalBudget1979";
import { FR_NATIONAL_BUDGET_1979 } from "@/lib/countries/fr/data/nationalBudget1979";
import { IT_NATIONAL_BUDGET_1979 } from "@/lib/countries/it/data/nationalBudget1979";
import { ES_NATIONAL_BUDGET_1979 } from "@/lib/countries/es/data/nationalBudget1979";
import { SE_NATIONAL_BUDGET_1979 } from "@/lib/countries/se/data/nationalBudget1979";
import { TR_NATIONAL_BUDGET_1979 } from "@/lib/countries/tr/data/nationalBudget1979";
import { GR_NATIONAL_BUDGET_1979 } from "@/lib/countries/gr/data/nationalBudget1979";
import { AT_NATIONAL_BUDGET_1979 } from "@/lib/countries/at/data/nationalBudget1979";
import { FI_NATIONAL_BUDGET_1979 } from "@/lib/countries/fi/data/nationalBudget1979";
import { DD_NATIONAL_BUDGET_1979 } from "@/lib/countries/dd/data/nationalBudget1979";
import { HU_NATIONAL_BUDGET_1979 } from "@/lib/countries/hu/data/nationalBudget1979";
import { UK_NATIONAL_BUDGET_1979 } from "@/lib/countries/uk/data/nationalBudget1979";
import { DE_NATIONAL_BUDGET_1979 } from "@/lib/countries/de/data/nationalBudget1979";
import { JP_NATIONAL_BUDGET_1979 } from "@/lib/countries/jp/data/nationalBudget1979";
import { CN_NATIONAL_BUDGET_1979 } from "@/lib/countries/cn/data/nationalBudget1979";
import { BR_NATIONAL_BUDGET_1979 } from "@/lib/countries/br/data/nationalBudget1979";
import { IE_NATIONAL_BUDGET_1979 } from "@/lib/countries/ie/data/nationalBudget1979";
import { NG_NATIONAL_BUDGET_1979 } from "@/lib/countries/ng/data/nationalBudget1979";
import { SUCCESSOR_NATIONAL_BUDGETS_1991 } from "./successorBudgets1991";
import { MODERN_NATIONAL_BUDGETS_2019 } from "./modernBudgets2019";
import { legislationTypes } from "./legislationTypes";
import { SEED_FISCAL_LEVERS } from "./seedFiscalLadders";
import { OPENING_PROGRAM_SPENDING } from "./openingProgramSpending";
import { jpRegionalLevers } from "@/lib/countries/jp/data/jpRegionalLevers";
import { cnRegionalLevers } from "@/lib/countries/cn/data/cnRegionalLevers";
import { ieLegislationTypes } from "@/lib/seeds/ie/ieLegislationTypes";
import { brLegislationTypes } from "@/lib/seeds/br/brLegislationTypes";
import { frLegislationTypes } from "@/lib/seeds/fr/frLegislationTypes";
import { itLegislationTypes } from "@/lib/seeds/it/itLegislationTypes";
import { esLegislationTypes } from "@/lib/seeds/es/esLegislationTypes";
import { seLegislationTypes } from "@/lib/seeds/se/seLegislationTypes";
import { trLegislationTypes } from "@/lib/seeds/tr/trLegislationTypes";
import { grLegislationTypes } from "../gr/grLegislationTypes";
import { atLegislationTypes } from "../at/atLegislationTypes";
import { fiLegislationTypes } from "../fi/fiLegislationTypes";
import { huLegislationTypes } from "@/lib/seeds/hu/huLegislation";
import { plLegislationTypes } from "@/lib/seeds/pl/plLegislation";
import { roLegislationTypes } from "@/lib/seeds/ro/roLegislation";
import { yuLegislationTypes } from "@/lib/seeds/yu/yuLegislation";
import { bgLegislationTypes } from "@/lib/seeds/bg/bgLegislation";
import { blrLegislationTypes } from "@/lib/seeds/blr/blrLegislation";
import { csLegislationTypes } from "@/lib/seeds/cs/csLegislation";
import { balLegislationTypes } from "@/lib/seeds/bal/balLegislation";
import { easternBlocPolicyConfig } from "@/lib/seeds/shared/easternBlocLegislation";
import { deRegionalBudgetInputs } from "@/lib/seeds/de/deBudgets";
import { ieRegionalBudgetInputs } from "@/lib/seeds/ie/ieBudgets";
import { brRegionalBudgetInputs } from "@/lib/seeds/br/brBudgets";
import { cnRegionalBudgetInputs } from "@/lib/seeds/cn/cnBudgets";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode as ActiveCurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP, getSeedCurrencyCode } from "@/lib/constants/currencies";
import type { LegalStructureId } from "@/lib/constants/legalStructures";
import {
  DE_PUBLIC_CORPORATION_OID,
  DE_PUBLIC_CEO_OID,
  DE_PUBLIC_USER_OID,
  DE_PUBLIC_SEQUENTIAL_ID,
} from "@/lib/seeds/de/deCorporations";
import {
  IE_PUBLIC_CORPORATION_OID,
  IE_PUBLIC_CEO_OID,
  IE_PUBLIC_USER_OID,
  IE_PUBLIC_SEQUENTIAL_ID,
} from "@/lib/seeds/ie/ieCorporations";
import {
  BR_PUBLIC_CORPORATION_OID,
  BR_PUBLIC_CEO_OID,
  BR_PUBLIC_USER_OID,
  BR_PUBLIC_SEQUENTIAL_ID,
} from "@/lib/seeds/br/brCorporations";
import {
  CN_PUBLIC_CORPORATION_OID,
  CN_PUBLIC_CEO_OID,
  CN_PUBLIC_USER_OID,
  CN_PUBLIC_SEQUENTIAL_ID,
} from "@/lib/seeds/cn/cnCorporations";
import {
  NG_PUBLIC_CORPORATION_OID,
  NG_PUBLIC_CEO_OID,
  NG_PUBLIC_USER_OID,
  NG_PUBLIC_SEQUENTIAL_ID,
} from "@/lib/seeds/ng/ngCorporations";
import {
  DD_PUBLIC_CORPORATION_OID,
  DD_PUBLIC_CEO_OID,
  DD_PUBLIC_USER_OID,
  DD_PUBLIC_SEQUENTIAL_ID,
} from "@/lib/seeds/dd/ddCorporations";
import { getCountryConfig } from "@/lib/constants/countries";
import { computeUnownedSeedRevenue } from "@/lib/admin/seed/seedUnownedSectors";
import { getStateResourceCapacity, lookupStateResourceCapacity } from "./stateResourceCapacity";
import { CA_ECONOMY } from "@/lib/countries/ca/economy";

/**
 * Default legal structure stamped on each country's sovereign issuer corporation.
 * Mirrors the per-country defaults from
 * a retired migration, folded into
 * the seed so a fresh world doesn't depend on the backfill migration ever
 * running.
 */
export const SOVEREIGN_CORP_LEGAL_STRUCTURE: Partial<Record<CountryId, LegalStructureId>> = {
  US: US_ECONOMY.sovereignCorpLegalStructure,
  UK: UK_ECONOMY.sovereignCorpLegalStructure,
  JP: JP_ECONOMY.sovereignCorpLegalStructure,
  DE: DE_ECONOMY.sovereignCorpLegalStructure,
  IE: IE_ECONOMY.sovereignCorpLegalStructure,
  CA: CA_ECONOMY.sovereignCorpLegalStructure,
  BR: BR_ECONOMY.sovereignCorpLegalStructure,
  CN: CN_ECONOMY.sovereignCorpLegalStructure,
  NG: NG_ECONOMY.sovereignCorpLegalStructure,
  // The USSR has no bespoke joint-stock legal form (Cold-War command economy);
  // the neutral fallback keeps corporationTurn able to process the RU state
  // enterprise. See GENERIC_LEGAL_STRUCTURE in constants/legalStructures.ts.
  RU: RU_ECONOMY.sovereignCorpLegalStructure,
  // Same reasoning as RU: a planned economy has no bespoke joint-stock form.
  DD: DD_ECONOMY.sovereignCorpLegalStructure,
  // Warsaw-Pact satellites (Command Economy v2 SOE stack, refs command-economy
  // seed-gap fix): none of these ran a bespoke joint-stock corporate form
  // either — same neutral fallback as RU/DD.
  PL: PL_ECONOMY.sovereignCorpLegalStructure,
  HU: HU_ECONOMY.sovereignCorpLegalStructure,
  CS: CS_ECONOMY.sovereignCorpLegalStructure,
  BG: BG_ECONOMY.sovereignCorpLegalStructure,
  UKR: UKR_ECONOMY.sovereignCorpLegalStructure,
  BLR: BLR_ECONOMY.sovereignCorpLegalStructure,
  BAL: BAL_ECONOMY.sovereignCorpLegalStructure,
  RO: RO_ECONOMY.sovereignCorpLegalStructure,
  // Yugoslavia — command economy, no bespoke joint-stock form (see YU's SOE
  // note above on why it isn't grouped with the Warsaw-Pact five).
  YU: YU_ECONOMY.sovereignCorpLegalStructure,
  // Econ-tier market democracies (corporate-sector seed-gap fix): promoted
  // from the abstract sphere-macro tier to full-autonomous (seedEconTierRosters
  // seedManifest.ts) with no bespoke joint-stock legal form authored yet
  // — same neutral fallback used for every other country here without one.
  FR: FR_ECONOMY.sovereignCorpLegalStructure,
  IT: IT_ECONOMY.sovereignCorpLegalStructure,
  ES: ES_ECONOMY.sovereignCorpLegalStructure,
  SE: SE_ECONOMY.sovereignCorpLegalStructure,
  TR: TR_ECONOMY.sovereignCorpLegalStructure,
  GR: GR_ECONOMY.sovereignCorpLegalStructure,
  AT: AT_ECONOMY.sovereignCorpLegalStructure,
  FI: FI_ECONOMY.sovereignCorpLegalStructure,
};

const budgetLegislationTypes = [
  ...legislationTypes,
  ...jpRegionalLevers,
  ...cnRegionalLevers,
  ...ieLegislationTypes,
  ...brLegislationTypes,
  ...frLegislationTypes,
  ...itLegislationTypes,
  ...esLegislationTypes,
  ...seLegislationTypes,
  ...trLegislationTypes,
  ...grLegislationTypes,
  ...atLegislationTypes,
  ...fiLegislationTypes,
  ...huLegislationTypes,
  ...plLegislationTypes,
  ...roLegislationTypes,
  ...yuLegislationTypes,
  ...bgLegislationTypes,
  ...blrLegislationTypes,
  ...csLegislationTypes,
  ...balLegislationTypes,
];

type SupportedBudgetCountryId =
  | "US"
  | "UK"
  | "JP"
  | "DE"
  | "IE"
  | "BR"
  | "CN"
  | "NG"
  | "RU"
  | "FR"
  | "IT"
  | "ES"
  | "SE"
  | "TR"
  | "GR"
  | "AT"
  | "FI"
  | "DD"
  | "HU"
  | "PL"
  | "RO"
  | "YU"
  | "BG"
  | "BLR"
  | "UKR"
  | "CS"
  | "BAL"
  | "CA";
type SupportedNationalBudget = Omit<FederalBudget, "updatedAt">;

export interface NationalBudgetSeedConfig {
  budgetId: string;
  countryId: SupportedBudgetCountryId;
  fiscalYear: number;
  /**
   * Era the row's economic factors and fiscal calibration were authored for.
   * Set by {@link overlayNationalBudgetConfigs} when a row is carried into a
   * newer preset without an explicit override, so rewriting `fiscalYear` can
   * never disguise stale factors as authored for the target era.
   * Absent on explicitly authored rows, where it equals `fiscalYear`.
   */
  sourceFiscalYear?: number;
  population: number;
  gdp: number;
  currencyCode:
    | "USD"
    | "GBP"
    | "JPY"
    | "EUR"
    | "IEP"
    | "BRL"
    | "CNY"
    | "NGN"
    | "SUR"
    | "RUB"
    | "PLN"
    | "RON"
    | "BGN"
    | "FRF"
    | "ITL"
    | "ESP"
    | "SEK"
    | "TRL"
    | "TRY"
    | "GRD"
    | "ATS"
    | "FIM"
    | "DDM"
    | "HUF"
    | "PLZ"
    | "ROL"
    | "YUD"
    | "BGL"
    | "CSK"
    | "CAD";
  economicFactors: SupportedNationalBudget["economicFactors"];
  taxBaseRatios: {
    taxableIncome: number;
    /**
     * Total corporate-profits share of GDP. Split 75/25 into domestic/foreign during
     * budget construction. Kept as a single config field so existing tunings transfer
     * directly; consumers that need the split read `buildTaxBases()`.
     */
    corporateProfits: number;
    wagesAndSalaries: number;
    importValue: number;
    taxableSales: number;
  };
  otherRevenue: number;
  debt: SupportedNationalBudget["debt"];
  creditRating: SupportedNationalBudget["creditRating"];
  baselineSpendingByCategory: Record<string, number>;
  baselineStateGrants: number;
  /** Use the reset's calibrated program envelope in both the budget and enacted laws. */
  calibratedSpendingBaseline?: boolean;
  policyRevenueConfigs?: Array<{
    legislationTypeId: string;
    revenueKey: keyof SupportedNationalBudget["revenue"];
    annualRevenuePerCapitaByOptionIndex?: number[];
    gdpRevenueMultiplierByOptionIndex?: number[];
  }>;
  policyDefaults: Record<string, { economic: number; social: number }>;
  policyOptionOverrides: Record<string, number>;
  /** Use the forecast baseline without an obsolete era's statute catalog. */
  skipLegacyLegislation?: boolean;
  /**
   * Political-legislation derivation switch (spec §4.2a): when set, the seeded
   * `federalBudget.taxRates` are written verbatim from this authored table
   * (SEED_TAX_RATES_1953[country]) and the legacy taxPolicyIds/option-index
   * derivation is skipped entirely. The 1953 US/UK/RU/DD blocks use this for
   * their authored tax-law catalog. The 2027 BG forecast uses it while its
   * obsolete Cold War statute catalog is explicitly excluded.
   */
  seedTaxRatesOverride?: Record<string, number>;
  taxPolicyIds: {
    incomeTax?: string;
    domesticCorporateTax?: string;
    /**
     * Foreign corporate tax bill id. The bill itself is seeded separately.
     * If absent, the foreign rate mirrors the domestic rate at seed time (day-one parity).
     */
    foreignCorporateTax?: string;
    payrollTax?: string;
    tariffs?: string;
    salesTax?: string;
    /**
     * DE-only Solidaritätszuschlag bill id. When set, the seeded FederalBudget.taxRates
     * picks up the default rate via `deriveTaxRates`. Non-DE countries omit.
     */
    solidaritySurcharge?: string;
    /**
     * CN-only Land Value-Added Tax (土地增值税) bill id. Optional, omitted by non-CN countries.
     */
    landValueAddedTax?: string;
    /**
     * CN-only Urban Maintenance & Construction Tax (城市维护建设税) bill id. Optional —
     * non-CN countries omit. with the CN legislation overhaul.
     */
    urbanMaintenanceTax?: string;
    /**
     * CN-only Stamp Duty (印花税) bill id. Optional, omitted by non-CN countries.
     */
    stampDuty?: string;
    /**
     * Property tax bill id. Optional — countries with a propertyTax dial set
     * this to their property-tax legislation type (IE: ie_local_property_tax).
     */
    propertyTax?: string;
    /**
     * IE-only Universal Social Charge bill id. Optional, omitted by non-IE countries.
     */
    universalSocialCharge?: string;
    /**
     * IE-only Capital Gains Tax bill id. Optional, omitted by non-IE countries.
     */
    capitalGainsTax?: string;
    /**
     * IE-only Excise Duty bill id. Optional, omitted by non-IE countries.
     */
    exciseDuty?: string;
  };
  /**
   * Direct tax-rate overrides (percentages) for dials not yet backed by seeded
   * legislation types. Merged last in `deriveTaxRates`, so they win over both the
   * legislation lookup and the foreign-corporate mirror. Stopgap for countries
   * with no tax-legislation module yet (cf. BR, whose taxPolicyIds reference
   * legislation-type ids that are defined nowhere → every rate would seed to 0,
   * i.e. permanent zero-revenue). Keys are FederalTaxRates fields.
   */
  taxRateOverrides?: Partial<SupportedNationalBudget["taxRates"]>;
}

function findMatchedOption<T extends Pick<LegislationPolicyOption, "economic" | "social">>(
  options: readonly T[] | undefined,
  economic: number,
  social: number
): T | undefined {
  if (!options?.length) return undefined;

  const exact = options.find((option) => option.economic === economic && option.social === social);
  if (exact) return exact;

  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const distance =
      Math.abs((option.economic ?? 0) - economic) + Math.abs((option.social ?? 0) - social);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }

  return best;
}

function buildTaxBases(config: NationalBudgetSeedConfig): SupportedNationalBudget["taxBases"] {
  // Split the total corporate-profits share 75/25 into domestic/foreign. This is the
  // bootstrap ratio per the migration spec; per-turn simulation overwrites both fields
  // with actual accumulated corp income.
  const totalCorporateProfits = config.gdp * config.taxBaseRatios.corporateProfits;
  return {
    taxableIncome: config.gdp * config.taxBaseRatios.taxableIncome,
    domesticCorporateProfits: totalCorporateProfits * 0.75,
    foreignCorporateProfits: totalCorporateProfits * 0.25,
    wagesAndSalaries: config.gdp * config.taxBaseRatios.wagesAndSalaries,
    importValue: config.gdp * config.taxBaseRatios.importValue,
    taxableSales: config.gdp * config.taxBaseRatios.taxableSales,
  };
}

function getPolicyDefaults(config: NationalBudgetSeedConfig, legislationTypeId: string) {
  return config.policyDefaults[legislationTypeId] ?? { economic: 0, social: 0 };
}

function getDefaultPolicyOption<
  T extends {
    _id: string;
    policyOptions?: readonly Pick<LegislationPolicyOption, "economic" | "social">[];
  },
>(
  config: NationalBudgetSeedConfig,
  legislationType: T
): NonNullable<T["policyOptions"]>[number] | undefined {
  const overrideIndex = config.policyOptionOverrides[legislationType._id];
  if (overrideIndex !== undefined) {
    return legislationType.policyOptions?.[overrideIndex];
  }

  const defaults = getPolicyDefaults(config, legislationType._id);
  return findMatchedOption(legislationType.policyOptions, defaults.economic, defaults.social);
}

function deriveTaxRates(
  config: NationalBudgetSeedConfig,
  typesById: Map<string, LegislationType>
): SupportedNationalBudget["taxRates"] {
  const taxRates: SupportedNationalBudget["taxRates"] = {
    incomeTax: 0,
    domesticCorporateTax: 0,
    foreignCorporateTax: 0,
    payrollTax: 0,
    tariffs: 0,
    salesTax: 0,
  };

  // Spec §4.2a: authored-table override — the full six-key rate set verbatim,
  // no option-index derivation. See NationalBudgetSeedConfig.seedTaxRatesOverride.
  if (config.seedTaxRatesOverride) {
    return { ...taxRates, ...config.seedTaxRatesOverride };
  }

  for (const [taxType, legislationTypeId] of Object.entries(config.taxPolicyIds)) {
    if (!legislationTypeId) continue;
    const legislationType =
      SEED_FISCAL_LEVERS.get(legislationTypeId) ?? typesById.get(legislationTypeId);
    const defaultOption = legislationType
      ? getDefaultPolicyOption(config, legislationType)
      : undefined;
    const rate = defaultOption?.rate;
    if (rate !== undefined) {
      (taxRates as unknown as Record<string, number>)[taxType] = rate;
    }
  }

  // Day-one parity: if foreign bill is not yet seeded (not yet seeded), mirror the domestic rate.
  // Once taxPolicyIds.foreignCorporateTax is populated this branch is a no-op.
  if (!config.taxPolicyIds.foreignCorporateTax) {
    taxRates.foreignCorporateTax = taxRates.domesticCorporateTax;
  }

  // Direct overrides for dials whose taxPolicyIds reference unseeded legislation
  // types (deriveTaxRates would otherwise leave them at 0). Applied last so they
  // are authoritative over the legislation lookup and the foreign-mirror fallback.
  if (config.taxRateOverrides) {
    for (const [taxType, rate] of Object.entries(config.taxRateOverrides)) {
      if (typeof rate === "number" && Number.isFinite(rate)) {
        (taxRates as unknown as Record<string, number>)[taxType] = rate;
      }
    }
  }

  return taxRates;
}

function derivePolicyRevenueLines(
  config: NationalBudgetSeedConfig,
  typesById: Map<string, LegislationType>
): Partial<SupportedNationalBudget["revenue"]> {
  const revenueLines: Partial<SupportedNationalBudget["revenue"]> = {};

  for (const revenueConfig of config.policyRevenueConfigs ?? []) {
    const legislationType =
      SEED_FISCAL_LEVERS.get(revenueConfig.legislationTypeId) ??
      typesById.get(revenueConfig.legislationTypeId);
    if (!legislationType?.policyOptions?.length) continue;

    const defaultOption = getDefaultPolicyOption(config, legislationType);
    if (!defaultOption) continue;

    const optionIndex = legislationType.policyOptions.findIndex(
      (option) => option.id === defaultOption.id
    );
    if (optionIndex < 0) continue;

    const revenueFromPopulation = revenueConfig.annualRevenuePerCapitaByOptionIndex?.[optionIndex];
    const revenueFromGdp = revenueConfig.gdpRevenueMultiplierByOptionIndex?.[optionIndex];

    let annualRevenue = 0;
    if (revenueFromPopulation !== undefined) {
      annualRevenue += revenueFromPopulation * config.population;
    }
    if (revenueFromGdp !== undefined) {
      annualRevenue += revenueFromGdp * config.gdp;
    }
    if (annualRevenue === 0) continue;

    revenueLines[revenueConfig.revenueKey] = Math.round(annualRevenue);
  }

  return revenueLines;
}

import { isPoliticalMetricsCountry } from "@/lib/politicalMetrics/types";
import { JP_ECONOMY } from "@/lib/countries/jp/economy";
import {
  JP_DEFAULT_REGIONAL_TAX_RATES,
  JP_EXTRA_OVERRIDE_CATEGORIES,
  JP_GRANT_MULTIPLIER,
} from "@/lib/countries/jp/economy";
import { US_ECONOMY } from "@/lib/countries/us/economy";
import { UK_ECONOMY } from "@/lib/countries/uk/economy";
import { DE_ECONOMY } from "@/lib/countries/de/economy";
import { CN_ECONOMY } from "@/lib/countries/cn/economy";
import { IE_ECONOMY } from "@/lib/countries/ie/economy";
import { RU_ECONOMY } from "@/lib/countries/ru/economy";
import { DD_ECONOMY } from "@/lib/countries/dd/economy";
import { NG_ECONOMY } from "@/lib/countries/ng/economy";
import { BR_ECONOMY } from "@/lib/countries/br/economy";
import { FR_ECONOMY } from "@/lib/countries/fr/economy";
import { IT_ECONOMY } from "@/lib/countries/it/economy";
import { ES_ECONOMY } from "@/lib/countries/es/economy";
import { SE_ECONOMY } from "@/lib/countries/se/economy";
import { TR_ECONOMY } from "@/lib/countries/tr/economy";
import { GR_ECONOMY } from "@/lib/countries/gr/economy";
import { AT_ECONOMY } from "@/lib/countries/at/economy";
import { FI_ECONOMY } from "@/lib/countries/fi/economy";
import { PL_ECONOMY } from "@/lib/countries/pl/economy";
import { HU_ECONOMY } from "@/lib/countries/hu/economy";
import { RO_ECONOMY } from "@/lib/countries/ro/economy";
import { YU_ECONOMY } from "@/lib/countries/yu/economy";
import { BG_ECONOMY } from "@/lib/countries/bg/economy";
import { CS_ECONOMY } from "@/lib/countries/cs/economy";
import { BLR_ECONOMY } from "@/lib/countries/blr/economy";
import { UKR_ECONOMY } from "@/lib/countries/ukr/economy";
import { BAL_ECONOMY } from "@/lib/countries/bal/economy";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { tierFor } from "@/lib/world/eraRoster";

/**
 * Authored historical fiscal baselines for 1953 (Korean War defense shares,
 * pre-Medicare healthcare, occupation-cost DE defense). The modern catalog's
 * per-capita costs preserve 1991 composition even after GDP scaling.
 *
 * Political-legislation countries use the full authored table. Other 1953
 * countries only override defense/healthcare so command-economy and developing
 * baselines don't invent 30-40% GDP deficits against modern-derived revenue.
 */
const BASELINE_OVERRIDE_CATEGORIES = ["defense", "healthcare", "health"] as const;

/**
 * Per-country extensions to {@link BASELINE_OVERRIDE_CATEGORIES}: categories
 * whose authored 1953 baseline is historically load-bearing enough to pin
 * exactly like defense/healthcare, beyond the shared defaults. Added
 * surgically per country (never to the shared list) so widening one
 * country's coverage can't perturb another's already-tuned 1953 balance.
 *
 * CN: "infrastructure" is the First-Five-Year-Plan's defining category (Soviet
 * -assisted heavy industry, the 156 key projects) — the single biggest line in
 * CN's authored baseline. Pricing it off the modern per-domain era catalog
 * (calibrated for 2023 CN's marginal infrastructure policy, not a command
 * economy's total investment programme) collapses CN spending to under 10% of
 * GDP.
 *
 * JP: "infrastructure" (the authored key was "publicWorks" — see the 1953 JP
 * config rename below — a name mismatch that made the reconstruction-
 * infrastructure line invisible to both this override AND
 * `resolveInfraEnvelope`'s `baselineSpendingByCategory.infrastructure` read).
 * "social" similarly replaces the authored "socialSecurity" key, which never
 * matched any JP legislation type's actual `budgetCategory` ("social").
 *
 * BR: "socialSecurity", "infrastructure", "education", "other" — Brazil's
 * legislation module (brLegislationTypes.ts) authors exactly one spending law
 * per budget category (plus a grant law, see GRANT_OVERRIDE_COUNTRIES), so
 * pinning every category (not just defense/healthcare) makes the day-1 seed
 * reproduce the authored 1953 baseline exactly rather than whatever the
 * per-capita ladder's default option happens to compute.
 *
 * AT/FI/FR/GR/IT/SE/TR: "socialSecurity", "education", "infrastructure",
 * "other", the seven market-democracy 1953 seeds would otherwise fall back to
 * `baselineSpendingByCategory` wholesale (their sole legislation type touching
 * the budget was the welfare-state law, and it carried no cost — see the
 * legislationCostCatalog.ts header). Each now authors one `gdpPerCapitaMultiplier`-
 * costed spending law per category: the
 * welfare-state law for socialSecurity, plus new health/education/
 * infrastructure/defense/other/grant laws. Pinning the four non-defense/
 * non-healthcare categories here is the same safety net BR uses — the
 * per-country ladders are calibrated to reconcile exactly already, so this
 * only guards against rounding drift in the seed snapshot, not the runtime
 * per-turn cost (which reads the authored `gdpPerCapitaMultiplier` directly).
 */
const EXTRA_OVERRIDE_CATEGORIES_BY_COUNTRY: Partial<Record<string, readonly string[]>> = {
  CN: ["infrastructure"],
  JP: JP_EXTRA_OVERRIDE_CATEGORIES,
  BR: ["socialSecurity", "infrastructure", "education", "other"],
  AT: ["socialSecurity", "education", "infrastructure", "other"],
  FI: ["socialSecurity", "education", "infrastructure", "other"],
  FR: ["socialSecurity", "education", "infrastructure", "other"],
  GR: ["socialSecurity", "education", "infrastructure", "other"],
  IT: ["socialSecurity", "education", "infrastructure", "other"],
  SE: ["socialSecurity", "education", "infrastructure", "other"],
  TR: ["socialSecurity", "education", "infrastructure", "other"],
};

/**
 * Countries whose sole `isGrant` 1953 law should be rescaled to the authored
 * `baselineStateGrants` figure, mirroring the category rescale below. JP's
 * Local Allocation Tax Act (地方交付税) is a real, large equalization-grant
 * mechanism (authored at ¥1.11B ≈ 4.3% of GDP) that was booking only its thin
 * modern-era-catalog gdpCostFraction share (≈0.1% of GDP) — the `spending.ts`
 * `CONFIG_DERIVED_TRANSFER_FIELD` comment's claim that "JP's isGrant funding
 * laws already book the grant" was true only in the sense that a law existed,
 * not that it booked the authored amount. CN's central-transfer pool is
 * handled separately via `CONFIG_DERIVED_TRANSFER_FIELD` (regional-processor
 * config, not an enacted law) and does not need this treatment.
 */
// BR's sole `isGrant` law (Auxílios aos Estados Act, brLegislationTypes.ts) gets
// the same treatment so its booked cost matches the authored
// `baselineStateGrants` (~3% of GDP) exactly rather than its per-capita
// ladder's raw default.
// AT/FI/FR/GR/IT/SE/TR each authored a new `isGrant` local-government transfer
// law (at_local_grants et al., fiscal-scale), same treatment
// so it reconciles to `baselineStateGrants` exactly.
const GRANT_OVERRIDE_COUNTRIES = new Set(["JP", "BR", "AT", "FI", "FR", "GR", "IT", "SE", "TR"]);

function overrideCategoriesFor(countryId: string): Set<string> {
  const extra = EXTRA_OVERRIDE_CATEGORIES_BY_COUNTRY[countryId.toUpperCase()] ?? [];
  return new Set<string>([...BASELINE_OVERRIDE_CATEGORIES, ...extra]);
}

function isPoliticalLegislationCountry(countryId: string): boolean {
  return isPoliticalMetricsCountry(countryId);
}

function preferFullAuthoredBaseline(config: NationalBudgetSeedConfig): boolean {
  return (
    config.skipLegacyLegislation === true ||
    config.calibratedSpendingBaseline === true ||
    shouldUseFullAuthoredBudgetBaseline({
      countryId: config.countryId,
      fiscalYear: config.fiscalYear,
      politicalLegislationCountry: isPoliticalLegislationCountry(config.countryId),
    })
  );
}

function preferCategoryBaselineOverrides(config: NationalBudgetSeedConfig): boolean {
  return config.fiscalYear === 1953 && !isPoliticalLegislationCountry(config.countryId);
}

function openingProgramSpendingKey(config: NationalBudgetSeedConfig): string {
  return `${config.countryId}|${config.fiscalYear}|${config.gdp}|${config.population}`;
}

function deriveSpending(
  config: NationalBudgetSeedConfig,
  typesById: Map<string, LegislationType>,
  activeOnly = false
): SupportedNationalBudget["spending"] {
  // US/UK/RU/DD on 1953: full authored baselines (political-legislation sync
  // replaces these with the v2 law book shortly after seed).
  if (preferFullAuthoredBaseline(config)) {
    const byCategory: Record<string, number> = {};
    for (const [category, amount] of Object.entries(config.baselineSpendingByCategory)) {
      byCategory[category] = Math.max(0, Math.round(amount));
    }
    const debtInterest = Math.round(config.debt.principal * config.debt.interestRate);
    const categoryTotal = Object.values(byCategory).reduce((sum, amount) => sum + amount, 0);
    const stateGrants = config.baselineStateGrants;
    return {
      byCategory,
      stateGrants,
      debtInterest,
      total: categoryTotal + stateGrants + debtInterest,
    };
  }

  const policyByCategory: Record<string, number> = {};
  let policyStateGrants = 0;
  let hasPolicySpending = false;

  for (const legislationType of typesById.values()) {
    if (legislationType.countryScope !== config.countryId.toLowerCase()) continue;
    if (!legislationType.budgetCategory) continue;
    if (legislationType.allowedScope === "state") continue;
    if (activeOnly && !isLegislationTypeActive(legislationType._id, config.fiscalYear)) continue;
    if (activeOnly && getCostClass(legislationType._id) === "none") continue;

    const defaultOption = getDefaultPolicyOption(config, legislationType);
    const annualCost = calculatePolicyOptionAnnualCost(defaultOption, {
      budgetCapacity: 0,
      gdp: config.gdp,
      population: config.population,
      countryId: config.countryId,
      nationalGdpPerCapita: config.population > 0 ? config.gdp / config.population : undefined,
    });
    if (annualCost === undefined) continue;

    hasPolicySpending = true;
    if (legislationType.isGrant) {
      policyStateGrants += annualCost;
    } else {
      policyByCategory[legislationType.budgetCategory] =
        (policyByCategory[legislationType.budgetCategory] ?? 0) + annualCost;
    }
  }

  // US, UK and JP carry no old law types; their opening program spending is data.
  const frozen = hasPolicySpending
    ? undefined
    : OPENING_PROGRAM_SPENDING[openingProgramSpendingKey(config)]?.[activeOnly ? "active" : "all"];
  if (frozen) {
    hasPolicySpending = true;
    Object.assign(policyByCategory, frozen.byCategory);
    policyStateGrants = frozen.stateGrants;
  }

  const byCategory = hasPolicySpending
    ? policyByCategory
    : { ...config.baselineSpendingByCategory };

  // DE/JP/IE/CN/…: pin defense + healthcare (plus any per-country extras, see
  // EXTRA_OVERRIDE_CATEGORIES_BY_COUNTRY) to authored 1953 shares so the
  // modern per-capita ladder can't underweight Cold War defense or overweight
  // pre-welfare-state healthcare — without replacing the whole spend table.
  if (preferCategoryBaselineOverrides(config) && hasPolicySpending) {
    for (const key of overrideCategoriesFor(config.countryId)) {
      const authored = config.baselineSpendingByCategory[key];
      if (authored !== undefined) {
        byCategory[key] = authored;
      }
    }
  }

  for (const [category, amount] of Object.entries(byCategory)) {
    byCategory[category] = Math.max(0, Math.round(amount));
  }

  const debtInterest = Math.round(config.debt.principal * config.debt.interestRate);
  const categoryTotal = Object.values(byCategory).reduce((sum, amount) => sum + amount, 0);
  const stateGrants = hasPolicySpending
    ? Math.max(0, Math.round(policyStateGrants))
    : config.baselineStateGrants;

  return {
    byCategory,
    stateGrants,
    debtInterest,
    total: categoryTotal + stateGrants + debtInterest,
  };
}

/**
 * Sovereign-default / IMF defaults stamped on every freshly-seeded national
 * budget. Mirrors the explicit zero-fill the
 * `sovereignDefaultPhase1FederalBudget.ts` migration applies to legacy budgets
 * — folded into the seed so a brand-new game doesn't depend on that migration
 * ever running.
 */
function sovereignDefaultBudgetFields(): Pick<
  SupportedNationalBudget,
  | "sovereignCrisisState"
  | "failedAuctionConsecutiveCount"
  | "lastAuctionDemandRatio"
  | "crisisFiredAt"
  | "crisisChoice"
  | "crisisChoiceAt"
  | "crisisLegislativeProposalId"
  | "crisisAutoActionAt"
  | "crisisLegislativeDeadlineAt"
  | "recoveryStartedAt"
  | "recoveryFiscalDisciplineStreak"
  | "marketAccessLockedUntilTurn"
  | "lastDefaultTurn"
  | "recoveryGdpPenaltyPercent"
  | "recoveryGdpPenaltyTurnsRemaining"
  | "recoveryCredibilityBonusUntilTurn"
  | "imfSovereignBailoutActive"
  | "imfSovereignFacilityPrincipalOutstanding"
  | "imfSovereignFacilityAnnualRate"
  | "imfSovereignFacilityAmortizationTurnsRemaining"
  | "imfSovereignFacilityIncomeCaptureFraction"
  | "imfSovereignFacilityImfCorporationId"
  | "imfSovereignFacilityCumulativePaidAnchor"
  | "imfBoardOverrideWindowEndAt"
  | "imfBoardOverrideAt"
  | "imfBoardOverrideBy"
  | "imfBoardOverrideKind"
  | "imfBoardOverrideRateDelta"
  | "imfBoardOverrideCaptureDelta"
  | "imfBoardPublicStatement"
> {
  return {
    // State machine — every fresh budget starts in "normal".
    sovereignCrisisState: "normal",

    // Auction tracking
    failedAuctionConsecutiveCount: 0,
    lastAuctionDemandRatio: 1.0,

    // Crisis lifecycle — no active crisis.
    crisisFiredAt: null,
    crisisChoice: null,
    crisisChoiceAt: null,
    crisisLegislativeProposalId: null,
    crisisAutoActionAt: null,
    crisisLegislativeDeadlineAt: null,

    // Recovery state — no recovery in progress.
    recoveryStartedAt: null,
    recoveryFiscalDisciplineStreak: 0,
    marketAccessLockedUntilTurn: null,
    lastDefaultTurn: null,
    recoveryGdpPenaltyPercent: null,
    recoveryGdpPenaltyTurnsRemaining: null,
    recoveryCredibilityBonusUntilTurn: null,

    // IMF facility — inactive.
    imfSovereignBailoutActive: false,
    imfSovereignFacilityPrincipalOutstanding: 0,
    imfSovereignFacilityAnnualRate: 0,
    imfSovereignFacilityAmortizationTurnsRemaining: 0,
    imfSovereignFacilityIncomeCaptureFraction: 0,
    imfSovereignFacilityImfCorporationId: null,
    imfSovereignFacilityCumulativePaidAnchor: 0,

    // IMF board override window — closed.
    imfBoardOverrideWindowEndAt: null,
    imfBoardOverrideAt: null,
    imfBoardOverrideBy: null,
    imfBoardOverrideKind: null,
    imfBoardOverrideRateDelta: null,
    imfBoardOverrideCaptureDelta: null,
    imfBoardPublicStatement: null,
  };
}

export function buildNationalBudgetSeed(config: NationalBudgetSeedConfig): SupportedNationalBudget {
  const taxBases = buildTaxBases(config);
  const typesById = new Map(
    budgetLegislationTypes.map((legislationType) => [legislationType._id, legislationType] as const)
  );
  const taxRates = deriveTaxRates(config, typesById);
  const policyRevenueLines = derivePolicyRevenueLines(config, typesById);

  // DE Solidaritätszuschlag — surcharge on income tax revenue, not on income base.
  // Stored on taxRates as a plain percentage. Non-DE presets leave it undefined → 0.
  const incomeTax = Math.round(taxBases.taxableIncome * (taxRates.incomeTax / 100));
  const solidaritySurcharge = Math.round(incomeTax * ((taxRates.solidaritySurcharge ?? 0) / 100));
  const salesTax = Math.round(taxBases.taxableSales * (taxRates.salesTax / 100));
  // CN LVAT (土地增值税) — 5% of domesticCorporateProfits as real-estate-sector proxy.
  // CN UMCT (城市维护建设税) — surcharge on salesTax (VAT) revenue.
  // CN Stamp Duty (印花税) — 2% of GDP as documented-transactions proxy.
  // All three: non-CN presets leave the rate undefined → 0.
  const lvatBase = taxBases.domesticCorporateProfits * 0.05;
  const landValueAddedTax = Math.round(lvatBase * ((taxRates.landValueAddedTax ?? 0) / 100));
  const urbanMaintenanceTax = Math.round(salesTax * ((taxRates.urbanMaintenanceTax ?? 0) / 100));
  const stampDutyBase = config.gdp * 0.02;
  const stampDuty = Math.round(stampDutyBase * ((taxRates.stampDuty ?? 0) / 100));
  // IE-specific seed revenue lines — match calculateFederalRevenue computation so
  // the seed budget's revenue.total reflects the same yield the runtime produces.
  // Non-IE presets leave the rate undefined → 0.
  const universalSocialCharge = Math.round(
    taxBases.wagesAndSalaries * ((taxRates.universalSocialCharge ?? 0) / 100)
  );
  const capitalGainsBase = config.gdp * 0.03;
  const capitalGainsTax = Math.round(capitalGainsBase * ((taxRates.capitalGainsTax ?? 0) / 100));
  const exciseableBase = config.gdp * 0.015;
  const exciseDuty = Math.round(exciseableBase * ((taxRates.exciseDuty ?? 0) / 100));
  const propertyValueBase = config.gdp * 0.5;
  const propertyTax = Math.round(propertyValueBase * ((taxRates.propertyTax ?? 0) / 100));
  const revenue = {
    incomeTax,
    domesticCorporateTax: Math.round(
      taxBases.domesticCorporateProfits * (taxRates.domesticCorporateTax / 100)
    ),
    foreignCorporateTax: Math.round(
      taxBases.foreignCorporateProfits * (taxRates.foreignCorporateTax / 100)
    ),
    payrollTax: Math.round(taxBases.wagesAndSalaries * (taxRates.payrollTax / 100)),
    tariffs: Math.round(taxBases.importValue * (taxRates.tariffs / 100)),
    salesTax,
    solidaritySurcharge,
    landValueAddedTax,
    urbanMaintenanceTax,
    stampDuty,
    universalSocialCharge,
    capitalGainsTax,
    exciseDuty,
    propertyTax,
    healthcareIncome: 0,
    other: config.otherRevenue,
    total: 0,
    ...policyRevenueLines,
  };
  revenue.total =
    revenue.incomeTax +
    revenue.domesticCorporateTax +
    revenue.foreignCorporateTax +
    revenue.payrollTax +
    revenue.tariffs +
    revenue.salesTax +
    revenue.solidaritySurcharge +
    revenue.landValueAddedTax +
    revenue.urbanMaintenanceTax +
    revenue.stampDuty +
    revenue.universalSocialCharge +
    revenue.capitalGainsTax +
    revenue.exciseDuty +
    revenue.propertyTax +
    revenue.healthcareIncome +
    revenue.other;

  const spending = deriveSpending(config, typesById);
  const surplus = revenue.total - spending.total;

  return {
    _id: config.budgetId,
    countryId: config.countryId,
    fiscalYear: config.fiscalYear,
    revenue,
    taxRates,
    taxBases,
    // Capture each base's authored/seeded share of GDP *at seed time* - before
    // any turn runs - as the permanent per-country target the fiscal-divergence
    // guardrail (`taxBaseGdpShareBaseline`, see budget.ts) tracks toward, and
    // that `updateCorporateTaxBases`'s per-turn floor blends against instead of
    // a single universal modern-mixed-economy constant (fiscal-scale audit,
    // A command economy's authored corporate/enterprise-surplus
    // base sits far above that constant; seeding this here - rather than
    // relying on fiscalBaseGrowth's deferred self-heal, which can run AFTER the
    // corp-turn phase has already overwritten taxBases for the turn - stops the
    // baseline from ever being captured off an already-corrupted value).
    taxBaseGdpShareBaseline: computeTaxBaseGdpShareBaseline(taxBases, config.gdp),
    // The same treatment for the one revenue line that is not a tax base.
    // `otherRevenue` is authored as an ABSOLUTE, which fixes it forever against
    // an economy that moves: DD authored DDM 4.5B against a DDM 50B GDP — a
    // deliberate 9% enterprise-remittance share, in line with the rest of the
    // bloc — and by turn 575 that same DDM 4.5B was 1.5% of a reunified DDM 271B
    // economy. Capturing the authored SHARE at seed time is what keeps
    // the line proportionate. Guarded against a zero/absent GDP so a malformed
    // config leaves the field unset rather than seeding Infinity.
    otherRevenueGdpShareBaseline: config.gdp > 0 ? config.otherRevenue / config.gdp : undefined,
    // Every reset begins at one common household price level. The turn loop
    // subsequently advances this from CPI; it never rewrites seed nominal units.
    economicFactors: {
      ...config.economicFactors,
      householdPriceIndex:
        config.economicFactors.householdPriceIndex ?? HOUSEHOLD_PRICE_INDEX_BASELINE,
    },
    spending,
    debt: config.debt,
    // Signed cash position seeds to the country's current fiscal debt: a country
    // with debt starts negative, a debt-free country starts at 0. Mirrors the
    // one-time backfill migration so seed and migration agree.
    treasuryBalance: -(config.debt.principal ?? 0),
    treasuryCashLocal: 0,
    surplus,
    gdp: config.gdp,
    debtToGdpRatio: config.debt.principal / config.gdp,
    creditRating: config.creditRating,
    sovereignRiskAnchor: {
      debtToGdpRatio: config.debt.principal / config.gdp,
      creditRating: config.creditRating,
      interestRate: config.debt.interestRate,
    },
    currencyCode: config.currencyCode,
    baselineSpendingByCategory: config.baselineSpendingByCategory,
    baselineStateGrants: config.baselineStateGrants,
    ...sovereignDefaultBudgetFields(),
  };
}

// Deterministic ObjectId for seeded enacted laws so re-seeding is idempotent.
const SEED_BILL_ID = new ObjectId("600000000000000000000001");

export interface SeedEnactedLaw {
  legislationTypeId: string;
  title: string;
  scope: "national";
  countryId: string;
  budgetCost: number;
  gdpPerCapitaMultiplier?: number;
  annualCostPerCapita?: number;
  annualCostUsd?: number;
  gdpCostFraction?: number;
  incomeCostFraction?: number;
  rate?: number;
  policyOptionIndex?: number;
  isGrant?: boolean;
  budgetCategory: string;
  enactedYear: number;
}

function deriveEnactedLaws(
  config: NationalBudgetSeedConfig,
  /**
   * Year the policy vacuum keys on. Defaults to the config's own fiscal year
   * (correct for historical presets, where every config's fiscalYear equals the
   * preset start year). The default/modern preset passes the preset's canonical
   * year instead, because its per-country configs carry mixed snapshot years
   * (US 2020, CN 2023) — without this, a "2019-default" world would seed a
   * cn_common_prosperity (2021) law off CN's 2023 config.
   */
  vacuumYear: number = config.fiscalYear
): SeedEnactedLaw[] {
  if (config.skipLegacyLegislation) return [];
  // The political-legislation book owns the law book of US, UK, RU and DD at
  // every preset; its baseline seeder writes their enacted laws.
  if (isPoliticalLegislationCountry(config.countryId)) return [];

  const typesById = new Map(budgetLegislationTypes.map((lt) => [lt._id, lt] as const));
  const laws: SeedEnactedLaw[] = [];
  /** Raw policy-derived costs for 1953 baseline rescaling (spending laws only). */
  const rawCosts: number[] = [];

  for (const legislationType of typesById.values()) {
    if (legislationType.countryScope !== config.countryId.toLowerCase()) continue;
    if (legislationType.allowedScope === "state") continue;

    // Policy vacuum: an old-era preset boots with no statute for a domain that
    // does not exist yet. Keyed on the preset year, NOT the toggle — a 1991 world
    // carrying a broadband statute is a seed defect regardless.
    if (!isLegislationTypeActive(legislationType._id, vacuumYear)) continue;

    const defaultOption = getDefaultPolicyOption(config, legislationType);
    if (!defaultOption) continue;

    const isTaxRate = defaultOption.rate !== undefined;
    // Budget-neutral reforms remain policies, but their legacy absolute costs
    // must not consume a calibrated fiscal envelope that runtime prices at zero.
    if (
      config.calibratedSpendingBaseline &&
      !isTaxRate &&
      getCostClass(legislationType._id) === "none"
    )
      continue;

    // Tax rate types don't have budgetCategory — they contribute revenue, not spending.
    // Non-tax types must have a budgetCategory to be included.
    if (!isTaxRate && !legislationType.budgetCategory) continue;

    const annualCost = isTaxRate
      ? undefined
      : calculatePolicyOptionAnnualCost(defaultOption, {
          budgetCapacity: 0,
          gdp: config.gdp,
          population: config.population,
          countryId: config.countryId,
          nationalGdpPerCapita: config.population > 0 ? config.gdp / config.population : undefined,
        });

    // Include both spending laws (annualCost defined) and tax rate laws (rate defined)
    if (annualCost === undefined && !isTaxRate) continue;

    const optionIndex = legislationType.policyOptions?.indexOf(defaultOption);

    if (!isTaxRate) {
      rawCosts.push(annualCost!);
    }

    laws.push({
      legislationTypeId: legislationType._id,
      title: `${legislationType.name} (Default)`,
      scope: "national",
      countryId: config.countryId,
      budgetCost: legislationType.budgetCost || 0,
      ...(defaultOption.gdpPerCapitaMultiplier !== undefined && {
        gdpPerCapitaMultiplier: defaultOption.gdpPerCapitaMultiplier,
      }),
      ...(defaultOption.annualCostPerCapita !== undefined && {
        annualCostPerCapita: defaultOption.annualCostPerCapita,
      }),
      ...(defaultOption.gdpCostFraction !== undefined && {
        gdpCostFraction: defaultOption.gdpCostFraction,
      }),
      ...(defaultOption.incomeCostFraction !== undefined && {
        incomeCostFraction: defaultOption.incomeCostFraction,
      }),
      ...(isTaxRate && { rate: defaultOption.rate }),
      ...(optionIndex !== undefined && optionIndex >= 0 && { policyOptionIndex: optionIndex }),
      budgetCategory: legislationType.budgetCategory || legislationType.policyDomain || "tax",
      enactedYear: config.fiscalYear,
      ...(legislationType.isGrant ? { isGrant: true } : {}),
    });
  }

  // Rewrite spending-law cost fields for historically-sensitive categories
  // so runtime calculateFederalSpending reproduces authored defense/healthcare
  // (plus per-country extras, see EXTRA_OVERRIDE_CATEGORIES_BY_COUNTRY) shares.
  // gdpPerCapitaMultiplier × gdp is the legacy GDP-share form, not rescaled by
  // getGdpIndexedCostScale. Political countries seed no old laws (above).
  if (
    (preferCategoryBaselineOverrides(config) || config.calibratedSpendingBaseline) &&
    config.gdp > 0
  ) {
    const overrideCats = config.calibratedSpendingBaseline
      ? new Set(Object.keys(config.baselineSpendingByCategory))
      : overrideCategoriesFor(config.countryId);
    const spendingIdx: number[] = [];
    for (let i = 0; i < laws.length; i++) {
      if (laws[i].rate === undefined) spendingIdx.push(i);
    }
    const byCategoryRaw = new Map<string, { lawPos: number; raw: number }[]>();
    const grantEntries: { lawPos: number; raw: number }[] = [];
    for (let j = 0; j < spendingIdx.length; j++) {
      const lawPos = spendingIdx[j]!;
      const law = laws[lawPos]!;
      const raw = rawCosts[j] ?? 0;
      if (law.isGrant) {
        if (
          config.calibratedSpendingBaseline ||
          GRANT_OVERRIDE_COUNTRIES.has(config.countryId.toUpperCase())
        ) {
          grantEntries.push({ lawPos, raw });
        }
        continue;
      }
      if (!overrideCats.has(law.budgetCategory)) continue;
      const list = byCategoryRaw.get(law.budgetCategory) ?? [];
      list.push({ lawPos, raw });
      byCategoryRaw.set(law.budgetCategory, list);
    }

    // Rescale the country's isGrant law(s) to the authored baselineStateGrants
    // total the same way categories are rescaled below (see
    // GRANT_OVERRIDE_COUNTRIES — currently JP's Local Allocation Tax Act).
    if (grantEntries.length > 0) {
      const rawGrantSum = grantEntries.reduce((s, e) => s + Math.max(0, e.raw), 0);
      const grantTarget = config.baselineStateGrants;
      for (const { lawPos, raw } of grantEntries) {
        const share = rawGrantSum > 0 ? Math.max(0, raw) / rawGrantSum : 1 / grantEntries.length;
        const scaled = grantTarget * share;
        const law = laws[lawPos]!;
        delete law.annualCostPerCapita;
        delete law.annualCostUsd;
        delete law.gdpCostFraction;
        delete law.incomeCostFraction;
        law.gdpPerCapitaMultiplier = scaled / config.gdp;
      }
    }

    for (const [cat, entries] of byCategoryRaw) {
      const rawSum = entries.reduce((s, e) => s + Math.max(0, e.raw), 0);
      const target = config.baselineSpendingByCategory[cat] ?? rawSum;
      for (const { lawPos, raw } of entries) {
        const share = rawSum > 0 ? Math.max(0, raw) / rawSum : 1 / entries.length;
        const scaled = target * share;
        const law = laws[lawPos]!;
        delete law.annualCostPerCapita;
        delete law.annualCostUsd;
        delete law.gdpCostFraction;
        delete law.incomeCostFraction;
        law.gdpPerCapitaMultiplier = scaled / config.gdp;
      }
    }
  }

  return laws;
}

export function generateDefaultEnactedLaws(
  preset: string
): Array<Omit<EnactedLaw, "_id"> & { _id: ObjectId }> {
  const now = new Date();
  const laws: Array<Omit<EnactedLaw, "_id"> & { _id: ObjectId }> = [];
  const configs = getNationalBudgetSeedConfigsForPreset(preset);
  // Preset canonical year for the policy vacuum: the leading 4 digits of the
  // preset id ("1991-default" → 1991), falling back to 2019 for the modern
  // default. Overrides each config's own fiscalYear, which for the default
  // preset carries mixed per-country snapshot years.
  const parsedPresetYear = parseInt(preset.slice(0, 4), 10);
  const vacuumYear = Number.isFinite(parsedPresetYear) ? parsedPresetYear : 2019;

  for (const config of configs) {
    for (const seed of deriveEnactedLaws(config, vacuumYear)) {
      laws.push({
        _id: new ObjectId(),
        billId: SEED_BILL_ID,
        ...seed,
        enactedAt: now,
      });
    }
  }

  return laws;
}

const NATIONAL_BUDGET_SEED_CONFIGS: NationalBudgetSeedConfig[] = [
  {
    budgetId: "federal",
    countryId: "US",
    fiscalYear: 2020,
    population: 333_000_000,
    gdp: 27_000_000_000_000,
    currencyCode: "USD",
    economicFactors: {
      gdpGrowth: 2.5,
      wageGrowth: 3.0,
      inflationRate: 2.5,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.3537,
      corporateProfits: 0.0796,
      wagesAndSalaries: 0.3148,
      importValue: 0.1852,
      taxableSales: 0.5556,
    },
    otherRevenue: 200_000_000_000,
    debt: {
      principal: 28_500_000_000_000,
      interestRate: 0.021,
      ceiling: 31_400_000_000_000,
      ceilingLastRaisedYear: 2023,
    },
    creditRating: "AA",
    baselineSpendingByCategory: {
      healthcare: 650_000_000_000,
      defense: 800_000_000_000,
      socialSecurity: 900_000_000_000,
      education: 150_000_000_000,
      infrastructure: 120_000_000_000,
      other: 700_000_000_000,
    },
    baselineStateGrants: 600_000_000_000,
    policyDefaults: NATIONAL_DEFAULTS,
    policyOptionOverrides: NATIONAL_DEFAULT_OPTION_INDEXES,
    taxPolicyIds: {
      incomeTax: "us_federal_income_tax_rate",
      domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
      foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
      payrollTax: "us_federal_payroll_tax_rate",
      tariffs: "us_federal_tariff_rate",
      salesTax: "us_federal_sales_tax_rate",
    },
  },
  {
    budgetId: "UK",
    countryId: "UK",
    fiscalYear: 2020,
    population: 68_000_000,
    gdp: 2_900_000_000_000,
    currencyCode: "GBP",
    economicFactors: {
      gdpGrowth: 1.2,
      wageGrowth: 3.1,
      inflationRate: 3.2,
      tradeGrowth: 1.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.5517,
      corporateProfits: 0.1655,
      wagesAndSalaries: 0.5345,
      importValue: 0.1552,
      taxableSales: 0.3293,
    },
    otherRevenue: 188_250_000_000,
    debt: {
      principal: 2_820_000_000_000,
      interestRate: 0.046,
      ceiling: 3_300_000_000_000,
      ceilingLastRaisedYear: 2024,
    },
    creditRating: "A",
    baselineSpendingByCategory: {
      health: 190_000_000_000,
      education: 95_000_000_000,
      statePensions: 135_000_000_000,
      welfare: 125_000_000_000,
      defense: 60_000_000_000,
      transport: 28_000_000_000,
      localGovernment: 40_000_000_000,
      other: 330_000_000_000,
    },
    baselineStateGrants: 75_000_000_000,
    policyRevenueConfigs: [
      {
        legislationTypeId: "uk_nhs_funding",
        revenueKey: "healthcareIncome",
        annualRevenuePerCapitaByOptionIndex: [500, 400, 300, 200, 120, 60, 30],
      },
    ],
    policyDefaults: UK_NATIONAL_DEFAULTS,
    policyOptionOverrides: UK_NATIONAL_DEFAULT_OPTION_INDEXES,
    taxPolicyIds: {
      incomeTax: "uk_income_tax_rate",
      domesticCorporateTax: "uk_domestic_corporation_tax",
      foreignCorporateTax: "uk_foreign_corporation_tax",
      payrollTax: "uk_national_insurance",
      tariffs: "uk_excise_customs",
      salesTax: "uk_vat",
    },
  },
  {
    budgetId: "JP",
    countryId: "JP",
    fiscalYear: 2020,
    population: 126_000_000,
    gdp: 550_000_000_000_000, // ~550 trillion JPY
    currencyCode: "JPY",
    economicFactors: {
      gdpGrowth: 0.6,
      wageGrowth: 1.0,
      inflationRate: 0.5,
      tradeGrowth: 0.3,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.4,
      corporateProfits: 0.12,
      wagesAndSalaries: 0.42,
      importValue: 0.14,
      taxableSales: 0.38,
    },
    otherRevenue: 12_000_000_000_000, // ~12 trillion JPY
    debt: {
      principal: 1_200_000_000_000_000, // ~1,200 trillion JPY (highest debt-to-GDP in world)
      interestRate: 0.01, // Near-zero rates
      ceiling: 1_500_000_000_000_000,
      ceilingLastRaisedYear: 2023,
    },
    creditRating: "A",
    baselineSpendingByCategory: {
      health: 42_000_000_000_000,
      education: 5_500_000_000_000,
      statePensions: 58_000_000_000_000, // Massive pension spending — aging population
      welfare: 30_000_000_000_000,
      defense: 5_400_000_000_000,
      transport: 7_000_000_000_000,
      localGovernment: 16_000_000_000_000,
      other: 40_000_000_000_000,
    },
    baselineStateGrants: 18_000_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.jp.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.jp.optionIndexes,
    taxRateOverrides: {
      incomeTax: 25,
      domesticCorporateTax: 23,
      foreignCorporateTax: 19,
      payrollTax: 15,
      tariffs: 0,
      salesTax: 10,
    },
    taxPolicyIds: {},
  },
  {
    budgetId: "DE",
    countryId: "DE",
    fiscalYear: 2020,
    population: 84_400_000,
    gdp: 4_500_000_000_000,
    currencyCode: "EUR",
    economicFactors: {
      gdpGrowth: 1.1,
      wageGrowth: 2.3,
      inflationRate: 1.8,
      tradeGrowth: 1.4,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.46,
      corporateProfits: 0.11,
      wagesAndSalaries: 0.44,
      importValue: 0.34,
      taxableSales: 0.5,
    },
    otherRevenue: 90_000_000_000,
    debt: {
      principal: 2_450_000_000_000,
      interestRate: 0.028,
      ceiling: 3_000_000_000_000,
      ceilingLastRaisedYear: 2024,
    },
    creditRating: "AAA",
    baselineSpendingByCategory: {
      health: 220_000_000_000,
      education: 85_000_000_000,
      pensions: 165_000_000_000,
      welfare: 120_000_000_000,
      defense: 65_000_000_000,
      transport: 55_000_000_000,
      localGovernment: 95_000_000_000,
      environment: 40_000_000_000,
      other: 210_000_000_000,
    },
    baselineStateGrants: 125_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.de.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.de.optionIndexes,
    taxRateOverrides: {
      incomeTax: 42,
      domesticCorporateTax: 15,
      foreignCorporateTax: 15,
      payrollTax: 20,
      tariffs: 0,
      salesTax: 19,
      solidaritySurcharge: 5.5,
    },
    taxPolicyIds: {},
  },
  // ── Ireland ────────────────────────────────────────────────────────────────
  {
    budgetId: "IE",
    countryId: "IE",
    fiscalYear: 2023,
    population: 5_100_000,
    gdp: 500_000_000_000, // €500B (GDP inflated by MNC profit-shifting)
    currencyCode: "IEP",
    economicFactors: {
      gdpGrowth: 3.5,
      wageGrowth: 4.0,
      inflationRate: 3.2,
      tradeGrowth: 2.5,
      lastUpdated: new Date(),
    },
    // IE's headline GDP (€500B) is inflated ~2.3× by MNC profit-shifting vs real
    // domestic activity (GNI* ~€220B); using it as a tax base overstated revenue
    // to ~43% of GDP (real take ~18-20%). Lower income/wage/sales base ratios;
    // corporate kept high since MNC corporation tax is genuinely large.
    // currencyCode IEP at EUR-parity rate (0.92), euro-era display shows €.
    taxBaseRatios: {
      taxableIncome: 0.13,
      corporateProfits: 0.22, // elevated due to MNC headquarters (real)
      wagesAndSalaries: 0.23,
      importValue: 0.28,
      taxableSales: 0.12,
    },
    otherRevenue: 8_000_000_000,
    debt: {
      principal: 235_000_000_000,
      interestRate: 0.025,
      ceiling: 300_000_000_000,
      ceilingLastRaisedYear: 2023,
    },
    creditRating: "AA",
    // Must equal Σ(per-capita × population) of IE default spending laws
    // so the no-laws fallback matches the with-laws expenditure breakdown.
    baselineSpendingByCategory: {
      health: 24_490_200_000,
      education: 10_985_400_000,
      socialProtection: 15_896_700_000,
      housing: 7_002_300_000,
      transport: 5_701_800_000,
      defense: 1_300_500_000,
      other: 11_796_300_000,
    },
    baselineStateGrants: 8_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.ie.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.ie.optionIndexes,
    taxPolicyIds: {
      incomeTax: "ie_income_tax_rate",
      domesticCorporateTax: "ie_corporate_tax_rate",
      foreignCorporateTax: "ie_foreign_corporate_tax_rate",
      payrollTax: "ie_prsi",
      tariffs: "ie_customs_tariff_rate",
      salesTax: "ie_vat_rate",
      propertyTax: "ie_local_property_tax",
      stampDuty: "ie_stamp_duty",
      universalSocialCharge: "ie_usc",
      capitalGainsTax: "ie_capital_gains_tax",
      exciseDuty: "ie_excise_duty",
    },
  },
  // ── Brazil ─────────────────────────────────────────────────────────────────
  {
    budgetId: "BR",
    countryId: "BR",
    fiscalYear: 2023,
    population: 215_000_000,
    gdp: 10_900_000_000_000, // R$10.9T BRL
    currencyCode: "BRL",
    economicFactors: {
      gdpGrowth: 2.9,
      wageGrowth: 4.5,
      inflationRate: 4.6,
      tradeGrowth: 3.2,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.38,
      corporateProfits: 0.08,
      wagesAndSalaries: 0.36,
      importValue: 0.15,
      taxableSales: 0.45,
    },
    otherRevenue: 400_000_000_000,
    debt: {
      principal: 6_800_000_000_000,
      interestRate: 0.105, // Selic rate
      ceiling: 9_000_000_000_000,
      ceilingLastRaisedYear: 2023,
    },
    creditRating: "BB",
    baselineSpendingByCategory: {
      socialSecurity: 1_900_000_000_000,
      health: 610_000_000_000,
      education: 400_000_000_000,
      defense: 180_000_000_000,
      infrastructure: 200_000_000_000,
      welfare: 550_000_000_000,
      other: 800_000_000_000,
    },
    baselineStateGrants: 450_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.br.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.br.optionIndexes,
    taxPolicyIds: {
      incomeTax: "br_income_tax_rate",
      domesticCorporateTax: "br_corporate_tax",
      payrollTax: "br_payroll_tax",
      salesTax: "br_vat_rate",
    },
    // BR taxPolicyIds reference unseeded legislation types → rates seed to 0.
    // Stopgap direct rates for the modern 2019 era (~33% of GDP, Brazil's real
    // tax burden). Tune when a BR legislation module lands.
    taxRateOverrides: {
      incomeTax: 25,
      domesticCorporateTax: 24,
      foreignCorporateTax: 24,
      payrollTax: 28,
      tariffs: 8,
      salesTax: 17,
    },
  },
  // ── China ──────────────────────────────────────────────────────────────────
  {
    budgetId: "CN",
    countryId: "CN",
    fiscalYear: 2023,
    population: 1_412_000_000,
    gdp: 126_000_000_000_000, // ¥126T CNY
    currencyCode: "CNY",
    economicFactors: {
      gdpGrowth: 5.2,
      wageGrowth: 5.0,
      inflationRate: 0.2,
      tradeGrowth: 4.5,
      lastUpdated: new Date(),
    },
    // CN statutory rates against broad bases overstated revenue to ~42% of GDP;
    // real individual income tax is ~1% of GDP and general-budget tax take ~17%.
    // Income/wage bases are set to effective levels; VAT/corporate kept.
    taxBaseRatios: {
      taxableIncome: 0.03,
      corporateProfits: 0.14,
      wagesAndSalaries: 0.11,
      importValue: 0.18,
      taxableSales: 0.44,
    },
    otherRevenue: 2_000_000_000_000,
    debt: {
      principal: 32_000_000_000_000, // official central government debt ~25% of GDP
      interestRate: 0.035,
      ceiling: 40_000_000_000_000,
      ceilingLastRaisedYear: 2024,
    },
    creditRating: "A",
    // Reconciled to the Σ(per-capita × population)
    // of the CN default spending laws seeded from cnLegislationTypes, so the
    // no-laws fallback matches the with-laws expenditure breakdown. publicSafety
    // (public security + criminal justice) is now its own line.
    baselineSpendingByCategory: {
      education: 4_100_448_000_000,
      socialSecurity: 3_899_944_000_000,
      infrastructure: 3_500_348_000_000,
      other: 3_138_876_000_000,
      agriculture: 2_401_812_000_000,
      publicSafety: 2_300_148_000_000,
      health: 2_199_896_000_000,
      defense: 1_599_796_000_000,
    },
    baselineStateGrants: 9_000_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.cn.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.cn.optionIndexes,
    taxRateOverrides: {
      incomeTax: 45,
      domesticCorporateTax: 25,
      foreignCorporateTax: 25,
      payrollTax: 28,
      tariffs: 0,
      salesTax: 13,
      landValueAddedTax: 40,
      urbanMaintenanceTax: 7,
      stampDuty: 0.05,
    },
    taxPolicyIds: {},
  },
  // ── Nigeria ────────────────────────────────────────────────────────────────
  // 2019 Buhari-era federal budget (~₦8.9T planned spending against ~₦4.4T
  // revenue; oil-revenue heavy, wide deficit financed by domestic borrowing).
  // GDP ~₦144T NGN (~$447B USD at 2019 ~₦306/USD). Narrow tax base (income tax
  // take ~1% of GDP); the bulk of revenue is oil rents captured in `otherRevenue`.
  {
    budgetId: "NG",
    countryId: "NG",
    fiscalYear: 2019,
    population: 200_000_000,
    gdp: 144_000_000_000_000, // ₦144T NGN
    currencyCode: "NGN",
    economicFactors: {
      gdpGrowth: 2.2,
      wageGrowth: 3.0,
      inflationRate: 11.4,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.05, // very narrow personal income tax base
      corporateProfits: 0.03,
      wagesAndSalaries: 0.25,
      importValue: 0.15,
      taxableSales: 0.3, // VAT base is narrow (5% standard rate)
    },
    otherRevenue: 2_300_000_000_000, // oil rents — dominant revenue line
    debt: {
      principal: 25_000_000_000_000,
      interestRate: 0.13, // CBN Monetary Policy Rate
      ceiling: 40_000_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "B",
    // Must equal the NG spending calibration in ngLegislationTypes.ts
    // (Σ per-capita × 200M population per category).
    baselineSpendingByCategory: {
      socialSecurity: 1_500_000_000_000,
      healthcare: 300_000_000_000,
      education: 500_000_000_000,
      defense: 600_000_000_000,
      infrastructure: 2_000_000_000_000,
      welfare: 400_000_000_000,
      publicSafety: 200_000_000_000,
      agriculture: 300_000_000_000,
      other: 3_000_000_000_000,
    },
    baselineStateGrants: 1_000_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.ng.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.ng.optionIndexes,
    taxPolicyIds: {
      incomeTax: "ng_personal_income_tax",
      domesticCorporateTax: "ng_companies_income_tax",
      foreignCorporateTax: "ng_petroleum_profit_tax",
      payrollTax: "ng_paye",
      salesTax: "ng_vat_rate",
    },
  },
  // 2019 western-market calibrations.
  // Each row is explicit for 2019 rather than inherited from the 1991 or 1979
  // bundle. Game-unit GDP scales the latest authored row by real USD-nominal
  // GDP ratio; spending composition and tax-base ratios carry over; inflation,
  // wage, growth, debt ratios, yields and ratings are 2019 anchors. Currency
  // codes keep the game's legacy identity per country (EUR is DE-only).
  {
    budgetId: "FR",
    countryId: "FR",
    fiscalYear: 2019,
    population: 67_000_000,
    gdp: 11_700_000_000_000,
    currencyCode: "FRF",
    economicFactors: {
      gdpGrowth: 1.8,
      wageGrowth: 1.7,
      inflationRate: 1.1,
      tradeGrowth: 1.5,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.18,
      corporateProfits: 0.1,
      wagesAndSalaries: 0.5,
      importValue: 0.2,
      taxableSales: 0.52,
    },
    otherRevenue: 640_000_000_000,
    debt: {
      principal: 11_500_000_000_000,
      interestRate: 0.005,
      ceiling: 14_400_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "AA",
    baselineSpendingByCategory: {
      socialSecurity: 2_200_000_000_000,
      healthcare: 1_050_000_000_000,
      education: 750_000_000_000,
      defense: 370_000_000_000,
      infrastructure: 290_000_000_000,
      other: 440_000_000_000,
    },
    baselineStateGrants: 180_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.fr.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.fr.optionIndexes,
    taxPolicyIds: {
      incomeTax: "fr_income_tax",
      domesticCorporateTax: "fr_corporate_tax",
      payrollTax: "fr_social_charges",
      tariffs: "fr_customs_tariff",
      salesTax: "fr_vat",
    },
  },
  // ── Italy FY2019 (Conte I/II budget, lire game units) ─────────────────────
  // 2019: near-stagnation (growth 0.5%), inflation 0.6%, debt ~134% GDP,
  // 10y ~1.9%, BBB. Pension-heavy spend composition preserved from 1991.
  {
    budgetId: "IT",
    countryId: "IT",
    fiscalYear: 2019,
    population: 60_400_000,
    gdp: 1_670_000_000_000_000,
    currencyCode: "ITL",
    economicFactors: {
      gdpGrowth: 0.5,
      wageGrowth: 1.0,
      inflationRate: 0.6,
      tradeGrowth: 1.5,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.16,
      corporateProfits: 0.09,
      wagesAndSalaries: 0.42,
      importValue: 0.18,
      taxableSales: 0.32,
    },
    otherRevenue: 105_000_000_000_000,
    debt: {
      principal: 2_240_000_000_000_000,
      interestRate: 0.02,
      ceiling: 2_800_000_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "BBB",
    baselineSpendingByCategory: {
      socialSecurity: 276_000_000_000_000,
      healthcare: 105_000_000_000_000,
      education: 81_000_000_000_000,
      defense: 32_000_000_000_000,
      infrastructure: 73_000_000_000_000,
      other: 73_000_000_000_000,
    },
    baselineStateGrants: 41_000_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.it.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.it.optionIndexes,
    taxPolicyIds: {
      incomeTax: "it_income_tax",
      domesticCorporateTax: "it_corporate_tax",
      payrollTax: "it_social_charges",
      tariffs: "it_customs_tariff",
      salesTax: "it_vat",
    },
  },
  // ── Spain FY2019 (Sanchez prorogued-budget year, peseta game units) ───────
  // 2019: growth 2.0%, inflation 0.7%, debt ~95% GDP, 10y ~0.7%, A.
  {
    budgetId: "ES",
    countryId: "ES",
    fiscalYear: 2019,
    population: 47_000_000,
    gdp: 93_400_000_000_000,
    currencyCode: "ESP",
    economicFactors: {
      gdpGrowth: 2.0,
      wageGrowth: 2.0,
      inflationRate: 0.7,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.18,
      corporateProfits: 0.1,
      wagesAndSalaries: 0.4,
      importValue: 0.18,
      taxableSales: 0.55,
    },
    otherRevenue: 6_500_000_000_000,
    debt: {
      principal: 88_700_000_000_000,
      interestRate: 0.01,
      ceiling: 111_000_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "A",
    baselineSpendingByCategory: {
      socialSecurity: 13_400_000_000_000,
      healthcare: 5_800_000_000_000,
      education: 4_300_000_000_000,
      defense: 1_700_000_000_000,
      infrastructure: 3_800_000_000_000,
      other: 3_400_000_000_000,
    },
    baselineStateGrants: 2_600_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.es.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.es.optionIndexes,
    taxPolicyIds: {
      incomeTax: "es_income_tax",
      domesticCorporateTax: "es_corporate_tax",
      payrollTax: "es_social_charges",
      tariffs: "es_customs_tariff",
      salesTax: "es_consumption_tax",
    },
  },
  // ── Sweden FY2019 (Lofven January-Agreement budget, kronor) ───────────────
  // 2019: growth 2.0%, CPIF inflation 1.7%, debt ~35% GDP, 10y ~0.1%, AAA.
  {
    budgetId: "SE",
    countryId: "SE",
    fiscalYear: 2019,
    population: 10_300_000,
    gdp: 2_300_000_000_000,
    currencyCode: "SEK",
    economicFactors: {
      gdpGrowth: 2.0,
      wageGrowth: 2.6,
      inflationRate: 1.7,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.44,
      corporateProfits: 0.05,
      wagesAndSalaries: 0.44,
      importValue: 0.25,
      taxableSales: 0.3,
    },
    otherRevenue: 125_000_000_000,
    debt: {
      principal: 800_000_000_000,
      interestRate: 0.005,
      ceiling: 1_000_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "AAA",
    baselineSpendingByCategory: {
      socialSecurity: 420_000_000_000,
      healthcare: 190_000_000_000,
      education: 150_000_000_000,
      defense: 60_000_000_000,
      infrastructure: 90_000_000_000,
      other: 110_000_000_000,
    },
    baselineStateGrants: 90_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.se.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.se.optionIndexes,
    taxPolicyIds: {
      incomeTax: "se_income_tax",
      domesticCorporateTax: "se_corporate_tax",
      payrollTax: "se_social_charges",
      tariffs: "se_customs_tariff",
      salesTax: "se_vat",
    },
  },
  // ── Turkey FY2019 (post-2018-crisis rebalancing budget, lira) ─────────────
  // 2019: CPI inflation 15.2%, growth 0.9%, central debt ~33% GDP, high
  // nominal rates ~15%, BB. Wage growth stays double-digit in nominal terms.
  {
    budgetId: "TR",
    countryId: "TR",
    fiscalYear: 2019,
    population: 83_400_000,
    gdp: 26_200_000_000_000,
    currencyCode: "TRL",
    economicFactors: {
      gdpGrowth: 0.9,
      wageGrowth: 18.0,
      inflationRate: 15.2,
      tradeGrowth: 4.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.16,
      corporateProfits: 0.05,
      wagesAndSalaries: 0.24,
      importValue: 0.12,
      taxableSales: 0.35,
    },
    otherRevenue: 1_470_000_000_000,
    debt: {
      principal: 8_600_000_000_000,
      interestRate: 0.15,
      ceiling: 10_800_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "BB",
    baselineSpendingByCategory: {
      defense: 990_000_000_000,
      socialSecurity: 910_000_000_000,
      education: 870_000_000_000,
      healthcare: 420_000_000_000,
      infrastructure: 910_000_000_000,
      other: 460_000_000_000,
    },
    baselineStateGrants: 230_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.tr.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.tr.optionIndexes,
    taxPolicyIds: {
      incomeTax: "tr_income_tax",
      domesticCorporateTax: "tr_corporate_tax",
      payrollTax: "tr_social_charges",
      tariffs: "tr_customs_tariff",
      salesTax: "tr_sales_tax",
    },
  },
  // ── Greece FY2019 (post-bailout surveillance budget, drachma game units) ──
  // 2019: growth 1.9%, inflation 0.5%, debt ~181% GDP, 10y ~1.5%, B.
  // Sourced from the 1979 composition (no 1991 GR row was ever authored).
  {
    budgetId: "GR",
    countryId: "GR",
    fiscalYear: 2019,
    population: 10_700_000,
    gdp: 5_600_000_000_000,
    currencyCode: "GRD",
    economicFactors: {
      gdpGrowth: 1.9,
      wageGrowth: 1.5,
      inflationRate: 0.5,
      tradeGrowth: 3.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.14,
      corporateProfits: 0.06,
      wagesAndSalaries: 0.26,
      importValue: 0.16,
      taxableSales: 0.38,
    },
    otherRevenue: 340_000_000_000,
    debt: {
      principal: 10_100_000_000_000,
      interestRate: 0.015,
      ceiling: 12_600_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "B",
    baselineSpendingByCategory: {
      defense: 340_000_000_000,
      socialSecurity: 390_000_000_000,
      education: 220_000_000_000,
      healthcare: 210_000_000_000,
      infrastructure: 280_000_000_000,
      other: 220_000_000_000,
    },
    baselineStateGrants: 170_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.gr.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.gr.optionIndexes,
    taxPolicyIds: {
      incomeTax: "gr_income_tax",
      domesticCorporateTax: "gr_corporate_tax",
      payrollTax: "gr_social_charges",
      tariffs: "gr_customs_tariff",
      salesTax: "gr_sales_tax",
    },
  },
  // ── Austria FY2019 (Kurz/Bierlein consolidation budget, schilling) ────────
  // 2019: growth 1.6%, inflation 1.5%, debt ~71% GDP, 10y ~0.1%, AA.
  // Sourced from the 1979 composition (no 1991 AT row was ever authored).
  {
    budgetId: "AT",
    countryId: "AT",
    fiscalYear: 2019,
    population: 8_900_000,
    gdp: 5_300_000_000_000,
    currencyCode: "ATS",
    economicFactors: {
      gdpGrowth: 1.6,
      wageGrowth: 2.2,
      inflationRate: 1.5,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.34,
      corporateProfits: 0.08,
      wagesAndSalaries: 0.44,
      importValue: 0.28,
      taxableSales: 0.48,
    },
    otherRevenue: 230_000_000_000,
    debt: {
      principal: 3_800_000_000_000,
      interestRate: 0.005,
      ceiling: 4_800_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "AA",
    baselineSpendingByCategory: {
      defense: 63_000_000_000,
      socialSecurity: 550_000_000_000,
      education: 290_000_000_000,
      healthcare: 260_000_000_000,
      infrastructure: 320_000_000_000,
      other: 260_000_000_000,
    },
    baselineStateGrants: 230_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.at.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.at.optionIndexes,
    taxPolicyIds: {
      incomeTax: "at_income_tax",
      domesticCorporateTax: "at_corporate_tax",
      payrollTax: "at_social_charges",
      tariffs: "at_customs_tariff",
      salesTax: "at_sales_tax",
    },
  },
  // ── Finland FY2019 (Rinne surplus-target budget, markka) ──────────────────
  // 2019: growth 1.4%, inflation 1.1%, debt ~59% GDP, 10y ~0.1%, AA.
  // Sourced from the 1979 composition (no 1991 FI row was ever authored).
  {
    budgetId: "FI",
    countryId: "FI",
    fiscalYear: 2019,
    population: 5_500_000,
    gdp: 1_000_000_000_000,
    currencyCode: "FIM",
    economicFactors: {
      gdpGrowth: 1.4,
      wageGrowth: 2.1,
      inflationRate: 1.1,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    },
    taxBaseRatios: {
      taxableIncome: 0.36,
      corporateProfits: 0.07,
      wagesAndSalaries: 0.46,
      importValue: 0.26,
      taxableSales: 0.44,
    },
    otherRevenue: 56_000_000_000,
    debt: {
      principal: 590_000_000_000,
      interestRate: 0.005,
      ceiling: 740_000_000_000,
      ceilingLastRaisedYear: 2019,
    },
    creditRating: "AA",
    baselineSpendingByCategory: {
      defense: 15_000_000_000,
      socialSecurity: 106_000_000_000,
      education: 63_000_000_000,
      healthcare: 50_000_000_000,
      infrastructure: 56_000_000_000,
      other: 50_000_000_000,
    },
    baselineStateGrants: 50_000_000_000,
    policyDefaults: COUNTRY_POLICY_CONFIGS.fi.defaults,
    policyOptionOverrides: COUNTRY_POLICY_CONFIGS.fi.optionIndexes,
    taxPolicyIds: {
      incomeTax: "fi_income_tax",
      domesticCorporateTax: "fi_corporate_tax",
      payrollTax: "fi_social_charges",
      tariffs: "fi_customs_tariff",
      salesTax: "fi_sales_tax",
    },
  },
];

// ─── 1991 fiscal configs (US FY1991, UK FY1991/92, JP FY1991, DE FY1991,
// IE FY1991, BR FY1991, CN FY1991). Nominal figures in local currency where
// applicable. Sources: BEA / OMB (US), HM Treasury (UK), MOF Japan (JP),
// Bundesbank / Destatis (DE), CSO Ireland (IE), IBGE / IMF (BR, hyperinflation-
// stabilized to early-1994 Real terms for game playability), World Bank /
// NBS (CN). Debt ceiling years pre-date 2011 ceiling-fight era; using the
// fiscalYear itself as a stand-in. ───────────────────────────────────────
const NATIONAL_BUDGET_SEED_CONFIGS_1991: NationalBudgetSeedConfig[] = [
  ...SUCCESSOR_NATIONAL_BUDGETS_1991,
  US_NATIONAL_BUDGET_1991,
  UK_NATIONAL_BUDGET_1991,
  JP_NATIONAL_BUDGET_1991,
  DE_NATIONAL_BUDGET_1991,
  IE_NATIONAL_BUDGET_1991,
  BR_NATIONAL_BUDGET_1991,
  CN_NATIONAL_BUDGET_1991,
  NG_NATIONAL_BUDGET_1991,
  FR_NATIONAL_BUDGET_1991,
  IT_NATIONAL_BUDGET_1991,
  ES_NATIONAL_BUDGET_1991,
  SE_NATIONAL_BUDGET_1991,
  TR_NATIONAL_BUDGET_1991,
];

// Authored independently for FY2023 — not derived from 2019 or 1991 configs.
export const NATIONAL_BUDGET_SEED_CONFIGS_2023: NationalBudgetSeedConfig[] = [
  US_NATIONAL_BUDGET_2023,
];

// January 2027 projection. Macro totals are anchored to the February 2026 CBO
// baseline and the state population projection in states2027.ts. Policy lanes
// retain the latest enacted modern configuration instead of inventing future law.
export const NATIONAL_BUDGET_SEED_CONFIGS_2027: NationalBudgetSeedConfig[] = [
  US_NATIONAL_BUDGET_2027,
  HU_NATIONAL_BUDGET_2027,
  BG_NATIONAL_BUDGET_2027,
  CA_NATIONAL_BUDGET_2027,
];

// Authored independently for FY2007 — not derived from 2019/2023/1991 configs.
// Real FY2007 actuals: GDP ≈ $14.45T, outlays ≈ $2.73T, receipts ≈ $2.57T,
// deficit ≈ $161B (1.1% GDP), gross federal debt ≈ $9.0T (debt/GDP ≈ 62%, of
// which ~36% held-by-public), AAA-rated (pre-2011 S&P downgrade).
export const NATIONAL_BUDGET_SEED_CONFIGS_2007: NationalBudgetSeedConfig[] = [
  US_NATIONAL_BUDGET_2007,
];

// Authored independently for FY1999 — not derived from other-era configs.
// Real FY1999 actuals: GDP ≈ $9.66T, outlays ≈ $1.70T, receipts ≈ $1.83T,
// SURPLUS ≈ +$126B (+1.4% GDP), gross federal debt ≈ $5.6T, AAA-rated.
export const NATIONAL_BUDGET_SEED_CONFIGS_1999: NationalBudgetSeedConfig[] = [
  US_NATIONAL_BUDGET_1999,
];

/**
 * Builds a standard FY1979 planned-economy national budget config for a
 * Warsaw-Pact one-party state. Spending is set as a share of net material
 * product (heavy plan investment + consumer subsidies, modest defence).
 */
function makeEasternBlocBudget(
  countryId: NationalBudgetSeedConfig["countryId"],
  population: number,
  gdp: number,
  currencyCode: NationalBudgetSeedConfig["currencyCode"],
  factors: { gdpGrowth: number; inflationRate: number },
  debtPrincipal: number,
  creditRating: NationalBudgetSeedConfig["creditRating"]
): NationalBudgetSeedConfig[] {
  const prefix = countryId.toLowerCase();
  const pc = COUNTRY_POLICY_CONFIGS[prefix];
  return [
    {
      budgetId: countryId,
      countryId,
      fiscalYear: 1979,
      population,
      gdp,
      currencyCode,
      economicFactors: {
        gdpGrowth: factors.gdpGrowth,
        wageGrowth: factors.inflationRate + 2,
        inflationRate: factors.inflationRate,
        tradeGrowth: 3.0,
        lastUpdated: new Date(0),
      },
      // Fiscal-budget scale (same fiscal-scale discipline as makeEasternBlocBudget1953),
      // NOT the state's total economic footprint. The prior ratios (corp 0.62,
      // taxableSales 1.1, otherRevenue 18.5% GDP) were authored as if revenue
      // should approach plan-investment spend (~85% GDP). Charged at the milder
      // easternBlocPolicyConfig rates (enterprise 55%, product 16%) that still
      // produced ~83% GDP revenue — approaching or exceeding NMP. By 1979 the
      // satellites ran consumer-goods programmes and softer turnover regimes than
      // the Stalinist ladder, with large hard-currency debt (esp. Poland); Soviet-
      // type *fiscal* budgets of this decade sat roughly 45–65% of national income
      // (CIA NMP-to-budget series; RU seed already anchors ~57% with corp 0.32 /
      // sales 0.75). Bases below × the 1979 Brezhnev-era rate ladder land ~55% GDP
      // revenue against ~58% authored spend — a small planned deficit, command
      // composition intact, softer than 1953's Stalinist remittance rates.
      taxBaseRatios: {
        taxableIncome: 0.06, // wage tax still secondary — state set wages
        corporateProfits: 0.32, // SOE surplus remitted; fiscal claim, not whole NMP
        wagesAndSalaries: 0.4,
        importValue: 0.12,
        // Turnover-tax base ≈ gross retail/producer turnover relative to NMP.
        // Cap below 1.0 so the 16% Product Tax Schedule cannot alone clear 16% GDP.
        taxableSales: 0.75,
      },
      // Direct remittances + state property income (softer than 1953's extraction
      // intensity; consumer-goods programmes funded more via enterprise levy).
      otherRevenue: Math.round(gdp * 0.12),
      debt: {
        principal: debtPrincipal,
        interestRate: 0.06,
        ceiling: Math.round(debtPrincipal * 1.6),
        ceilingLastRaisedYear: 1979,
      },
      creditRating,
      // Same footprint→fiscal cut on the spend side: prior infrastructure 30% +
      // grants 10% + social lines totalled ~85% GDP (whole plan investment). Scaled
      // to near-balance the ~55% revenue — consumer/social lines higher than 1953
      // (Brezhnev-era social wage), industry/infrastructure still the largest line.
      baselineSpendingByCategory: {
        defense: Math.round(gdp * 0.05),
        socialSecurity: Math.round(gdp * 0.12),
        healthcare: Math.round(gdp * 0.05),
        education: Math.round(gdp * 0.06),
        infrastructure: Math.round(gdp * 0.18), // plan investment + consumer subsidies
        other: Math.round(gdp * 0.08),
      },
      baselineStateGrants: Math.round(gdp * 0.06),
      policyDefaults: pc.defaults,
      policyOptionOverrides: pc.optionIndexes,
      taxPolicyIds: easternBlocPolicyConfig(prefix).taxPolicyIds,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Authored independently for FY1979 — not derived from other-era configs.
// Real FY1979 actuals: GDP ≈ $2.63T, outlays ≈ $504B, receipts ≈ $463B,
// DEFICIT ≈ −$41B (−1.6% of GDP), gross federal debt ≈ $829B (≈33% of GDP — the
// pre-Reagan-deficits low), AAA-rated, Treasury rates high amid 11% inflation.
export const NATIONAL_BUDGET_SEED_CONFIGS_1979: NationalBudgetSeedConfig[] = [
  US_NATIONAL_BUDGET_1979,
  RU_NATIONAL_BUDGET_1979,
  FR_NATIONAL_BUDGET_1979,
  IT_NATIONAL_BUDGET_1979,
  ES_NATIONAL_BUDGET_1979,
  SE_NATIONAL_BUDGET_1979,
  TR_NATIONAL_BUDGET_1979,
  GR_NATIONAL_BUDGET_1979,
  AT_NATIONAL_BUDGET_1979,
  FI_NATIONAL_BUDGET_1979,
  DD_NATIONAL_BUDGET_1979,
  HU_NATIONAL_BUDGET_1979,
  ...makeEasternBlocBudget(
    "PL",
    35_500_000,
    3_000_000_000_000,
    "PLZ",
    { gdpGrowth: 1.0, inflationRate: 6.0 },
    180_000_000_000,
    "BBB"
  ), // Gierek-era hard-currency debt
  ...makeEasternBlocBudget(
    "RO",
    22_000_000,
    800_000_000_000,
    "ROL",
    { gdpGrowth: 3.0, inflationRate: 2.0 },
    60_000_000_000,
    "BB"
  ), // Ceaușescu austerity to repay debt
  ...makeEasternBlocBudget(
    "YU",
    22_000_000,
    1_420_000_000_000,
    "YUD",
    { gdpGrowth: 4.0, inflationRate: 20.0 },
    200_000_000_000,
    "BB"
  ), // self-management, high inflation
  ...makeEasternBlocBudget(
    "BG",
    8_900_000,
    400_000_000_000,
    "BGL",
    { gdpGrowth: 3.0, inflationRate: 1.0 },
    18_000_000_000,
    "A"
  ),
  ...makeEasternBlocBudget(
    "BLR",
    9_500_000,
    450_000_000_000,
    "SUR",
    { gdpGrowth: 2.5, inflationRate: 0.5 },
    10_000_000_000,
    "AA"
  ),
  ...makeEasternBlocBudget(
    "UKR",
    49_800_000,
    875_000_000_000,
    "SUR",
    { gdpGrowth: 2.5, inflationRate: 0.5 },
    18_000_000_000,
    "AA"
  ),
  ...makeEasternBlocBudget(
    "CS",
    15_300_000,
    900_000_000_000,
    "CSK",
    { gdpGrowth: 2.5, inflationRate: 1.0 },
    20_000_000_000,
    "A"
  ),
  ...makeEasternBlocBudget(
    "BAL",
    7_400_000,
    420_000_000_000,
    "SUR",
    { gdpGrowth: 2.5, inflationRate: 0.5 },
    9_000_000_000,
    "AA"
  ),
  UK_NATIONAL_BUDGET_1979,
  DE_NATIONAL_BUDGET_1979,
  JP_NATIONAL_BUDGET_1979,
  CN_NATIONAL_BUDGET_1979,
  BR_NATIONAL_BUDGET_1979,
  IE_NATIONAL_BUDGET_1979,
  NG_NATIONAL_BUDGET_1979,
];

// ─────────────────────────────────────────────────────────────────────────────
// FY1953 — Bretton Woods / Korean War / Early Cold War.
// US: Treasury Historical Tables; UN Statistical Yearbook 1955; OEEC Economic
// Surveys; Mitchell's International Historical Statistics.
// USSR/Bloc: Western CIA/RAND NMP estimates (CIA FOIA, Bergson series).
// ─────────────────────────────────────────────────────────────────────────────

function makeEasternBlocBudget1953(
  countryId: NationalBudgetSeedConfig["countryId"],
  population: number,
  gdp: number,
  currencyCode: NationalBudgetSeedConfig["currencyCode"],
  factors: { gdpGrowth: number; inflationRate: number },
  debtPrincipal: number,
  creditRating: NationalBudgetSeedConfig["creditRating"]
): NationalBudgetSeedConfig[] {
  const prefix = countryId.toLowerCase();
  // Prefer era-authored 1953 defaults; fall back to the shared map if a bloc
  // country is missing from COUNTRY_POLICY_CONFIGS_1953.
  const pc = COUNTRY_POLICY_CONFIGS_1953[prefix] ?? COUNTRY_POLICY_CONFIGS[prefix];
  return [
    {
      budgetId: countryId,
      countryId,
      fiscalYear: 1953,
      population,
      gdp,
      currencyCode,
      economicFactors: {
        gdpGrowth: factors.gdpGrowth,
        wageGrowth: factors.inflationRate + 2,
        inflationRate: factors.inflationRate,
        tradeGrowth: 2.0,
        lastUpdated: new Date(0),
      },
      // Fiscal-budget scale (RU/DD fiscal-scale discipline), NOT the state's total
      // economic footprint. The prior ratios (corp 0.60, taxableSales 1.05,
      // otherRevenue 15.5% GDP) were authored for ~76% GDP revenue under the
      // milder shared easternBlocPolicyConfig rates (enterprise 55%, product
      // 16%). COUNTRY_POLICY_CONFIGS_1953 wires easternBlocPolicyConfig1953
      // instead — Total Surplus Remittance (70%) + Maximal Turnover Tax (26%)
      // — so those footprint bases produced 96–107% GDP revenue (enterprise
      // remittance alone ≈42% GDP). Soviet-type *fiscal* budgets of this era
      // ran ~45–70% of national income (turnover tax + profit remittances the
      // bulk; see Holzman / CIA NMP-to-budget series). Bases below × the 1953
      // Stalinist rate ladder land ~52% GDP revenue against ~54% authored
      // spend — a small planned deficit, command-economy composition intact.
      taxBaseRatios: {
        taxableIncome: 0.2, // wage tax secondary — the state set wages directly
        corporateProfits: 0.18, // SOE surplus remitted; fiscal claim, not whole NMP
        wagesAndSalaries: 0.35,
        importValue: 0.1,
        // Turnover-tax base ≈ gross retail/producer turnover relative to NMP.
        // Cap below 1.0 so the 26% Maximal Turnover Tax cannot alone clear 26% GDP.
        taxableSales: 0.6,
      },
      // Direct remittances + state property income (Holzman: non-tax ≈10–15% of
      // Soviet-type budget receipts in the early 1950s).
      otherRevenue: Math.round(gdp * 0.12),
      debt: {
        principal: debtPrincipal,
        interestRate: 0.04,
        ceiling: Math.round(debtPrincipal * 2.0),
        ceilingLastRaisedYear: 1953,
      },
      creditRating,
      // Same footprint→fiscal cut on the spend side: prior infrastructure 32% +
      // grants 8% + social lines totalled ~79% GDP (the state's whole plan
      // investment, not the fiscal outlay). Scaled to near-balance the ~52%
      // revenue — industry/infrastructure remains the largest single line.
      baselineSpendingByCategory: {
        defense: Math.round(gdp * 0.07), // Stalinist militarization higher than 1979
        socialSecurity: Math.round(gdp * 0.08),
        healthcare: Math.round(gdp * 0.04),
        education: Math.round(gdp * 0.05),
        infrastructure: Math.round(gdp * 0.18), // heavy-industry plan investment
        other: Math.round(gdp * 0.07),
      },
      baselineStateGrants: Math.round(gdp * 0.05),
      policyDefaults: pc.defaults,
      policyOptionOverrides: pc.optionIndexes,
      taxPolicyIds: easternBlocPolicyConfig(prefix).taxPolicyIds,
    },
  ];
}

// Real FY1953 actuals:
//   US — GDP $387B, outlays $76.1B, receipts $69.6B, deficit –$6.5B,
//     gross debt $275B (~71% GDP), AAA-rated, 92% top marginal rate, 52% corporate rate.
//   UK — GDP £14.4B, defence £1.6B (Korean War/NATO peak), NHS £570M first full year.
//   SU — NMP ≈ ₽1.4T (CIA Bergson), defense officially secret (~20% of NMP).
//   FR — GDP ≈ FFr 16,450B ($47B); Indochina War draining ~8% GDP on defence.
//   IT — GDP ≈ ₤10.6T lira ($17B); 'Miracolo Economico' just beginning.
//   ES — GDP ≈ ₧198B pesetas (autarky); Franco + US base treaty 1953 sign-off.
//   SE — GDP ≈ kr 36B; Swedish Model at full sail; neutrality + strong welfare.
//   TR — GDP ≈ ₺24B; Menderes boom; NATO 1952; US aid (Marshall Plan successor).
//   DE — GDP ≈ DEM 138B (~$33B); Wirtschaftswunder; no Bundeswehr until 1955.
//   JP — GDP ≈ ¥9.3T; post-Occupation recovery; Article 9 → tiny defence.
//   CN — GDP ≈ ¥CNY 82B; First Five-Year Plan + Soviet aid; Korean War ending.
//   BR — GDP ≈ Cr$ 330B ($18B); Vargas era ISI; Petrobras founded Aug 1953.
//   IE — GDP ≈ £IR 340M; emigration crisis; at par with GBP.
//   NG — Colonial Nigeria under British Crown; exports of groundnuts/cocoa/palm oil.
/**
 * 1953 preset national-budget seed configs.
 *
 * GDP is normally in local currency; cross-country comparison is invalid.
 * A few countries (IT, JP, CN, NG) store GDP in USD with `currencyCode`
 * display-only. The authoritative marker is `GDP_DENOMINATION_1953` in
 * `gdpDenomination.ts`, pinned by a guard test; update both together.
 */
export const NATIONAL_BUDGET_SEED_CONFIGS_1953: NationalBudgetSeedConfig[] = [
  US_NATIONAL_BUDGET_1953,
  UK_NATIONAL_BUDGET_1953,
  RU_NATIONAL_BUDGET_1953,
  FR_NATIONAL_BUDGET_1953,
  IT_NATIONAL_BUDGET_1953,
  ES_NATIONAL_BUDGET_1953,
  SE_NATIONAL_BUDGET_1953,
  TR_NATIONAL_BUDGET_1953,
  GR_NATIONAL_BUDGET_1953,
  AT_NATIONAL_BUDGET_1953,
  FI_NATIONAL_BUDGET_1953,
  DE_NATIONAL_BUDGET_1953,
  JP_NATIONAL_BUDGET_1953,
  CN_NATIONAL_BUDGET_1953,
  BR_NATIONAL_BUDGET_1953,
  IE_NATIONAL_BUDGET_1953,
  NG_NATIONAL_BUDGET_1953,
  DD_NATIONAL_BUDGET_1953,
  // ── Hungary FY1953 — Stalinist plan economy ─────────────────────────────────
  // NMP ≈ Ft 100B; forcible collectivisation, show trials; "New Course" announced
  // June 1953 after Stalin's death. Previously a hand-authored footprint-scale
  // block (corp 0.62 / sales 1.15 / other 21% → 107% GDP revenue); now routed
  // through makeEasternBlocBudget1953 so the fiscal-scale bases apply uniformly.
  ...makeEasternBlocBudget1953(
    "HU",
    9_500_000,
    100_000_000_000,
    "HUF",
    { gdpGrowth: 3.5, inflationRate: 3.0 },
    15_000_000_000,
    "A"
  ), // heavy industrialisation (Diósgyőr steel / new socialist towns)
  ...makeEasternBlocBudget1953(
    "PL",
    25_500_000,
    300_000_000_000,
    "PLZ",
    { gdpGrowth: 4.0, inflationRate: 2.0 },
    20_000_000_000,
    "BBB"
  ), // Bierut era; 6-Year Plan (1950–55); Nowa Huta steel town
  ...makeEasternBlocBudget1953(
    "RO",
    16_600_000,
    80_000_000_000,
    "ROL",
    { gdpGrowth: 3.5, inflationRate: 2.0 },
    8_000_000_000,
    "BB"
  ), // Dej Stalinist era; oil exports to USSR
  ...makeEasternBlocBudget1953(
    "YU",
    16_900_000,
    100_000_000_000,
    "YUD",
    { gdpGrowth: 5.0, inflationRate: 5.0 },
    15_000_000_000,
    "BB"
  ), // Tito; expelled Cominform 1948; US aid 1950; workers' self-management
  ...makeEasternBlocBudget1953(
    "BG",
    7_300_000,
    40_000_000_000,
    "BGL",
    { gdpGrowth: 4.0, inflationRate: 1.5 },
    4_000_000_000,
    "A"
  ), // Chervenkov era; most Stalinist of the bloc
  // The three western union republics now run their own budgets. Population and
  // GDP are the sums of their authored regions on the RSFSR ruble basis, so
  // reconcileStateGdp sees a rollup that matches the national figure.
  ...makeEasternBlocBudget1953(
    "BLR",
    7_700_000,
    50_000_000_000,
    "SUR",
    { gdpGrowth: 5.0, inflationRate: 0.5 },
    2_000_000_000,
    "AA"
  ), // Byelorussian SSR; reconstruction economy, MAZ and Soligorsk just standing up
  ...makeEasternBlocBudget1953(
    "UKR",
    41_000_000,
    291_667_000_000,
    "SUR",
    { gdpGrowth: 5.5, inflationRate: 0.5 },
    9_000_000_000,
    "AA"
  ), // Ukrainian SSR; the Union's second economy, Donbas coal and Dnieper steel
  ...makeEasternBlocBudget1953(
    "CS",
    12_400_000,
    200_000_000_000,
    "CSK",
    { gdpGrowth: 4.5, inflationRate: 1.5 },
    12_000_000_000,
    "A"
  ), // Zápotocký era; most industrialised bloc state; show trials (Slánský 1952)
  ...makeEasternBlocBudget1953(
    "BAL",
    2_900_000,
    29_167_000_000,
    "SUR",
    { gdpGrowth: 4.5, inflationRate: 0.5 },
    1_500_000_000,
    "AA"
  ), // Baltic SSRs; highest living standards in the Union, lowest consent for it
];

/**
 * Re-anchors FR/IT/ES/SE/TR/GR/AT/FI rows to the sourced 1991 national
 * accounts; other countries pass through. For AT/FI/GR carry-forward, 1991
 * real growth and CPI inflation replace the 1979 factors and spending lines
 * derive from sourced expenditure share. See fiscalAnchors1991.ts for sources.
 */
function anchorFiscal1991(config: NationalBudgetSeedConfig, carriedFrom1979: boolean) {
  const country = config.countryId as string;
  if (!(FISCAL_ANCHOR_COUNTRIES_1991 as readonly string[]).includes(country)) return config;
  const id = country as FiscalAnchorCountry1991;
  const anchor = FISCAL_ANCHORS_1991[id];
  const anchored = anchorBudget1991(config, anchor, gdp1991LegacyLcu(id), {
    deriveSpendingFromTotal: carriedFrom1979,
  });
  if (!carriedFrom1979) return anchored;
  return {
    ...anchored,
    economicFactors: {
      ...anchored.economicFactors,
      gdpGrowth: Number(anchor.realGrowthPct.toFixed(1)),
      inflationRate: Number(anchor.cpiInflationPct.toFixed(1)),
    },
  };
}

/**
 * Returns the preset-appropriate national-budget seed configs. Falls back
 * to the 2019-era bundle for unknown presets.
 */
function getUncalibratedNationalBudgetSeedConfigsForPreset(
  preset: string
): NationalBudgetSeedConfig[] {
  if (preset === "1953-default") return NATIONAL_BUDGET_SEED_CONFIGS_1953;
  if (preset === "1979-default") return NATIONAL_BUDGET_SEED_CONFIGS_1979;
  if (preset === "1991-default") {
    return overlayNationalBudgetConfigs(
      NATIONAL_BUDGET_SEED_CONFIGS_1991.map((config) =>
        countryHasFeature("ngSeeds", config.countryId)
          ? rebaseBudgetNominals(config, NG_1991_NOMINAL_GDP_NGN)
          : anchorFiscal1991(config, false)
      ),
      NATIONAL_BUDGET_SEED_CONFIGS_1979.filter((config) =>
        (["AT", "FI", "GR"] as string[]).includes(config.countryId)
      ).map((config) =>
        anchorFiscal1991(
          {
            ...config,
            fiscalYear: 1991,
            // Documented fallback: no 1991-authored row exists for these countries,
            // so the 1979 calibration (tax bases, rates, wage growth, spending mix)
            // carries forward visibly tagged. The 1991 aggregates below are sourced,
            // see anchorFiscal1991.
            sourceFiscalYear: config.sourceFiscalYear ?? config.fiscalYear,
          },
          true
        )
      ),
      1991
    );
  }
  if (preset === "1999-default") {
    return overlayNationalBudgetConfigs(
      // The seven transition republic budgets are scoped to the 1991 world.
      // Later presets may reintroduce a country only with a later authored row.
      getUncalibratedNationalBudgetSeedConfigsForPreset("1991-default").filter(
        (config) => !TRANSITION_1991_BUDGET_COUNTRIES.includes(config.countryId)
      ),
      NATIONAL_BUDGET_SEED_CONFIGS_1999,
      1999
    );
  }
  if (preset === "2007-default") {
    return overlayNationalBudgetConfigs(
      getUncalibratedNationalBudgetSeedConfigsForPreset("1999-default"),
      NATIONAL_BUDGET_SEED_CONFIGS_2007,
      2007
    );
  }
  if (preset === "2019-default") {
    return overlayNationalBudgetConfigs(
      getUncalibratedNationalBudgetSeedConfigsForPreset("2007-default"),
      [...NATIONAL_BUDGET_SEED_CONFIGS, ...MODERN_NATIONAL_BUDGETS_2019],
      2019
    );
  }
  if (preset === "2023-default") {
    return overlayNationalBudgetConfigs(
      // These five rows are authored for the 2019 reset only. A 2023 or
      // 2027 world needs its own fiscal calibration before it can include them.
      getUncalibratedNationalBudgetSeedConfigsForPreset("2019-default").filter(
        (config) => !MODERN_NATIONAL_BUDGETS_2019.some((row) => row.countryId === config.countryId)
      ),
      NATIONAL_BUDGET_SEED_CONFIGS_2023,
      2023
    );
  }
  if (preset === "2027-default") {
    return projectCarriedBudgetsTo2027(
      rebaseLegacyUnitBudgetsFor2027(
        convertEuroMemberBudgetsFor2027(
          overlayNationalBudgetConfigs(
            getUncalibratedNationalBudgetSeedConfigsForPreset("2023-default"),
            // Authored rows can lead the roster; an absent country seeds nothing.
            NATIONAL_BUDGET_SEED_CONFIGS_2027.filter(
              (config) => tierFor("2027-default", config.countryId) !== "absent"
            ),
            2027
          )
        )
      )
    );
  }
  return NATIONAL_BUDGET_SEED_CONFIGS;
}

/**
 * The authored 1991 central-government composition (HM Treasury FY1991/92 for
 * the UK) before any envelope fit, keyed by the v2 law book's budget keys.
 */
export function getAuthoredNationalSpending1991(countryId: string): Record<string, number> | null {
  return getAuthoredNationalSpending(countryId, 1991);
}

/**
 * A country's authored opening composition for a world year, keyed by the v2
 * law book's budget keys, or null when that year has no authored row for it.
 */
export function getAuthoredNationalSpending(
  countryId: string,
  year: number
): Record<string, number> | null {
  const rows =
    year === 1991
      ? NATIONAL_BUDGET_SEED_CONFIGS_1991
      : year === 2027
        ? NATIONAL_BUDGET_SEED_CONFIGS_2027
        : [];
  const config = rows.find((row) => row.countryId === countryId);
  return config ? { ...config.baselineSpendingByCategory } : null;
}

/**
 * 1991 legacy-ladder countries whose authored category mix is the fiscal
 * truth. BR: the ladder was calibrated to 1953 and booked 28.7B BRL of
 * programs (3.2% of GDP) against an authored 300B; the authored 300B at
 * opening receipts would run a ~17% of GDP deficit, so the mix is kept and
 * the total is set by the envelope instead.
 */
const AUTHORED_MIX_OPENING_1991 = new Set(["BR"]);

/** 1991 player budgets resize active programs while preserving receipts and historic debt. */
export function getNationalBudgetSeedConfigsForPreset(preset: string): NationalBudgetSeedConfig[] {
  const configs = getUncalibratedNationalBudgetSeedConfigsForPreset(preset);
  if (preset !== "1991-default") return configs;
  return configs.map(calibrateOpeningInflation1991).map((config) => {
    if (AUTHORED_MIX_OPENING_1991.has(config.countryId)) {
      // The legacy ladder prices this book on 1953 anchors, and its
      // 1953-only category pins never reach 1991. Keep the authored 1991
      // relative mix and size it to receipts after coupons, the same
      // coupon-inclusive opening balance the player countries use.
      const budget = buildNationalBudgetSeed(config);
      const envelope = fitOpeningFiscalEnvelope({
        gdp: config.gdp,
        annualRevenue: budget.revenue.total,
        annualDebtService: budget.spending.debtInterest,
        byCategory: config.baselineSpendingByCategory,
        stateGrants: config.baselineStateGrants,
        maximumDeficitGdpShare: PLAYER_RESET_DEFICIT_GDP_SHARE_1991,
        fillEnvelope: true,
      });
      return {
        ...config,
        baselineSpendingByCategory: envelope.byCategory,
        baselineStateGrants: envelope.stateGrants,
        calibratedSpendingBaseline: true,
      };
    }
    if (!["US", "UK", "JP"].includes(config.countryId)) {
      // The shared primary-source anchors own both nominal GDP and any
      // available historical debt/expenditure totals. Pin their authored
      // envelopes to actual laws instead of recalculating the old ladder.
      if ((FISCAL_ANCHOR_COUNTRIES_1991 as readonly string[]).includes(config.countryId)) {
        return { ...config, calibratedSpendingBaseline: true };
      }
      const nominalGdp =
        NATIVE_NOMINAL_GDP_1991[config.countryId as keyof typeof NATIVE_NOMINAL_GDP_1991];
      if (nominalGdp === undefined) return config;
      // Preserve the effective opening program book, rather than dormant
      // authored baselines overridden by legacy policy ladders. Pin actual
      // laws to the same shares to survive subsequent fiscal refreshes.
      const spending = deriveSpending(
        config,
        new Map(budgetLegislationTypes.map((type) => [type._id, type] as const))
      );
      const rebased = rebaseBudgetNominals(
        {
          ...config,
          baselineSpendingByCategory: spending.byCategory,
          baselineStateGrants: spending.stateGrants,
          calibratedSpendingBaseline: true,
        },
        nominalGdp
      );
      if (!countryHasFeature("ieSeeds", config.countryId)) return rebased;
      // CSO's gross debt stock is an absolute EUR observation restored to IEP.
      // Preserve the authored ceiling headroom, not the stale 133.3% debt share.
      const ireland = {
        ...rebased,
        debt: {
          ...rebased.debt,
          principal: IRISH_GROSS_GOVERNMENT_DEBT_1991_IEP,
          ceiling:
            IRISH_GROSS_GOVERNMENT_DEBT_1991_IEP * (rebased.debt.ceiling / rebased.debt.principal),
        },
      };
      // The seeded Irish law book is rescaled to this baseline (deriveEnactedLaws),
      // and enacted laws are what calculateFederalSpending prices every turn, so
      // the baseline is what Ireland spends. The derived book runs about 46% of GDP before about 9% of debt
      // service against 42% receipts, a 13% of GDP deficit no 1991 Irish
      // government ran. Size it to receipts after debt service like the other
      // openings; the mix is kept and the book only shrinks.
      const irelandBudget = buildNationalBudgetSeed(ireland);
      const envelope = fitOpeningFiscalEnvelope({
        gdp: ireland.gdp,
        annualRevenue: irelandBudget.revenue.total,
        annualDebtService: irelandBudget.spending.debtInterest,
        byCategory: ireland.baselineSpendingByCategory,
        stateGrants: ireland.baselineStateGrants,
        maximumDeficitGdpShare: PLAYER_RESET_DEFICIT_GDP_SHARE_1991,
      });
      return {
        ...ireland,
        baselineSpendingByCategory: envelope.byCategory,
        baselineStateGrants: envelope.stateGrants,
      };
    }
    const budget = buildNationalBudgetSeed(config);
    const typesById = new Map(budgetLegislationTypes.map((type) => [type._id, type] as const));
    const activeSpending = deriveSpending(config, typesById, true);
    const envelope = fitOpeningFiscalEnvelope({
      gdp: config.gdp,
      annualRevenue: budget.revenue.total,
      annualDebtService: budget.spending.debtInterest,
      byCategory: activeSpending.byCategory,
      stateGrants: activeSpending.stateGrants,
      maximumDeficitGdpShare: PLAYER_RESET_DEFICIT_GDP_SHARE_1991,
    });
    return {
      ...config,
      baselineSpendingByCategory: envelope.byCategory,
      baselineStateGrants: envelope.stateGrants,
      calibratedSpendingBaseline: true,
    };
  });
}

/**
 * Euroize inherited euro-member rows for the 2027 preset. Every absolute-money
 * field (gdp, otherRevenue, debt principal/ceiling, per-category baselines,
 * state grants, per-capita policy revenues) scales by the authored cross rate
 * `R_EUR / R_legacy` from the same table the FX seeder uses, so anchor value
 * is conserved exactly. Ratios (taxBaseRatios, gdp multipliers, interest
 * rates, ratings) pass through. Ireland converts at 1.0: code flips, amounts
 * stay. Non-euro rows and DE (already EUR) are untouched.
 */
function convertEuroMemberBudgetsFor2027(
  configs: NationalBudgetSeedConfig[]
): NationalBudgetSeedConfig[] {
  const preset = "2027-default";
  const rates = getInitialRates(preset);
  const eurAnchorRate = rates.DE;
  if (eurAnchorRate == null || eurAnchorRate <= 0) return configs;
  return configs.map((config) => {
    if (config.currencyCode === "EUR") return config;
    if (!isEuroAdopted(config.countryId, preset)) return config;
    const factor = euroConversionFactor(rates[config.countryId] ?? NaN, eurAnchorRate);
    return scaleBudgetMoney(config, factor, "EUR");
  });
}

/**
 * Inherited 2027 rows whose amounts are game units priced at a stale rate.
 * The SE and TR 2019 books were sized for 4.29 SEK and 34.5 TRL per unit (the
 * modern-table rows). The 2027 table carries 2024 market rates, so their
 * money fields rebase by `newRate / legacyRate`, conserving anchor value
 * exactly. TR also moves to the modern lira. Only an inherited row in the
 * legacy code rebases; an authored 2027 row is already on the new scale.
 */
const LEGACY_UNIT_REBASE_2027: ReadonlyArray<{
  countryId: CountryId;
  legacyCode: NationalBudgetSeedConfig["currencyCode"];
  currencyCode: NationalBudgetSeedConfig["currencyCode"];
}> = [
  { countryId: "SE", legacyCode: "SEK", currencyCode: "SEK" },
  { countryId: "TR", legacyCode: "TRL", currencyCode: "TRY" },
];

function rebaseLegacyUnitBudgetsFor2027(
  configs: NationalBudgetSeedConfig[]
): NationalBudgetSeedConfig[] {
  const rates = getInitialRates("2027-default");
  return configs.map((config) => {
    const rule = LEGACY_UNIT_REBASE_2027.find((row) => row.countryId === config.countryId);
    if (!rule || config.currencyCode !== rule.legacyCode) return config;
    if ((config.sourceFiscalYear ?? config.fiscalYear) >= 2027) return config;
    const legacyRate = INITIAL_RATES[rule.countryId];
    const rate = rates[rule.countryId];
    if (!legacyRate || !rate || legacyRate <= 0 || rate <= 0) return config;
    return scaleBudgetMoney(config, rate / legacyRate, rule.currencyCode);
  });
}

/**
 * Rows still carrying an earlier era's calibration take their size, debt,
 * revenue ratio and macro factors from the sourced 2027 national figures.
 */
function projectCarriedBudgetsTo2027(
  configs: NationalBudgetSeedConfig[]
): NationalBudgetSeedConfig[] {
  return configs.map((config) => {
    const figures = NATIONAL_FIGURES_2027[config.countryId];
    if (!figures || config.sourceFiscalYear === undefined) return config;
    const atNewGdp = rebaseBudgetNominals(config, figures.gdp);
    const modeledRevenue = buildNationalBudgetSeed(atNewGdp).revenue.total / figures.gdp;
    const { sourceFiscalYear: _carried, ...projected } = projectBudget2027(
      config,
      figures,
      modeledRevenue
    );
    void _carried;
    return projected;
  });
}

/**
 * Scale every absolute-money field of a budget row and restamp its currency.
 * Ratios (taxBaseRatios, gdp multipliers, interest rates, ratings) pass through.
 */
function scaleBudgetMoney(
  config: NationalBudgetSeedConfig,
  factor: number,
  currencyCode: NationalBudgetSeedConfig["currencyCode"]
): NationalBudgetSeedConfig {
  const scaledSpending: Record<string, number> = {};
  for (const [key, value] of Object.entries(config.baselineSpendingByCategory)) {
    scaledSpending[key] = value * factor;
  }
  return {
    ...config,
    currencyCode,
    gdp: config.gdp * factor,
    otherRevenue: config.otherRevenue * factor,
    debt: {
      ...config.debt,
      principal: config.debt.principal * factor,
      ceiling: config.debt.ceiling * factor,
    },
    baselineSpendingByCategory: scaledSpending,
    baselineStateGrants: config.baselineStateGrants * factor,
    policyRevenueConfigs: config.policyRevenueConfigs?.map((revenueConfig) => ({
      ...revenueConfig,
      annualRevenuePerCapitaByOptionIndex: revenueConfig.annualRevenuePerCapitaByOptionIndex?.map(
        (perCapita) => perCapita * factor
      ),
    })),
  };
}

/** Preserve the last complete era roster while applying newer authored rows. */
function overlayNationalBudgetConfigs(
  base: NationalBudgetSeedConfig[],
  overrides: NationalBudgetSeedConfig[],
  inheritedFiscalYear?: number
): NationalBudgetSeedConfig[] {
  const overrideByCountry = new Map(overrides.map((config) => [config.countryId, config]));
  const inherited = base.map((config) => {
    const override = overrideByCountry.get(config.countryId);
    if (override) return override;
    if (inheritedFiscalYear === undefined) return config;
    // Tag the source era: the rewritten fiscalYear says which world
    // the row seeds, sourceFiscalYear says which era authored its factors.
    return {
      ...config,
      fiscalYear: inheritedFiscalYear,
      sourceFiscalYear: config.sourceFiscalYear ?? config.fiscalYear,
    };
  });
  const baseCountries = new Set(base.map((config) => config.countryId));
  return [...inherited, ...overrides.filter((config) => !baseCountries.has(config.countryId))];
}

export interface NationalBudgetSeedProvenance {
  countryId: string;
  budgetId: string;
  /** Effective year in this preset (the world's fiscal year). */
  fiscalYear: number;
  /** Era the row's factors were authored for. Equals fiscalYear when explicit. */
  sourceFiscalYear: number;
  /** True when the row carries another era's calibration into this preset. */
  inherited: boolean;
}

/**
 * Per-country provenance for a preset's budget roster: every cross-era
 * inheritance is observable with source and target era instead of hidden
 * behind a rewritten fiscalYear.
 */
export function getNationalBudgetSeedProvenance(preset: string): NationalBudgetSeedProvenance[] {
  return getNationalBudgetSeedConfigsForPreset(preset).map((config) => {
    const sourceFiscalYear = config.sourceFiscalYear ?? config.fiscalYear;
    return {
      countryId: config.countryId,
      budgetId: config.budgetId,
      fiscalYear: config.fiscalYear,
      sourceFiscalYear,
      inherited: sourceFiscalYear !== config.fiscalYear,
    };
  });
}

/**
 * Cross-era rows only: each entry names the country, the era that authored
 * its factors, and the preset era it seeds. Empty means every country in the
 * preset carries an explicit era-appropriate calibration.
 */
export function reportCrossEraBudgetInheritance(preset: string): NationalBudgetSeedProvenance[] {
  return getNationalBudgetSeedProvenance(preset).filter((row) => row.inherited);
}

/**
 * Builds the federal-budget seed array for the given preset.
 */
export function getInitialNationalBudgetsForPreset(preset: string): SupportedNationalBudget[] {
  const budgets = getNationalBudgetSeedConfigsForPreset(preset).map(buildNationalBudgetSeed);
  // Fail loud on the zero-revenue pathology (BR's class of bug): a country with
  // real tax bases but an all-zero core rate vector means its taxPolicyIds
  // referenced legislation types that were never seeded, so it collects nothing
  // and runs a permanent placeholder-only deficit. Add taxRateOverrides or a
  // legislation module rather than shipping a country that levies no taxes.
  for (const b of budgets) {
    b.taxRates = initializeCapitalGainsTaxRates(initializeIncomeTaxRates(b.taxRates));
    b.incomeTaxBatchReceipt = null;
    b.incomeTaxShares = incomeBaseShares(DEFAULT_INCOME_POPULATION);
    const hasBase =
      b.taxBases.taxableIncome > 0 ||
      b.taxBases.wagesAndSalaries > 0 ||
      b.taxBases.taxableSales > 0;
    const allCoreRatesZero =
      !b.taxRates.incomeTax &&
      !b.taxRates.domesticCorporateTax &&
      !b.taxRates.payrollTax &&
      !b.taxRates.tariffs &&
      !b.taxRates.salesTax;
    if (hasBase && allCoreRatesZero) {
      throw new Error(
        `Seed preset "${preset}": ${b.countryId} has non-zero tax bases but an ` +
          `all-zero tax-rate vector — its taxPolicyIds likely reference unseeded ` +
          `legislation types. Add taxRateOverrides or a legislation module.`
      );
    }
  }
  return budgets;
}

export const initialNationalBudgets: SupportedNationalBudget[] =
  getNationalBudgetSeedConfigsForPreset("2019-default").map(buildNationalBudgetSeed);

export const initialUkBudget = initialNationalBudgets.find((budget) =>
  countryHasFeature("ukSeeds", budget.countryId)
) as SupportedNationalBudget;

type StateBudgetSeedInput = {
  id: string;
  population: number;
  gdp: number;
  countryId?: string;
};

export interface CountryOwnedSeedData {
  corporation: Omit<Corporation, "_id"> & { _id: ObjectId };
  sectors: Array<Omit<CorporateSector, "_id"> & { _id: ObjectId }>;
}

const UK_PUBLIC_CORPORATION_ID = new ObjectId("700000000000000000000001");
const UK_PUBLIC_PLACEHOLDER_CHARACTER_ID = new ObjectId("700000000000000000000002");
const UK_PUBLIC_PLACEHOLDER_USER_ID = new ObjectId("700000000000000000000003");
const US_PUBLIC_CORPORATION_ID = new ObjectId("700000000000000000000011");
const US_PUBLIC_PLACEHOLDER_CHARACTER_ID = new ObjectId("700000000000000000000012");
const US_PUBLIC_PLACEHOLDER_USER_ID = new ObjectId("700000000000000000000013");
const JP_PUBLIC_CORPORATION_ID = new ObjectId("700000000000000000000021");
const JP_PUBLIC_PLACEHOLDER_CHARACTER_ID = new ObjectId("700000000000000000000022");
const JP_PUBLIC_PLACEHOLDER_USER_ID = new ObjectId("700000000000000000000023");
const JP_PUBLIC_CORPORATION_SEQUENTIAL_ID = 900_003;

/** Reserved sequential IDs for country-owned corporations (stable /corporation/{id} URLs). */
const US_PUBLIC_CORPORATION_SEQUENTIAL_ID = 900_001;
const UK_PUBLIC_CORPORATION_SEQUENTIAL_ID = 900_002;

// ── USSR (RU) state enterprise ────────────────────────────────────────────
// The USSR is a command economy with no player corporations, so unless the
// state owns producing sectors it is an economic ghost (0 corps / 0 sectors →
// no commodity supply, since only OWNED sectors count in commodityPriceTurn).
// Seed a single primary National Corporation ("Gosplan") that OWNS producing
// sectors across the commanding heights in every Soviet region. Continues the
// 700…x1/x2/x3 issuer id sequence (US 11, JP 21, DE 31, IE 41, BR 51, CN 61,
// NG 71 → RU 81) and the 900_00N sequentialId sequence (→ 900_009).
const RU_PUBLIC_CORPORATION_ID = new ObjectId("700000000000000000000081");
const RU_PUBLIC_PLACEHOLDER_CHARACTER_ID = new ObjectId("700000000000000000000082");
const RU_PUBLIC_PLACEHOLDER_USER_ID = new ObjectId("700000000000000000000083");
const RU_PUBLIC_CORPORATION_SEQUENTIAL_ID = 900_009;

/**
 * Command Economy v2 (P0): stable ObjectIds for the per-sector SOE corporations.
 * When `commandEconomyEnabled` is on, a command country's producing sectors are
 * owned by ONE SOE per commanding-height sector rather than a single National
 * Corp. Ids are derived deterministically from a per-country base so reseeds
 * are idempotent.
 */
// Legacy SOEs used `700…000` + 3 hex digits (suffix < 0x1000).
// widened every Eastern-bloc country to one SOE per CorporationType (17×8 =
// 0x88 headroom → 0x100 bands). Placing those bands at 0x100–0xc00 collided
// with live legacy ObjectIds (BG/RO/YU overwrote RU/CN/DD). New layout uses a
// 4-hex suffix under a 20-char prefix, starting at 0x1000 — disjoint from every
// legacy 3-digit SOE id. Slot index is the stable OPERATING_SECTOR_TYPES ordinal.
const SOE_ID_BASE_BY_COUNTRY: Partial<Record<CountryId, number>> = {
  UKR: 0x1000,
  BLR: 0x1100,
  BAL: 0x1200,
  RU: 0x1300,
  CN: 0x1400,
  DD: 0x1500,
  PL: 0x1600,
  HU: 0x1700,
  CS: 0x1800,
  BG: 0x1900,
  RO: 0x1a00,
  YU: 0x1b00,
};
const SOE_SEQUENTIAL_BASE_BY_COUNTRY: Partial<Record<CountryId, number>> = {
  UKR: 901_000,
  BLR: 901_100,
  BAL: 901_200,
  RU: 900_100,
  CN: 900_200,
  DD: 900_300,
  PL: 900_400,
  HU: 900_500,
  CS: 900_600,
  BG: 900_700,
  RO: 900_800,
  YU: 900_900,
};
function soeObjectId(suffix: number): ObjectId {
  return new ObjectId("70000000000000000000" + suffix.toString(16).padStart(4, "0"));
}

/**
 * Sectors the Soviet state directly operates — the "commanding heights" of a
 * planned economy. These are the RU National Corporation's owned sectors so the
 * USSR produces commodities each turn even with no player corporations.
 */
const RU_COMMANDING_HEIGHTS: CorporationType[] = [
  "manufacturing",
  "energy",
  "extraction",
  "agriculture",
  "defense",
  "chemical_industries",
];

/**
 * Command Economy v2: build the per-sector state-owned-enterprise corp entries
 * for a command country — one SOE corporation per commanding-height sector (from
 * {@link commandEconomySoeSectors}), each OWNING that sector's producing
 * `corporateSectors` across every supplied region where it can operate and carrying the
 * {@link SoeState} plan-fulfillment overlay. Shared by RU and CN so both command
 * economies split identically: deterministic per-country SOE ids/sequentials
 * (from the `SOE_*_BASE_BY_COUNTRY` maps), on-plan seed output, a vacant
 * (NPP-run) director seat, and thin soft-budget margins. The CALLER keeps the
 * country's bare sovereign issuer as the primary National Corporation; these
 * SOEs are the non-primary producing arms.
 */
function buildCommandSoeCorpEntries(params: {
  countryId: CountryId;
  states: StateBudgetSeedInput[];
  preset: string;
  now: Date;
  /** Prefixes the enterprise name, e.g. "Soviet" / "Chinese". */
  namePrefix: string;
  /** Closes the description sentence, e.g. "Soviet planned economy". */
  polityDescriptor: string;
  headquartersState: string;
  currencyCode: ActiveCurrencyCode;
  legalStructure: LegalStructureId | undefined;
  /** Extraction default, optionally overridden for selected states. */
  defaultExtractionStrategyId?: string;
  extractionStrategyByState?: Partial<Record<string, string>>;
  /** Seed logger used when extraction placement is rejected. */
  log?: (message: string) => void;
}): CountryOwnedSeedData[] {
  const {
    countryId,
    states,
    preset,
    now,
    namePrefix,
    polityDescriptor,
    headquartersState,
    currencyCode,
    legalStructure,
    defaultExtractionStrategyId,
    extractionStrategyByState,
    log,
  } = params;
  const soeSectors = commandEconomySoeSectors(countryId);
  if (soeSectors.length === 0 || states.length === 0) return [];

  const usdRate = getCountryConfig(countryId, preset).usdExchangeRate || 1;
  const idBase = SOE_ID_BASE_BY_COUNTRY[countryId] ?? 0xa00;
  const seqBase = SOE_SEQUENTIAL_BASE_BY_COUNTRY[countryId] ?? 900_100;
  const eraUnitScale = getEraUnitScale(preset);
  const capacityMap = getStateResourceCapacity(preset);

  // Plan growth for the state enterprises, from the era monetary baseline
  // (RU 1953 → 6.0). In a market economy an SOE can sit at zero because
  // NPP-founded private firms carry expansion; here EVERY producing sector is
  // an SOE, so a zero target freezes the entire economy — RU ran 136/136
  // sectors at 0.00% and its corporate revenue was byte-identical across the
  // whole run while market economies grew 2.6-4.0%.
  const presetYear = parseInt(preset.slice(0, 4), 10);
  const planGrowthRate =
    getEraTrendGdpGrowth(countryId, Number.isFinite(presetYear) ? presetYear : null) ?? 3;

  // One owned producing sector for (state, sectorType) under `corpId`. Sector
  // revenue is stored in the corp's LOCAL currency: the canonical ₳ market size
  // from computeUnownedSeedRevenue divided back through the country's USD rate,
  // matching the NatCorp convention commodityPriceTurn expects. Under plants,
  // capitalStock is seeded in lockstep from the same ₳ figure so capacity
  // exists on day one (sectorTurn would otherwise lazy-seed from revenue).
  const buildSector = (
    state: StateBudgetSeedInput,
    lane: OperatingSectorType,
    corpId: ObjectId
  ) => {
    const { sectorType, industryModel, mediaDiscriminator } = operatingSectorIdentity(lane);
    const strategyId =
      sectorType === "extraction"
        ? (extractionStrategyByState?.[state.id] ?? defaultExtractionStrategyId)
        : undefined;
    const revenueAtlantic = computeUnownedSeedRevenue({
      gdp: state.gdp,
      countryId,
      stateId: state.id,
      sectorType: lane,
      preset,
    });
    const revenue = Math.round(revenueAtlantic / usdRate);
    const capitalStock = computeSectorImpliedUnits(
      sectorType,
      revenueAtlantic,
      strategyId,
      eraUnitScale,
      industryModel,
      mediaDiscriminator
    );
    return {
      _id: new ObjectId(),
      corporationId: corpId,
      countryId,
      stateId: state.id,
      sectorType,
      ...(industryModel ? { industryModel } : {}),
      ...(mediaDiscriminator ? { mediaDiscriminator } : {}),
      targetGrowthRate: planGrowthRate,
      currentGrowthRate: planGrowthRate,
      currentGrowthCost: 0,
      revenue,
      capitalStock,
      ...(strategyId ? { strategyId } : {}),
      // Soft-budget state enterprises run thin margins vs private firms.
      profitMargin: 12,
      workers: Math.max(100, Math.round(revenue / 2_000)),
      createdAt: now,
      updatedAt: now,
    };
  };

  return soeSectors.map((lane) => {
    const identity = operatingSectorIdentity(lane);
    const sectorType = identity.sectorType;
    const slot = OPERATING_SECTOR_TYPES.indexOf(lane);
    if (slot < 0) {
      throw new Error(`command SOE lane ${lane} is not an operating sector type`);
    }
    const corpId = soeObjectId(idBase + slot * 8);
    const ceoId = soeObjectId(idBase + slot * 8 + 1);
    const userId = soeObjectId(idBase + slot * 8 + 2);
    const sectorStates =
      sectorType === "extraction"
        ? states.filter((state) => {
            const resources =
              lookupStateResourceCapacity(capacityMap, countryId, state.id)?.resources ?? {};
            if (Object.keys(resources).length > 0) return true;
            log?.(
              `[${countryId}] skipping extraction SOE sector in ${state.id}: ` +
                `no seeded resource capacity for preset ${preset}`
            );
            return false;
          })
        : states;
    const sectors = sectorStates.map((state) => buildSector(state, lane, corpId));
    const planTarget = sectors.reduce((sum, s) => sum + s.revenue, 0);
    const label = OPERATING_SECTOR_TYPE_LABELS[lane];
    return {
      corporation: {
        _id: corpId,
        sequentialId: seqBase + slot,
        name: `${namePrefix} ${label} Enterprise`,
        description: `State-owned enterprise operating the ${label.toLowerCase()} sector of the ${polityDescriptor}.`,
        type: sectorType,
        ...(identity.industryModel ? { industryModel: identity.industryModel } : {}),
        ...(identity.mediaDiscriminator ? { mediaDiscriminator: identity.mediaDiscriminator } : {}),
        countryId,
        ceoId,
        userId,
        headquartersState,
        liquidCapital: 0,
        liquidCurrencyCode: currencyCode,
        marketingBudget: 0,
        marketingStrength: 0,
        logisticsBudget: 0,
        logisticsStrength: 0,
        ceoSalary: 0,
        totalShares: 0,
        sharePrice: 1,
        shareholders: [],
        publicFloat: 0,
        ceoVacant: true,
        countryOwnerId: countryId,
        hiddenFromExchange: false,
        isNationalized: false,
        isPrivate: false,
        isPrimaryNationalCorporation: false,
        assignedSectorTypes: [lane],
        soe: makeSeedSoeState(lane, planTarget),
        legalStructure,
        createdAt: now,
        updatedAt: now,
      },
      sectors,
    };
  });
}

// 1953 market-economy state enterprises. FR/IT/SE/TR/GR/AT/FI are market
// democracies without the RU/CN/Warsaw-Pact SOE stack, but each is modeled
// as ONE state-holding corporation that owns a realistic minority/plurality
// share of a handful of nationalized anchors; the rest of each sector (and
// every unlisted sector) stays in `unownedSectors` for players to found new
// corporations against. 1953 preset only: by later presets several of these
// firms were privatized.
//
// ES is excluded and kept dormant (DORMANT_MARKET_STATE_ENTERPRISE_SPECS):
// for 1953-default Spain is sphere-macro, whose invariant is zero
// corporations/corporateSectors, so its spec is preserved as inert reference.
interface MarketStateEnterpriseSectorSpec {
  type: OperatingSectorType;
  /**
   * Share of the (state, sectorType) unowned-market bucket this state
   * enterprise captures, e.g. 0.9 ⇒ the state holds ~90% of that sector's
   * addressable market in every seeded region, the remainder stays unowned.
   */
  marketShare: number;
}

interface MarketStateEnterpriseSpec {
  countryId: CountryId;
  oid: string;
  ceoOid: string;
  userOid: string;
  sequentialId: number;
  name: string;
  description: string;
  headquartersState: string;
  sectors: MarketStateEnterpriseSectorSpec[];
}

/**
 * Build the state-holding corporation + owned `corporateSectors` for ONE
 * market-economy country from a {@link MarketStateEnterpriseSpec}. Mirrors the
 * UK NHS corp's shape (a single nationalized entity capturing a bounded share
 * of the market) rather than the command-economy SOE-per-sector split — these
 * countries are mixed economies, not planned ones, so one holding company
 * across a handful of real state monopolies/majority stakes is the correct
 * unit, not one corp per sector.
 */
function buildMarketStateEnterpriseCorpEntries(params: {
  spec: MarketStateEnterpriseSpec;
  states: StateBudgetSeedInput[];
  preset: string;
  now: Date;
}): CountryOwnedSeedData[] {
  const { spec, states, preset, now } = params;
  const countryStates = states.filter((s) => s.countryId === spec.countryId && s.gdp > 0);
  if (countryStates.length === 0 || spec.sectors.length === 0) return [];

  const usdRate = getCountryConfig(spec.countryId, preset).usdExchangeRate || 1;
  const presetYear = parseInt(preset.slice(0, 4), 10);
  const growthRate =
    getEraTrendGdpGrowth(spec.countryId, Number.isFinite(presetYear) ? presetYear : null) ?? 3;
  const corpId = new ObjectId(spec.oid);

  const sectors: CountryOwnedSeedData["sectors"] = [];
  for (const sectorSpec of spec.sectors) {
    const identity = operatingSectorIdentity(sectorSpec.type);
    for (const state of countryStates) {
      // Canonical (state, sectorType) market size, same source of truth the
      // unowned-market seeder uses — then take only this enterprise's share.
      const bucketRevenueAtlantic = computeUnownedSeedRevenue({
        gdp: state.gdp,
        countryId: spec.countryId,
        stateId: state.id,
        sectorType: sectorSpec.type,
        preset,
      });
      const revenue = Math.round((bucketRevenueAtlantic / usdRate) * sectorSpec.marketShare);
      sectors.push({
        _id: new ObjectId(),
        corporationId: corpId,
        countryId: spec.countryId,
        stateId: state.id,
        sectorType: identity.sectorType,
        ...(identity.industryModel ? { industryModel: identity.industryModel } : {}),
        ...(identity.mediaDiscriminator ? { mediaDiscriminator: identity.mediaDiscriminator } : {}),
        targetGrowthRate: growthRate,
        currentGrowthRate: growthRate,
        currentGrowthCost: 0,
        revenue,
        // Nationalized-industry margin: thinner than a typical private firm
        // (~35%) but healthier than a soft-budget command SOE (12%) — these
        // firms answer to a market-adjacent P&L, not a plan quota.
        profitMargin: 20,
        workers: Math.max(100, Math.round(revenue / 2_000)),
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return [
    {
      corporation: {
        _id: corpId,
        sequentialId: spec.sequentialId,
        name: spec.name,
        description: spec.description,
        type: corporationTypeOfLane(spec.sectors[0].type),
        countryId: spec.countryId,
        ceoId: new ObjectId(spec.ceoOid),
        userId: new ObjectId(spec.userOid),
        headquartersState: spec.headquartersState,
        liquidCapital: 0,
        liquidCurrencyCode: getSeedCurrencyCode(spec.countryId, preset) as ActiveCurrencyCode,
        marketingBudget: 0,
        marketingStrength: 0,
        logisticsBudget: 0,
        logisticsStrength: 0,
        ceoSalary: 0,
        totalShares: 0,
        sharePrice: 1,
        shareholders: [],
        publicFloat: 0,
        ceoVacant: true,
        countryOwnerId: spec.countryId,
        hiddenFromExchange: false,
        isNationalized: true,
        isPrivate: false,
        isPrimaryNationalCorporation: true,
        legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE[spec.countryId],
        createdAt: now,
        updatedAt: now,
      },
      sectors,
    },
  ];
}

/**
 * The ACTIVE market-economy specs (ES lives in
 * {@link DORMANT_MARKET_STATE_ENTERPRISE_SPECS}). OIDs continue the 700…0XXX
 * single-corp sequence (US 011 … DD 091, this block 0A1-121) and the 900_0NN
 * sequentialId sequence (DD 900_010, then 900_011-900_018). Distinct from the
 * SOE_ID_BASE_BY_COUNTRY hex ranges (0xa00+), reserved for command-economy
 * per-sector SOEs.
 */
const MARKET_STATE_ENTERPRISE_SPECS: MarketStateEnterpriseSpec[] = [
  // France — the 1945 Liberation nationalizations (de Gaulle's provisional
  // government): Renault (auto manufacturer seized from its collaborationist
  // owner), the Banque de France + four deposit banks, EDF/GDF (electricity +
  // gas), and Charbonnages de France (coal). Source: nationalization laws of
  // Dec 1944-May 1946.
  {
    countryId: "FR",
    oid: "7000000000000000000000a1",
    ceoOid: "7000000000000000000000a2",
    userOid: "7000000000000000000000a3",
    sequentialId: 900_011,
    name: "Régie et Charbonnages de France",
    description:
      "State holding for France's 1945-46 Liberation nationalizations: Renault (automobiles), EDF/GDF (electricity and gas), Charbonnages de France (coal), SNCF (rail), and the nationalized deposit banks.",
    headquartersState: "FR_IDF",
    sectors: [
      { type: "energy", marketShare: 0.9 }, // EDF + GDF: near-total electricity/gas monopoly
      { type: "extraction", marketShare: 0.85 }, // Charbonnages de France: coal monopoly
      { type: "logistics", marketShare: 0.55 }, // SNCF: dominant rail, private trucking coexists
      { type: "manufacturing_vehicles", marketShare: 0.35 }, // Renault: ~1/3 of French auto output vs. private Peugeot/Citroën/Simca
      { type: "financial", marketShare: 0.45 }, // Banque de France + 4 deposit banks: ~half of French deposits
    ],
  },
  // Italy — IRI (Istituto per la Ricostruzione Industriale, 1933) held Italy's
  // steel (Finsider), engineering (Finmeccanica) and shipping (Finmare)
  // conglomerates plus large bank stakes; ENI (Ente Nazionale Idrocarburi) was
  // founded in February 1953 — this exact seed year — as the state oil/gas/
  // methane monopoly.
  {
    countryId: "IT",
    oid: "7000000000000000000000b1",
    ceoOid: "7000000000000000000000b2",
    userOid: "7000000000000000000000b3",
    sequentialId: 900_012,
    name: "IRI-ENI Holding",
    description:
      "State holding combining IRI (Istituto per la Ricostruzione Industriale, 1933) — Finsider steel and Finmeccanica engineering — and ENI (Ente Nazionale Idrocarburi), the state hydrocarbon monopoly founded February 1953.",
    headquartersState: "IT_LAZ",
    sectors: [
      { type: "manufacturing", marketShare: 0.4 }, // Finsider steel + Finmeccanica engineering
      { type: "energy", marketShare: 0.5 }, // ENI: state monopoly on Po Valley methane/hydrocarbons
      { type: "logistics", marketShare: 0.6 }, // Finmare: dominant Italian merchant marine
      { type: "financial", marketShare: 0.4 }, // IRI's BIN bank-holding stakes (Comit, Credito Italiano, Banco di Roma)
    ],
  },
  // Sweden — the most private of the eight (SKF, Volvo, LM Ericsson, Alfa
  // Laval all private in 1953), so a deliberately small state sector: SJ
  // (Statens Järnvägar, state railways since 1856), Vattenfall (state
  // hydroelectric authority, 1909), Televerket (state telephone monopoly).
  {
    countryId: "SE",
    oid: "7000000000000000000000d1",
    ceoOid: "7000000000000000000000d2",
    userOid: "7000000000000000000000d3",
    sequentialId: 900_014,
    name: "Statens Affärsverk",
    description:
      "Swedish state-enterprise holding: SJ (Statens Järnvägar, state railways since 1856), Vattenfall (state hydroelectric authority, 1909), and Televerket (state telephone monopoly) — deliberately thin, reflecting how much of the Swedish economy (SKF, Volvo, LM Ericsson) stayed private under the 1953 Saltsjöbaden model.",
    headquartersState: "SE_STH",
    sectors: [
      { type: "logistics", marketShare: 0.7 }, // SJ state railways
      { type: "energy", marketShare: 0.55 }, // Vattenfall state hydro
      { type: "telecommunications", marketShare: 0.85 }, // Televerket state telephone monopoly
    ],
  },
  // Turkey — Kemalist statism's Iktisadi Devlet Teşekkülleri (State Economic
  // Enterprises): Sümerbank (textiles/manufacturing, 1933), Etibank (mining,
  // 1935), TCDD (state railways, 1927 nationalization of foreign concessions),
  // MKE (Makina ve Kimya Endüstrisi, state arms/machinery monopoly, 1950).
  {
    countryId: "TR",
    oid: "7000000000000000000000e1",
    ceoOid: "7000000000000000000000e2",
    userOid: "7000000000000000000000e3",
    sequentialId: 900_015,
    name: "İktisadi Devlet Teşekkülleri Holding",
    description:
      "Kemalist state-industry holding: Sümerbank (textiles/manufacturing, 1933), Etibank (state mining, 1935), TCDD (state railways, nationalized from foreign concessions in 1927), and MKE (Makina ve Kimya Endüstrisi, state arms/machinery monopoly, 1950).",
    headquartersState: "TR_ANK",
    sectors: [
      { type: "manufacturing", marketShare: 0.35 }, // Sümerbank textiles/manufacturing combine
      { type: "extraction", marketShare: 0.5 }, // Etibank state mining
      { type: "logistics", marketShare: 0.75 }, // TCDD full rail monopoly
      { type: "defense", marketShare: 0.9 }, // MKE state arms/machinery monopoly
    ],
  },
  // Greece — smaller state sector than the above, rebuilding after the civil
  // war on American aid: DEI (Dimosia Epicheirisi Ilektrismou, Public Power
  // Corporation, founded 1950) and SEK (state railways); the National Bank of
  // Greece carried large state-linked postwar reconstruction stakes.
  {
    countryId: "GR",
    oid: "700000000000000000000101",
    ceoOid: "700000000000000000000102",
    userOid: "700000000000000000000103",
    sequentialId: 900_016,
    name: "DEI-SEK Dimosies Epicheiriseis",
    description:
      "Greek state-enterprise holding: DEI (Dimosia Epicheirisi Ilektrismou, the Public Power Corporation founded 1950) and SEK (state railways), with a minority state-linked stake in postwar reconstruction banking (National Bank of Greece).",
    headquartersState: "GR_ATT",
    sectors: [
      { type: "energy", marketShare: 0.8 }, // DEI public power monopoly
      { type: "logistics", marketShare: 0.6 }, // SEK state railways
      { type: "financial", marketShare: 0.3 }, // National Bank of Greece postwar state-linked stake
    ],
  },
  // Austria — arguably the most state-heavy of the eight: the 1946/47
  // Verstaatlichungsgesetze (nationalization laws) put ~70% of heavy industry
  // and every major bank under state ownership. VÖEST (steel, incl. Alpine
  // Montan iron ore), the Verbundgesellschaft (national grid, 1947), and the
  // nationalized Creditanstalt-Bankverein / Österreichische Länderbank.
  {
    countryId: "AT",
    oid: "700000000000000000000111",
    ceoOid: "700000000000000000000112",
    userOid: "700000000000000000000113",
    sequentialId: 900_017,
    name: "VÖEST-Verbund Verstaatlichte Industrie",
    description:
      "Austria's 1946/47 Verstaatlichungsgesetze (nationalization laws) holding: VÖEST (steel, including the Alpine Montan iron-ore mines), the Verbundgesellschaft (national electricity grid, founded 1947), and the nationalized Creditanstalt-Bankverein / Österreichische Länderbank.",
    headquartersState: "AT_VIE",
    sectors: [
      { type: "manufacturing", marketShare: 0.45 }, // VÖEST steelworks
      { type: "energy", marketShare: 0.7 }, // Verbundgesellschaft national grid
      { type: "financial", marketShare: 0.5 }, // nationalized Creditanstalt-Bankverein + Länderbank
      { type: "extraction", marketShare: 0.4 }, // Alpine Montan nationalized iron ore
    ],
  },
  // Finland — VR (Valtionrautatiet, state railways), Neste (state oil
  // refiner, founded 1948), Outokumpu (state mining/metallurgy company), and
  // Enso-Gutzeit (state forestry/pulp conglomerate) — the postwar reparations
  // industrial base the 1944-52 Soviet war-reparations deliveries built out.
  {
    countryId: "FI",
    oid: "700000000000000000000121",
    ceoOid: "700000000000000000000122",
    userOid: "700000000000000000000123",
    sequentialId: 900_018,
    name: "Neste-Outokumpu Valtionyhtiöt",
    description:
      "Finnish state-enterprise holding: VR (Valtionrautatiet, state railways), Neste (state oil refiner, founded 1948), Outokumpu (state mining/metallurgy company), and Enso-Gutzeit (state forestry/pulp conglomerate) — the industrial base the 1944-52 Soviet war-reparations deliveries built out.",
    headquartersState: "FI_UUS",
    sectors: [
      { type: "logistics", marketShare: 0.7 }, // VR state railways
      { type: "energy", marketShare: 0.6 }, // Neste state oil refining
      { type: "extraction", marketShare: 0.35 }, // Outokumpu state mining/metallurgy
      { type: "manufacturing", marketShare: 0.3 }, // Enso-Gutzeit state forestry/pulp
    ],
  },
];

/**
 * Dormant market-state-enterprise spec for Spain (ES), left out of
 * {@link MARKET_STATE_ENTERPRISE_SPECS}. Spain is sphere-macro for
 * 1953-default (Franco never holds a legislative election in that preset).
 * Sphere-macro entities must seed ZERO corporations, so a real INI
 * state-holding corp would contradict Spain's classification. Kept as
 * inert reference for a possible future Tier-2 migration.
 */
export const DORMANT_MARKET_STATE_ENTERPRISE_SPECS: MarketStateEnterpriseSpec[] = [
  // Spain — INI (Instituto Nacional de Industria, 1941), Franco's autarky-era
  // state-industry vehicle: ENSIDESA (steel, 1950), ENDESA (electricity,
  // 1944), SEAT (the sole mass car maker, 1950, autarky import ban leaves it
  // with near-total domestic share), RENFE (rail, nationalized 1941).
  {
    countryId: "ES",
    oid: "7000000000000000000000c1",
    ceoOid: "7000000000000000000000c2",
    userOid: "7000000000000000000000c3",
    sequentialId: 900_013,
    name: "Instituto Nacional de Industria",
    description:
      "INI (Instituto Nacional de Industria, 1941), Franco-era autarky's state-industry vehicle: ENSIDESA (steel, 1950), ENDESA (electricity, 1944), SEAT (the sole domestic mass car maker, founded under INI in 1950), and RENFE (railways, nationalized 1941).",
    headquartersState: "ES_MAD",
    sectors: [
      { type: "manufacturing", marketShare: 0.45 }, // ENSIDESA integrated steelworks
      { type: "energy", marketShare: 0.5 }, // ENDESA state electricity
      { type: "manufacturing_vehicles", marketShare: 0.7 }, // SEAT: near-monopoly under autarky import bans
      { type: "logistics", marketShare: 0.8 }, // RENFE: full rail monopoly
    ],
  },
];

export function generateCountryOwnedSeedData(
  states: StateBudgetSeedInput[],
  preset: string,
  commandEconomyEnabled: boolean = false,
  log?: (message: string) => void
): CountryOwnedSeedData[] {
  const now = new Date();
  const data: CountryOwnedSeedData[] = [
    {
      corporation: {
        _id: US_PUBLIC_CORPORATION_ID,
        sequentialId: US_PUBLIC_CORPORATION_SEQUENTIAL_ID,
        name: "United States",
        description:
          "Country-owned public corporation used as the sovereign issuer identity for U.S. debt.",
        type: "financial",
        countryId: "US",
        ceoId: US_PUBLIC_PLACEHOLDER_CHARACTER_ID,
        userId: US_PUBLIC_PLACEHOLDER_USER_ID,
        headquartersState: "DC",
        liquidCapital: 0,
        liquidCurrencyCode: COUNTRY_CURRENCY_MAP.US as ActiveCurrencyCode,
        marketingBudget: 0,
        marketingStrength: 0,
        logisticsBudget: 0,
        logisticsStrength: 0,
        ceoSalary: 0,
        totalShares: 0,
        sharePrice: 1,
        shareholders: [],
        publicFloat: 0,
        ceoVacant: true,
        countryOwnerId: "US",
        hiddenFromExchange: false,
        isNationalized: false,
        isPrivate: false,
        isPrimaryNationalCorporation: true,
        legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE.US,
        createdAt: now,
        updatedAt: now,
      },
      sectors: [],
    },
  ];

  const ukStates = states.filter(
    (state) => countryHasFeature("ukSeeds", state.countryId) && state.gdp > 0
  );

  const healthcareIncomeTarget = initialUkBudget.revenue.healthcareIncome;
  if (ukStates.length === 0 || healthcareIncomeTarget <= 0) {
    // No UK states — skip UK corp but still create JP corp below
  } else {
    // Size sectors from the market so market-share percentages stay sane.
    // NHS captures ~80 % of the UK healthcare market in game-unit terms.
    const NHS_MARKET_SHARE = 0.8;
    const totalUkGdp = ukStates.reduce((sum, state) => sum + state.gdp, 0);
    const totalHealthcareMarket = (totalUkGdp * SECTOR_MARKET_GDP_FRACTION) / SECTOR_TYPE_COUNT;
    const requiredRevenue = Math.round(totalHealthcareMarket * NHS_MARKET_SHARE);

    // Derive the multiplier that bridges game-scale operating income → real budget revenue.
    const effectiveMargin = 0.2; // 35% base margin – 15% nationalized penalty
    const operatingIncome = requiredRevenue * effectiveMargin;
    const budgetRevenueMultiplier =
      operatingIncome > 0 ? Math.round(healthcareIncomeTarget / operatingIncome) : 10;

    const corporation: CountryOwnedSeedData["corporation"] = {
      _id: UK_PUBLIC_CORPORATION_ID,
      sequentialId: UK_PUBLIC_CORPORATION_SEQUENTIAL_ID,
      name: "United Kingdom",
      description:
        "Country-owned public corporation used for nationalized healthcare operations and sovereign issuance.",
      type: "healthcare",
      countryId: "UK",
      ceoId: UK_PUBLIC_PLACEHOLDER_CHARACTER_ID,
      userId: UK_PUBLIC_PLACEHOLDER_USER_ID,
      headquartersState: "LON",
      liquidCapital: Math.round(operatingIncome),
      liquidCurrencyCode: COUNTRY_CURRENCY_MAP.UK as ActiveCurrencyCode,
      marketingBudget: 0,
      marketingStrength: 0,
      logisticsBudget: 0,
      logisticsStrength: 0,
      ceoSalary: 0,
      totalShares: 0,
      sharePrice: 1,
      shareholders: [],
      publicFloat: 0,
      ceoVacant: true,
      countryOwnerId: "UK",
      hiddenFromExchange: false,
      budgetRevenueKey: "healthcareIncome",
      budgetRevenueMultiplier,
      isNationalized: true,
      isPrivate: false,
      isPrimaryNationalCorporation: true,
      legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE.UK,
      createdAt: now,
      updatedAt: now,
    };

    const sectors = ukStates.map((state) => {
      const revenueShare = state.gdp / totalUkGdp;
      const sectorRevenue = Math.round(requiredRevenue * revenueShare);

      return {
        _id: new ObjectId(),
        corporationId: UK_PUBLIC_CORPORATION_ID,
        countryId: "UK" as const,
        stateId: state.id,
        sectorType: "healthcare" as const,
        targetGrowthRate: 0,
        currentGrowthRate: 0,
        currentGrowthCost: 0,
        revenue: sectorRevenue,
        profitMargin: 35,
        workers: Math.max(100, Math.round(sectorRevenue / 2_000)),
        createdAt: now,
        updatedAt: now,
      };
    });

    data.push({ corporation, sectors });
  } // end UK corp block

  // ── JP sovereign issuer ─────────────────────────────────────────────────
  data.push({
    corporation: {
      _id: JP_PUBLIC_CORPORATION_ID,
      sequentialId: JP_PUBLIC_CORPORATION_SEQUENTIAL_ID,
      name: "Japan",
      description: "Country-owned sovereign issuer identity for Japanese government debt.",
      type: "financial",
      countryId: "JP",
      ceoId: JP_PUBLIC_PLACEHOLDER_CHARACTER_ID,
      userId: JP_PUBLIC_PLACEHOLDER_USER_ID,
      headquartersState: "KAN",
      liquidCapital: 0,
      liquidCurrencyCode: COUNTRY_CURRENCY_MAP.JP as ActiveCurrencyCode,
      marketingBudget: 0,
      marketingStrength: 0,
      logisticsBudget: 0,
      logisticsStrength: 0,
      ceoSalary: 0,
      totalShares: 0,
      sharePrice: 1,
      shareholders: [],
      publicFloat: 0,
      ceoVacant: true,
      countryOwnerId: "JP",
      hiddenFromExchange: false,
      isNationalized: false,
      isPrivate: false,
      isPrimaryNationalCorporation: true,
      legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE.JP,
      createdAt: now,
      updatedAt: now,
    },
    sectors: [],
  });

  // ── USSR (RU) state enterprise — the command economy's producing base ───
  // Unlike the market economies (whose producing sectors come from player
  // corporations), the USSR has no players, so without state-owned sectors it
  // is an economic ghost. Seed the RU National Corporation to OWN producing
  // sectors across the commanding heights in every Soviet region, so RU
  // generates commodity supply each turn. Sector revenue is stored in the
  // corp's LOCAL currency (SUR): computeUnownedSeedRevenue returns the
  // canonical market size in ₳, divided back to SUR via the RU exchange rate
  // (corporateSectors.revenue is liquidCurrencyCode-denominated — matching the
  // UK/CN NatCorp convention and what commodityPriceTurn expects).
  const ruStates = states.filter(
    (state) => countryHasFeature("ruSeeds", state.countryId) && state.gdp > 0
  );
  if (ruStates.length > 0 && preset !== "2019-default") {
    // Preset-aware: the ₳→SUR rate is era-specific (1953 = 9 SUR/USD, the
    // Western GNP-estimate basis ruRegions1953 is calibrated on; the base
    // config carries the 1979 administered rate). Reading it era-blind divided
    // 1953 ₳ market sizes by the 1979 rate — the same denominator the
    // `revenueAtlantic` numerator no longer uses, so the two stopped cancelling.
    const ruUsdRate = getCountryConfig("RU", preset).usdExchangeRate || 1;

    // Plan growth target for the Soviet SOEs, from the era monetary baseline
    // (RU 1953 → 6.0). Falls back to the private-firm seed rate so a preset with
    // no authored trend still expands rather than freezing.
    const ruPresetYear = parseInt(preset.slice(0, 4), 10);
    const ruPlanGrowthRate =
      getEraTrendGdpGrowth("RU", Number.isFinite(ruPresetYear) ? ruPresetYear : null) ?? 3;

    // Build one owned producing sector for (state, sectorType) under `corpId`.
    const buildRuSector = (
      state: StateBudgetSeedInput,
      sectorType: CorporationType,
      corpId: ObjectId
    ) => {
      const revenueAtlantic = computeUnownedSeedRevenue({
        gdp: state.gdp,
        countryId: "RU",
        stateId: state.id,
        sectorType,
        preset,
      });
      // ₳ → SUR so the value matches the corp's SUR liquidCurrencyCode.
      const revenue = Math.round(revenueAtlantic / ruUsdRate);
      return {
        _id: new ObjectId(),
        corporationId: corpId,
        countryId: "RU" as const,
        stateId: state.id,
        sectorType,
        // Plan growth. A market economy's SOEs can sit at zero because private
        // NPP-founded firms (spawnNppCorporation seeds targetGrowthRate 3) carry
        // expansion. In a COMMAND economy every producing sector is an SOE, so a
        // zero target froze the whole economy: RU ran 136/136 sectors at 0.00%
        // and its corporate revenue was byte-identical for the entire run
        // ($566.31M across 24 turns) while the US/DE/JP grew 2.6-4.0%. The USSR's
        // own 1953 baseline authors trendGdpGrowth 6.0, so the planner targets
        // that instead of standing still.
        targetGrowthRate: ruPlanGrowthRate,
        currentGrowthRate: ruPlanGrowthRate,
        currentGrowthCost: 0,
        revenue,
        // Soft-budget state enterprises run thin margins vs private firms.
        profitMargin: 12,
        workers: Math.max(100, Math.round(revenue / 2_000)),
        createdAt: now,
        updatedAt: now,
      };
    };

    // The primary National Corp — always the USSR sovereign-bond issuer.
    const ruPrimaryCorp: CountryOwnedSeedData["corporation"] = {
      _id: RU_PUBLIC_CORPORATION_ID,
      sequentialId: RU_PUBLIC_CORPORATION_SEQUENTIAL_ID,
      name: "Soviet Union",
      description:
        "State enterprise operating the commanding heights of the Soviet planned economy (also the sovereign issuer identity for USSR debt).",
      type: "manufacturing",
      countryId: "RU",
      ceoId: RU_PUBLIC_PLACEHOLDER_CHARACTER_ID,
      userId: RU_PUBLIC_PLACEHOLDER_USER_ID,
      headquartersState: "CEN", // Central Russia (Moscow)
      liquidCapital: 0,
      liquidCurrencyCode: COUNTRY_CURRENCY_MAP.RU as ActiveCurrencyCode,
      marketingBudget: 0,
      marketingStrength: 0,
      logisticsBudget: 0,
      logisticsStrength: 0,
      ceoSalary: 0,
      totalShares: 0,
      sharePrice: 1,
      shareholders: [],
      publicFloat: 0,
      ceoVacant: true,
      countryOwnerId: "RU",
      hiddenFromExchange: false,
      isNationalized: false,
      isPrivate: false,
      isPrimaryNationalCorporation: true,
      legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE.RU,
      createdAt: now,
      updatedAt: now,
    };

    // Command Economy v2 (P0): when the flag is on, split the single National
    // Corp into ONE state-owned enterprise per commanding-height sector (each
    // carrying the SoeState overlay + owning its sector across every region);
    // the primary corp stays the bare sovereign issuer. Flag off → the legacy
    // single-corp-owns-everything shape, byte-identical.
    const soeSectors = commandEconomySoeSectors("RU");
    const useMultiSoe = commandEconomyEnabled && soeSectors.length > 0;

    if (!useMultiSoe) {
      const ruSectors = ruStates.flatMap((state) =>
        RU_COMMANDING_HEIGHTS.map((sectorType) =>
          buildRuSector(state, sectorType, RU_PUBLIC_CORPORATION_ID)
        )
      );
      data.push({ corporation: ruPrimaryCorp, sectors: ruSectors });
    } else {
      // Primary corp = sovereign issuer only (producing sectors move to SOEs).
      data.push({ corporation: ruPrimaryCorp, sectors: [] });
      // One SOE per commanding-height sector (shared with CN's command-era split).
      data.push(
        ...buildCommandSoeCorpEntries({
          countryId: "RU",
          states: ruStates,
          preset,
          now,
          namePrefix: "Soviet",
          polityDescriptor: "Soviet planned economy",
          headquartersState: "CEN",
          currencyCode: COUNTRY_CURRENCY_MAP.RU as ActiveCurrencyCode,
          legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE.RU,
          log,
        })
      );
    }
  }

  // ── DE / IE / BR / CN sovereign issuers ────────────────────────────────
  // Each country's bond/sovereign-default code expects a country-owned corp
  // to reference. Without these the budget seeders for DE/IE/BR/CN are
  // missing the matching issuer identity, so sovereign-default scenarios
  // crash trying to look up imfSovereignFacilityImfCorporationId pointer
  // targets. Seeded with the same minimal "financial" shape as JP.
  const sovereignIssuerSpec: Array<{
    countryId: CountryId;
    oid: string;
    ceoOid: string;
    userOid: string;
    sequentialId: number;
    name: string;
    headquartersState: string;
  }> = [
    ...(preset === "2019-default"
      ? [
          {
            countryId: "RU" as const,
            oid: RU_PUBLIC_CORPORATION_ID.toHexString(),
            ceoOid: RU_PUBLIC_PLACEHOLDER_CHARACTER_ID.toHexString(),
            userOid: RU_PUBLIC_PLACEHOLDER_USER_ID.toHexString(),
            sequentialId: RU_PUBLIC_CORPORATION_SEQUENTIAL_ID,
            name: "Russian Federation",
            headquartersState: "CEN",
          },
        ]
      : []),
    ...(preset === "2019-default"
      ? (
          [
            ["PL", "Poland", "PL_MAZ"],
            ["HU", "Hungary", "HU_BUD"],
            ["RO", "Romania", "RO_BUC"],
            ["BG", "Bulgaria", "BG_SOF"],
          ] as const
        ).map(([countryId, name, headquartersState], index) => ({
          countryId,
          oid: `00000000000000000000b${(index * 3 + 1).toString(16).padStart(3, "0")}`,
          ceoOid: `00000000000000000000b${(index * 3 + 2).toString(16).padStart(3, "0")}`,
          userOid: `00000000000000000000b${(index * 3 + 3).toString(16).padStart(3, "0")}`,
          sequentialId: 900_028 + index,
          name,
          headquartersState,
        }))
      : []),
    {
      countryId: "DE",
      oid: DE_PUBLIC_CORPORATION_OID,
      ceoOid: DE_PUBLIC_CEO_OID,
      userOid: DE_PUBLIC_USER_OID,
      sequentialId: DE_PUBLIC_SEQUENTIAL_ID,
      name: "Germany",
      headquartersState: "BE",
    },
    {
      countryId: "IE",
      oid: IE_PUBLIC_CORPORATION_OID,
      ceoOid: IE_PUBLIC_CEO_OID,
      userOid: IE_PUBLIC_USER_OID,
      sequentialId: IE_PUBLIC_SEQUENTIAL_ID,
      name: "Ireland",
      headquartersState: "D",
    },
    {
      countryId: "BR",
      oid: BR_PUBLIC_CORPORATION_OID,
      ceoOid: BR_PUBLIC_CEO_OID,
      userOid: BR_PUBLIC_USER_OID,
      sequentialId: BR_PUBLIC_SEQUENTIAL_ID,
      name: "Brazil",
      headquartersState: "DF",
    },
    {
      countryId: "CN",
      oid: CN_PUBLIC_CORPORATION_OID,
      ceoOid: CN_PUBLIC_CEO_OID,
      userOid: CN_PUBLIC_USER_OID,
      sequentialId: CN_PUBLIC_SEQUENTIAL_ID,
      name: "China",
      headquartersState: "BJ",
    },
    {
      countryId: "NG",
      oid: NG_PUBLIC_CORPORATION_OID,
      ceoOid: NG_PUBLIC_CEO_OID,
      userOid: NG_PUBLIC_USER_OID,
      sequentialId: NG_PUBLIC_SEQUENTIAL_ID,
      name: "Nigeria",
      headquartersState: "NORTH_CENTRAL", // FCT Abuja falls within the North-Central zone
    },
    ...(
      [
        ["FR", "France", "IDF"],
        ["IT", "Italy", "IT_CEN"],
        ["ES", "Spain", "ES_CEN"],
        ["SE", "Sweden", "SE_STO"],
        ["TR", "Turkey", "TR_ANK"],
        ["GR", "Greece", "GR_ATT"],
        ["AT", "Austria", "AT_VIE"],
        ["FI", "Finland", "FI_UUS"],
        ...(preset === "2027-default" ? ([["BG", "Bulgaria", "BG_SOF"]] as const) : []),
      ] as const
    ).map(([countryId, name, headquartersState], index) => ({
      countryId,
      // Reserved deterministic IDs keep sovereign bond references stable while
      // avoiding a separate constants module for otherwise identical issuers.
      oid: `00000000000000000000a${(index * 3 + 1).toString(16).padStart(3, "0")}`,
      ceoOid: `00000000000000000000a${(index * 3 + 2).toString(16).padStart(3, "0")}`,
      userOid: `00000000000000000000a${(index * 3 + 3).toString(16).padStart(3, "0")}`,
      // Own block (900_019-900_027), disjoint from the sovereign sequence
      // US 900_001 through DD 900_010 AND from the 1953 market state-enterprise
      // block 900_011-900_018, to keep the unique index valid.
      sequentialId: 900_019 + index,
      name,
      headquartersState,
    })),
    // Sovereign issuer ONLY — emitted with `sectors: []`. DD is a command
    // economy and has no private corporations by design; this exists so the
    // bond seeder has a real corporation to point its tranches at.
    {
      countryId: "DD",
      oid: DD_PUBLIC_CORPORATION_OID,
      ceoOid: DD_PUBLIC_CEO_OID,
      userOid: DD_PUBLIC_USER_OID,
      sequentialId: DD_PUBLIC_SEQUENTIAL_ID,
      name: "East Germany",
      headquartersState: "BEO",
    },
  ];

  for (const spec of sovereignIssuerSpec) {
    data.push({
      corporation: {
        _id: new ObjectId(spec.oid),
        sequentialId: spec.sequentialId,
        name: spec.name,
        description: `Country-owned sovereign issuer identity for ${spec.name} government debt.`,
        type: "financial",
        countryId: spec.countryId,
        ceoId: new ObjectId(spec.ceoOid),
        userId: new ObjectId(spec.userOid),
        headquartersState: spec.headquartersState,
        liquidCapital: 0,
        // Preset-aware: 2027 euro members seed as EUR (zero balance, so no
        // conversion needed — value conservation holds trivially). Every other
        // preset resolves through the era-blind map, unchanged.
        liquidCurrencyCode: getSeedCurrencyCode(spec.countryId, preset) as ActiveCurrencyCode,
        marketingBudget: 0,
        marketingStrength: 0,
        logisticsBudget: 0,
        logisticsStrength: 0,
        ceoSalary: 0,
        totalShares: 0,
        sharePrice: 1,
        shareholders: [],
        publicFloat: 0,
        ceoVacant: true,
        countryOwnerId: spec.countryId,
        hiddenFromExchange: false,
        isNationalized: false,
        isPrivate: false,
        isPrimaryNationalCorporation: true,
        legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE[spec.countryId],
        createdAt: now,
        updatedAt: now,
      },
      sectors: [],
    });
  }

  // ── CN command-era SOEs ──────────────────────────────────────────────────
  // Unlike RU, CN is playable with market-capable supply from player corps, so
  // CN gets the RU-style per-sector SOE split ONLY in its fully-command band
  // (scheduled marketization < COMMAND_CEILING). Dual-track and socialist-market
  // bands keep the bare sovereign issuer; supply comes from player/market corps.
  // SOEs are the non-primary producing arms with deterministic 0xB00-range ids
  // that never collide with the issuer or player-founded corporations. Only
  // OWNED sectors count as commodity supply, so this adds the SOE-performance
  // channel without double-counting the unowned market pool.
  const cnStates = states.filter(
    (state) => countryHasFeature("cnSeeds", state.countryId) && state.gdp > 0
  );
  if (commandEconomyEnabled && cnStates.length > 0 && commandEconomySoeSectors("CN").length > 0) {
    const cnSeedYear = getNationalBudgetSeedConfigsForPreset(preset).find((c) =>
      countryHasFeature("cnSeeds", c.countryId)
    )?.fiscalYear;
    const cnInCommandBand =
      cnSeedYear != null && scheduledMarketizationLevel("CN", cnSeedYear) < COMMAND_CEILING;
    if (cnInCommandBand) {
      data.push(
        ...buildCommandSoeCorpEntries({
          countryId: "CN",
          states: cnStates,
          preset,
          now,
          namePrefix: "Chinese",
          polityDescriptor: "Chinese planned economy",
          headquartersState: "BJ",
          currencyCode: COUNTRY_CURRENCY_MAP.CN as ActiveCurrencyCode,
          legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE.CN,
          defaultExtractionStrategyId: "coal_mining",
          extractionStrategyByState: {
            DB: "iron_mining",
            HB: "iron_mining",
            HZ: "iron_mining",
            XN: "iron_mining",
          },
          log,
        })
      );
    }
  }

  // ── Warsaw-Pact satellite SOEs ─────────────────────────────────────────
  // These command economies have no country-owned producing corps
  // otherwise: their output exists only as `unownedSectors`, so a player taking DD
  // inherited an economy with no enterprises to direct. Each gets the full
  // commanding-height SOE split only when the flag is on AND its era level is
  // fully command, so a future preset outside the command band does not sprout
  // a command SOE stack.
  const WARSAW_PACT_SOE_SPEC: Array<{
    countryId: CountryId;
    namePrefix: string;
    polityDescriptor: string;
    headquartersState: string;
  }> = [
    {
      countryId: "DD",
      namePrefix: "East German",
      polityDescriptor: "East German planned economy",
      headquartersState: "BEO", // East Berlin
    },
    {
      countryId: "PL",
      namePrefix: "Polish",
      polityDescriptor: "Polish planned economy",
      headquartersState: "PL_MAZ", // Warsaw / Mazowieckie
    },
    {
      countryId: "HU",
      namePrefix: "Hungarian",
      polityDescriptor: "Hungarian planned economy",
      headquartersState: "HU_BUD", // Budapest
    },
    {
      countryId: "CS",
      namePrefix: "Czechoslovak",
      polityDescriptor: "Czechoslovak planned economy",
      headquartersState: "CS_PRG", // Prague
    },
    {
      countryId: "BG",
      namePrefix: "Bulgarian",
      polityDescriptor: "Bulgarian planned economy",
      headquartersState: "BG_SOF", // Sofia
    },
    {
      countryId: "UKR",
      namePrefix: "Ukrainian",
      polityDescriptor: "Ukrainian planned economy",
      headquartersState: "UKR_KYI", // Kyiv
    },
    {
      countryId: "BLR",
      namePrefix: "Byelorussian",
      polityDescriptor: "Byelorussian planned economy",
      headquartersState: "BLR_MIN", // Minsk
    },
    {
      countryId: "BAL",
      namePrefix: "Baltic",
      polityDescriptor: "Baltic planned economy",
      headquartersState: "BAL_LVA", // Riga
    },
    {
      countryId: "RO",
      namePrefix: "Romanian",
      polityDescriptor: "Romanian planned economy",
      headquartersState: "RO_BUC", // Bucharest
    },
    // Yugoslavia is not a Warsaw-Pact member (see COMMAND_ECONOMY_SOE_SECTORS.YU
    // for the non-alignment note), but it shares this same command-economy
    // seed-gap: promoted to full-autonomous Tier-1 alongside PL/HU/CS/BG/RO
    // (seedManifest.ts) yet never given the matching SOE stack, so it sat at
    // zero corporateSectors rows while its five peers above all seeded fine.
    {
      countryId: "YU",
      namePrefix: "Yugoslav",
      polityDescriptor: "Yugoslav planned economy",
      headquartersState: "YU_SRB", // Belgrade / Serbia
    },
  ];

  if (commandEconomyEnabled) {
    for (const spec of WARSAW_PACT_SOE_SPEC) {
      const blocStates = states.filter(
        (state) => state.countryId === spec.countryId && state.gdp > 0
      );
      if (blocStates.length === 0 || commandEconomySoeSectors(spec.countryId).length === 0) {
        continue;
      }
      const blocSeedYear = getNationalBudgetSeedConfigsForPreset(preset).find(
        (c) => c.countryId === spec.countryId
      )?.fiscalYear;
      const blocInCommandBand =
        blocSeedYear != null &&
        scheduledMarketizationLevel(spec.countryId, blocSeedYear) < COMMAND_CEILING;
      if (!blocInCommandBand) continue;

      data.push(
        ...buildCommandSoeCorpEntries({
          countryId: spec.countryId,
          states: blocStates,
          preset,
          now,
          namePrefix: spec.namePrefix,
          polityDescriptor: spec.polityDescriptor,
          headquartersState: spec.headquartersState,
          currencyCode: COUNTRY_CURRENCY_MAP[spec.countryId] as ActiveCurrencyCode,
          legalStructure: SOVEREIGN_CORP_LEGAL_STRUCTURE[spec.countryId],
          log,
        })
      );
    }
  }

  // Market-economy state enterprises (FR/IT/ES/SE/TR/GR/AT/FI) — scoped to the
  // 1953 preset, the only era this corporate-sector seed-gap was audited
  // against (see MARKET_STATE_ENTERPRISE_SPECS' docstring for why later eras
  // are out of scope).
  if (preset === "1953-default") {
    for (const spec of MARKET_STATE_ENTERPRISE_SPECS) {
      data.push(...buildMarketStateEnterpriseCorpEntries({ spec, states, preset, now }));
    }
  }

  return data;
}

export function generateStateBudgets(
  states: StateBudgetSeedInput[],
  fiscalYear: number = 2020
): StateBudget[] {
  return states.map((state) => {
    // state.gdp is in millions (e.g. 3598500 = $3.6T). Convert to dollars
    // so all budget values (tax bases, revenue, spending) are in dollars,
    // consistent with the federal budget and the display formatters.
    const stateGdp = state.gdp * 1_000_000;
    // Tax bases derived from state GDP. Corporate profits split 75/25 domestic/foreign
    // at seed — the per-turn simulation rewrites both fields with actual corp income.
    const taxableIncome = stateGdp * 0.35; // 35% of GDP
    const taxableSales = stateGdp * 0.55; // 55% of GDP (consumer spending)
    const domesticCorporateProfits = stateGdp * 0.06; // 6% of GDP — domestic corps
    const foreignCorporateProfits = stateGdp * 0.02; // 2% of GDP — foreign corps
    const propertyValue = stateGdp * 3.0; // Property values ~3x GDP

    // Default tax rates — country-specific. Foreign rate mirrors domestic at seed (day-one
    // parity per migration spec); legislators can diverge them later via the foreign bills.
    const DEFAULT_RATES: Record<
      string,
      {
        incomeTax: number;
        salesTax: number;
        domesticCorporateTax: number;
        foreignCorporateTax: number;
        propertyTax: number;
      }
    > = {
      US: {
        incomeTax: 5,
        salesTax: 6,
        domesticCorporateTax: 6,
        foreignCorporateTax: 6,
        propertyTax: 1,
      },
      UK: {
        incomeTax: 0,
        salesTax: 0,
        domesticCorporateTax: 1,
        foreignCorporateTax: 1,
        propertyTax: 1.6,
      },
      JP: JP_DEFAULT_REGIONAL_TAX_RATES,
      DE: {
        incomeTax: 0,
        salesTax: 0,
        domesticCorporateTax: 1.5,
        foreignCorporateTax: 1.5,
        propertyTax: 1.2,
      },
      IE: {
        incomeTax: 0,
        salesTax: 0,
        domesticCorporateTax: 1.0, // low 12.5% corporate rate
        foreignCorporateTax: 1.0,
        propertyTax: 1.0,
      },
      BR: {
        incomeTax: 3,
        salesTax: 5,
        domesticCorporateTax: 2.5,
        foreignCorporateTax: 2.5,
        propertyTax: 1.0,
      },
      CN: {
        incomeTax: 2,
        salesTax: 4,
        domesticCorporateTax: 2.0,
        foreignCorporateTax: 1.5,
        propertyTax: 0.5,
      },
    };
    const ctry = state.countryId ?? "US";
    const rates = DEFAULT_RATES[ctry] ?? DEFAULT_RATES.US;

    // Central government grant multiplier — parliamentary systems use larger transfers
    const GRANT_MULTIPLIERS: Record<string, number> = {
      US: 0.012,
      UK: 0.022,
      JP: JP_GRANT_MULTIPLIER,
      DE: 0.02,
      IE: 0.022, // similar to UK — centralised parliamentary transfers
      BR: 0.015, // federal transfers to states
      CN: 0.025, // large central-government fiscal transfers
    };
    const grantRate = GRANT_MULTIPLIERS[ctry] ?? 0.012;

    // Calculate revenue from bases × rates
    const incomeTaxRevenue = taxableIncome * (rates.incomeTax / 100);
    const salesTaxRevenue = taxableSales * (rates.salesTax / 100);
    const domesticCorporateTaxRevenue =
      domesticCorporateProfits * (rates.domesticCorporateTax / 100);
    const foreignCorporateTaxRevenue = foreignCorporateProfits * (rates.foreignCorporateTax / 100);
    const propertyTaxRevenue = propertyValue * (rates.propertyTax / 100);
    const federalGrants = stateGdp * grantRate;

    const totalRevenue =
      incomeTaxRevenue +
      salesTaxRevenue +
      domesticCorporateTaxRevenue +
      foreignCorporateTaxRevenue +
      propertyTaxRevenue +
      federalGrants;

    return {
      _id: state.id,
      stateId: state.id,
      ...(state.countryId
        ? { countryId: state.countryId as import("@/lib/constants/countries").CountryId }
        : {}),
      fiscalYear,
      stateGdp: stateGdp,
      taxBases: {
        taxableIncome,
        taxableSales,
        domesticCorporateProfits,
        foreignCorporateProfits,
        propertyValue,
      },
      revenue: {
        incomeTax: incomeTaxRevenue,
        salesTax: salesTaxRevenue,
        domesticCorporateTax: domesticCorporateTaxRevenue,
        foreignCorporateTax: foreignCorporateTaxRevenue,
        propertyTax: propertyTaxRevenue,
        federalGrants: federalGrants,
        other: 0,
        total: totalRevenue,
      },
      taxRates: initializeCapitalGainsTaxRates(initializeIncomeTaxRates(rates)),
      incomeTaxShares: incomeBaseShares(DEFAULT_INCOME_POPULATION),
      incomeTaxBatchReceipt: null,
      spending: {
        byCategory: {
          education: totalRevenue * 0.35,
          healthcare: totalRevenue * 0.25,
          transportation: totalRevenue * 0.15,
          publicSafety: totalRevenue * 0.12,
          other: totalRevenue * 0.13,
        },
        total: totalRevenue,
      },
      balance: 0,
      surplus: 0,
      updatedAt: new Date(),
    };
  });
}

export const deStateBudgets = generateStateBudgets(deRegionalBudgetInputs);
export const ieStateBudgets = generateStateBudgets(ieRegionalBudgetInputs);
export const brStateBudgets = generateStateBudgets(brRegionalBudgetInputs);
export const cnStateBudgets = generateStateBudgets(cnRegionalBudgetInputs);
