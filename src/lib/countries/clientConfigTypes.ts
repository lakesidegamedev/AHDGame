import type {
  CountryId,
  CountryStatus,
  ElectionMethod,
  ElectionPosition,
  GovernmentType,
  OpsVoteMultipliers,
} from "@/lib/constants/countriesCore";
import type { CurrencyCode } from "@/lib/constants/currencies";

/**
 * Shapes of the per-country client files (`<cc>/data/clientConfig.json` and
 * `<cc>/data/officesClient.json`). Both are written by
 * `scripts/countries/gen-country-client-config.ts` from the full registry and
 * composed by `constants/countryClientConfig.ts` and
 * `constants/countryOfficesClient.ts`.
 */

/** One chamber as client components render it. */
export interface CountryClientChamberConfig {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  description?: string;
  elected?: boolean;
  regionElectedClasses?: boolean;
  regionalModel?: boolean;
}

/** The legislature block client components read. */
export interface CountryClientLegislatureConfig {
  name: string;
  path: string;
  bicameral: boolean;
  lowerChamber: CountryClientChamberConfig;
  upperChamber?: CountryClientChamberConfig;
}

/** One office type, reduced to the fields client components display. */
export interface CountryClientOfficeType {
  key: string;
  label: string;
  labelPlural: string;
  chamberKey?: string;
  isExecutive: boolean;
  isSubNational: boolean;
  isHeadOfState?: boolean;
}

/** The central-bank identity fields a client page shows. */
export interface CountryClientCentralBankConfig {
  name: string;
  abbreviation: string;
  heroImage?: string;
  heroAlt?: string;
  defaultPrimeRate: number;
  sharedBankId?: string;
  centralBankIntorgId?: string;
}

/** One country, reduced to the fields client modules read. */
export interface CountryClientConfig {
  id: CountryId;
  name: string;
  code: string;
  flagEmoji: string;
  status: CountryStatus;
  regionLabel: string;
  regionLabelPlural: string;
  executiveTitle: string;
  executiveRealmPhrase?: string;
  executiveLabel: string;
  executivePath: string;
  governmentType: GovernmentType;
  governmentTypeLabel: string;
  descriptor: string;
  heroImage?: string;
  overviewHeroImage?: string;
  overviewPath: string;
  mapPath: string;
  currencyCode: CurrencyCode;
  centralGovernmentLabel: string;
  exchangeName?: string;
  /** "market" = tradable bourse; "stateRegister" = command-economy enterprise register. */
  exchangeKind?: "market" | "stateRegister";
  financeMinisterCabinetId?: string;
  regionalBillAssentTitle?: string;
  rulingPartyId?: number;
  opsVoteMultipliers?: OpsVoteMultipliers;
  hasLeaderConfidenceModel?: boolean;
  majorPartyIds: string[];
  partyCreationNPPs: {
    statesRequired: number;
    lockHomeState: boolean;
    nppsPerState: number;
  };
  partyRoleLabels?: {
    chair?: string;
    viceChair?: string;
    treasurer?: string;
    committee?: string;
  };
  executiveTermLimit?: {
    officeKey: string;
    maxTermsPerCharacter: number;
    blocksRunningMateSelection: boolean;
  };
  legislature: CountryClientLegislatureConfig;
  /** Sub-national chambers ship without seat counts; no client reads them. */
  subNationalChamber?: Pick<
    CountryClientChamberConfig,
    "key" | "name" | "shortName" | "regionalModel"
  >;
  officeTypes: CountryClientOfficeType[];
  electionSystems: Partial<Record<ElectionPosition, ElectionMethod>>;
  lowerElectionSystem: { snapElectionsAllowed: boolean };
  upperElectionSystem?: { snapElectionsAllowed: boolean };
  centralBank: CountryClientCentralBankConfig;
  usdExchangeRate: number;
}

/** One country's `clientConfig.json`. `null` in an era override clears the base field. */
export interface CountryClientFile {
  config: CountryClientConfig;
  eraOverrides?: Record<string, Partial<CountryClientConfig>>;
  eraNames?: Record<string, string>;
  nationalAddressName?: string;
  regionalAssentOfficeKey?: string;
}

/** One chamber, as the office tables need it. */
export interface CountryOfficeChamberConfig {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  description?: string;
  elected?: boolean;
  regionElectedClasses?: boolean;
  regionalModel?: boolean;
}

/** The national chambers a country's offices sit in. */
export interface CountryOfficeLegislatureConfig {
  /** Chamber name for the whole legislature ("Congress", "Bundestag"). */
  name: string;
  lowerChamber: CountryOfficeChamberConfig;
  upperChamber?: CountryOfficeChamberConfig;
}

/** One office type an election can fill. */
export interface CountryOfficeTypeConfig {
  key: string;
  label: string;
  labelPlural: string;
  chamberKey?: string;
  isExecutive: boolean;
  isSubNational: boolean;
  isHeadOfState?: boolean;
}

/** Everything a country contributes to office resolution and the race filter. */
export interface CountryOfficeConfig {
  governmentType: GovernmentType;
  /** Singular label for the country's regions ("State", "Land"). */
  regionLabel: string;
  /** Era-neutral title of the office that signs or vetoes regional bills. */
  regionalBillAssentTitle?: string;
  legislature: CountryOfficeLegislatureConfig;
  subNationalChamber?: Pick<
    CountryOfficeChamberConfig,
    "key" | "name" | "shortName" | "regionalModel"
  >;
  officeTypes: CountryOfficeTypeConfig[];
  lowerElectionSystem: { snapElectionsAllowed: boolean };
  upperElectionSystem?: { snapElectionsAllowed: boolean };
}

/** One country's `officesClient.json`. */
export interface CountryOfficesFile {
  config: CountryOfficeConfig;
  eraOverrides?: Record<string, Partial<CountryOfficeConfig>>;
  regionalAssentOfficeKey?: string;
}
