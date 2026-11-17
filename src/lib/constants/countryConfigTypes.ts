import type { CorporationType } from "@/lib/constants/corporations";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { EraSeedModels } from "@/lib/constants/economicModels";
import {
  type CountryId,
  type CountryStatus,
  type ElectionMethod,
  type ElectionPosition,
  type GovernmentType,
  type OpsVoteMultipliers,
} from "@/lib/constants/countriesCore";

export interface ChamberConfig {
  /** Internal key used in APIs, URLs, and BillChamber values */
  key: string;
  /** Display name shown in UI */
  name: string;
  /** Short label for tabs/chips */
  shortName: string;
  /** Total number of seats */
  seats: number;
  /** Description shown to players */
  description: string;
  /** True for elected chambers (US Senate, JP Sangiin); false/omitted for appointed (CA Senate, DE Bundesrat, UK Lords) */
  elected?: boolean;
  /** An appointed upper chamber can still approve ordinary bills. */
  participatesInOrdinaryBills?: boolean;
  /**
   * True only for an upper chamber elected per-region in rotating classes
   * (US Senate: 2 per state across 3 classes, keyed by `SENATE_CLASSES`). Drives
   * the region seat appointer's "classed upper" group. JP Sangiin / BR Senate set
   * `staggeredClasses` on their election system but are NOT region-appointable here
   * and have no per-region class data, so they intentionally omit this flag.
   */
  regionElectedClasses?: boolean;
  /**
   * True when this sub-national tier uses the "regional" governance model:
   * player-facing copy says "Regional" (not "State") and the tier has a regional
   * budget / fiscal layer (regionalBudgets). UK/DE/JP/IE/CN set this; the US omits
   * it (US uses the "State" model with no regional budget). Only meaningful on
   * `subNationalChamber`.
   */
  regionalModel?: boolean;
}

export interface LegislatureConfig {
  /** Display name for the legislature as a whole (e.g. "Congress", "Parliament") */
  name: string;
  /** Upper chamber config — omitted for genuinely unicameral legislatures
   *  (Scotland's Holyrood, the Senedd). Consumers must tolerate `undefined`. */
  upperChamber?: ChamberConfig;
  /** Lower chamber config */
  lowerChamber: ChamberConfig;
  /** Nav link path (e.g. "/congress") */
  path: string;
  /**
   * True when both chambers participate in the player legislative loop
   * (bills require passage in both). False for systems where the upper
   * chamber is appointed / observer-only and doesn't vote on bills as
   * part of normal gameplay — UK Lords (appointed), DE Bundesrat
   * (delegated by Land governments). Used by bill UI to hide bicameral
   * tally tabs and second-chamber/executive-override sections.
   */
  bicameral: boolean;
}

/**
 * Configuration for one type of office within a country.
 * Drives action bonuses, party-strength weights, and achievement triggers.
 */
export interface OfficeTypeConfig {
  /** Matches Character.currentOffice.type and ElectedOfficial.officeType */
  key: string;
  /** Human-readable label (e.g. "Member of Parliament", "Senator") */
  label: string;
  /** Plural label for listings */
  labelPlural: string;
  /** Which chamber key this office maps to, if any */
  chamberKey?: string;
  /** True for President, Prime Minister, etc. */
  isExecutive: boolean;
  /**
   * True for the ceremonial head of state in non-monarchy systems
   * (e.g. CN President of the PRC = CCP chair, IE Uachtarán). Monarchies
   * (parliamentaryMonarchy) render their head of state via the imperial-character
   * system instead, so they do not set this.
   */
  isHeadOfState?: boolean;
  /** True for Governor, State Senator, devolved assembly members, etc. */
  isSubNational: boolean;
  /** Term length in years (undefined = no fixed term, e.g. PM in parliamentary system) */
  termYears?: number;
  /**
   * Extra actions granted per turn while holding this office.
   * Supplements GameConfig.officeActionBonus; the config value is the authoritative source
   * but this is used for display and validation.
   */
  actionBonus: number;
  /**
   * Multiplier applied to the turn vote pool to reflect incumbency / executive power.
   * Replaces the hardcoded PARTY_STRENGTH_BY_OFFICE map in electionEngine.ts.
   */
  partyStrengthWeight: number;
}

/**
 * Electoral system definition for one chamber.
 */
export interface ElectionSystemConfig {
  /** How many years between elections (undefined = variable, e.g. parliamentary dissolution) */
  termYears?: number;
  /** Whether all seats are up in each cycle or only a fraction */
  seatsContested: "all" | "partial";
  /** For staggered systems (US Senate): number of classes */
  staggeredClasses?: number;
  /** Whether each constituency elects exactly one winner */
  singleMemberConstituencies: boolean;
  /** UK: can elections be called early by the government */
  snapElectionsAllowed: boolean;
}

export interface CentralBankConfig {
  /** Full name (e.g. "Federal Reserve") */
  name: string;
  /** Short abbreviation (e.g. "Fed") */
  abbreviation: string;
  /** Title of the bank's leader (e.g. "Federal Reserve Chair") */
  chairTitle: string;
  /** Default prime rate when the bank document is first created */
  defaultPrimeRate: number;
  /** Hero image path for the central bank page */
  heroImage?: string;
  /** Alt text for the hero image */
  heroAlt?: string;
  /**
   * When set, multiple countries share one central bank document keyed by this
   * ID instead of countryId. Used for supranational institutions like the ECB,
   * where all Eurozone members share a single bank, prime rate, and chair.
   *
   * Example: all EU countries set `sharedBankId: "ECB"`. Queries resolve the
   * bank document as `{ _id: sharedBankId }` rather than `{ _id: countryId }`.
   */
  sharedBankId?: string;
  /**
   * When set, chair selection and nominations are governed by this international
   * organization rather than a single country executive.
   */
  centralBankIntorgId?: string;
}

export interface CountryConfig {
  id: CountryId;
  name: string;
  flagEmoji: string;
  /** ISO 3166-1 alpha-2 code */
  code: string;

  /** Economic-model identity a fresh game starts with (P7), per start-date era,
   *  before enough play has accrued to move the classification. */
  seedEconomicModel?: EraSeedModels;

  // ── Region terminology ─────────────────────────────────────────────────────
  /** What sub-national divisions are called (e.g. "State", "Nation", "Constituency") */
  regionLabel: string;
  /** Plural form of regionLabel */
  regionLabelPlural: string;

  // ── Executive ──────────────────────────────────────────────────────────────
  /** Title of head of government (e.g. "President", "Prime Minister") */
  executiveTitle: string;
  /**
   * Title of head of state (may differ from executive, e.g. "Monarch").
   * Optional — when unset, {@link getHeadOfStateTitle} returns a
   * governmentType-derived default ("President" for presidential /
   * parliamentaryRepublic / onePartyState, "Monarch" for
   * parliamentaryMonarchy). Set explicitly only when a country uses a
   * culturally-specific term (e.g. JP "Emperor").
   */
  headOfStateTitle?: string;
  /**
   * Optional phrase for titles like "President of …" / "Prime Minister of …".
   * When set (e.g. "the United States"), overrides {@link name} for that wording.
   */
  executiveRealmPhrase?: string;
  /**
   * "presidential": executive directly elected; term is fixed.
   * "parliamentaryMonarchy": parliamentary system under a constitutional
   *   monarch (UK, JP). Executive emerges from legislative majority; head of
   *   state is a ceremonial monarch.
   * "parliamentaryRepublic": parliamentary system with a ceremonial president
   *   (DE, IE). Executive emerges from legislative majority; head of state is
   *   a non-executive president.
   * "onePartyState": single dominant party; executive emerges from internal
   *   party confidence. Mechanically follows the parliamentary code paths for
   *   now via {@link isParliamentarySystem}; will diverge as the one-party
   *   subsystem is fleshed out.
   */
  governmentType: GovernmentType;
  /**
   * Display label for the regime classification shown on the country overview
   * page (e.g. "Presidential Republic", "Constitutional Monarchy", "Parliamentary
   * Republic", "One Party State"). Distinct from {@link governmentType}, which
   * is a low-level gameplay enum driving executive/election mechanics.
   */
  governmentTypeLabel: string;
  /**
   * Optional country-specific tail appended to this country's Discord webhook
   * description in Admin Panel > System > Integrations. Carries only what
   * cannot be derived (shared central banks, unusual institutions). Omit when
   * the generated sentence is sufficient.
   */
  discordWebhookNote?: string;
  /**
   * Geographic granularity of campaign field offices. `"county"` pins each
   * office to a subdivision with its own committed geometry and lean (US
   * counties). Unset disables field offices. Field offices belong to Campaign
   * Manager, so only countries with a directly elected executive use it.
   * Rules per scope live in `src/lib/campaigns/fieldOffices/rules.ts`.
   */
  fieldOfficeScope?: "county";
  /**
   * Minimum seats for an outright majority in the lower chamber.
   * US House: 218. UK Commons: 326.
   * Used by the government formation resolver.
   */
  coalitionThreshold: number;
  /**
   * Whether the governing party can trigger a snap election mid-term.
   * Optional — when unset, falls back to the governmentType-derived default
   * returned by {@link supportsSnapElections} (parliamentary systems → `true`,
   * presidential / one-party → `false`). Set explicitly only when a country
   * needs to diverge from its regime-type default. Distinct from the
   * per-chamber {@link ElectionSystemConfig.snapElectionsAllowed} field, which
   * controls whether an individual chamber can be dissolved.
   */
  snapElectionsAllowed?: boolean;
  /**
   * Whether a vote of no confidence can collapse the government. Optional —
   * when unset, falls back to the governmentType-derived default returned by
   * {@link hasConfidenceVoteMechanism} (parliamentary systems → `true`,
   * presidential / one-party → `false`). Set explicitly only when a country
   * needs to diverge from its regime-type default.
   */
  confidenceVoteMechanism?: boolean;
  /**
   * Chamber keys whose seated members are eligible for direct cabinet
   * appointment in parliamentary-style systems. Optional — when unset,
   * {@link getCabinetEligibleChamberKeys} returns `[]` for presidential
   * countries (no parliamentary cabinet concept) and
   * `[legislature.lowerChamber.key]` for parliamentary-style countries.
   * Set explicitly only when a country diverges from the lower-chamber
   * default (e.g. JP includes both chambers).
   */
  cabinetEligibleChamberKeys?: string[];

  // ── Legislature ────────────────────────────────────────────────────────────
  legislature: LegislatureConfig;

  // ── Electoral systems ──────────────────────────────────────────────────────
  /** Electoral rules for the lower (elected) chamber */
  lowerElectionSystem: ElectionSystemConfig;
  /** Electoral rules for the upper chamber (may be "appointed" etc.) */
  upperElectionSystem?: ElectionSystemConfig;
  /**
   * Allocation/selection method per political position. Config holds the
   * DEFAULT; a future in-game layer may override per game. Positions a country
   * lacks are omitted. Single source of truth for "method" — read via
   * {@link ../elections/electionMethod getElectionMethod}.
   */
  electionSystems: Partial<Record<ElectionPosition, ElectionMethod>>;

  // ── Offices ────────────────────────────────────────────────────────────────
  /**
   * All office types that exist in this country.
   * Drives action bonuses, party-strength weights, and achievement triggers.
   * US: president, vicePresident, senate, house, governor, stateSenate.
   * UK: primeMinister, commons, regionalCouncil.
   */
  officeTypes: OfficeTypeConfig[];

  /**
   * Optional sub-national chamber for countries with elected regional bodies.
   * UK: Regional Councils elected within each nation/region.
   */
  subNationalChamber?: ChamberConfig;

  /**
   * Short UI title for the regional chief executive who assents to sub-national legislation.
   * When omitted, {@link getRegionalBillAssentTitle} uses the country's sub-national executive
   * office type (Governor, Premier, Minister-President, etc.).
   */
  regionalBillAssentTitle?: string;

  // ── Parties ────────────────────────────────────────────────────────────────
  /**
   * Party IDs considered "major" for FPTP spoiler modelling at the national level.
   * UK: overridden per-region (see getMajorPartiesForRegion).
   * US: ["democrat", "republican"]
   */
  majorPartyIds: string[];

  /**
   * Configuration for third party creation NPP spawning.
   * - statesRequired: number of regions the creator must select
   * - lockHomeState: whether the creator's home state is auto-included and locked
   * - nppsPerState: number of NPPs spawned per selected region
   *
   * US: 4 states + locked home = 5 states × 2 NPPs = 10 NPPs
   * UK: 2 regions (no locked home) × 1 NPP = 2 NPPs
   */
  partyCreationNPPs: {
    statesRequired: number;
    lockHomeState: boolean;
    nppsPerState: number;
  };

  /**
   * Optional per-country overrides for party leadership / committee labels.
   * Keys map to the generic NationalPosition labels plus the party committee
   * concept. Any key left undefined falls back to the default English label
   * (see getPartyRoleLabel). Used to localize e.g. the CCP's "Chair" →
   * "General Secretary" and "Committee" → "Secretariat" for CN only.
   */
  partyRoleLabels?: {
    chair?: string;
    viceChair?: string;
    treasurer?: string;
    committee?: string;
  };

  /**
   * Optional executive term-limit rule for this country.
   * Applies to the configured executive office holder, not to the player account.
   */
  executiveTermLimit?: {
    officeKey: string;
    maxTermsPerCharacter: number;
    blocksRunningMateSelection: boolean;
  };

  /**
   * Country has an internal-party leader confidence model (e.g. CN's CPC
   * confidence). When true, leader transitions write to countryLeaderStates
   * and the turn pipeline drives drift via processRulingPartyConfidenceTurn().
   */
  hasLeaderConfidenceModel?: boolean;

  /**
   * Seed baseline for the country's social-axis position (−5 libertarian …
   * +5 authoritarian; matches demographic socialLean and legislation-option
   * `social` scales). Copied onto CountryState at seed time; the runtime
   * value then drifts toward the social stance of enacted national laws
   * (socialAxisDrift turn phase). Omitted ⇒ 0 (mid). First-pass values from
   * the P6 design.
   */
  socialAxisBaseline?: number;

  /**
   * Seed-time pointer to the party that should be marked
   * `regimeStatus: "ruling"` when this country is first seeded. Only
   * meaningful when `governmentType === "onePartyState"`. Authoritative at
   * runtime is the `PoliticalParty.regimeStatus` field, not this pointer.
   *
   * Type matches `PoliticalParty.sequentialId` (number).
   */
  rulingPartyId?: number;

  /**
   * Public-mood axis weights driving the per-turn `popularLegitimacy`
   * drift. Only meaningful when `hasLeaderConfidenceModel === true` —
   * the per-turn driver short-circuits with `null` when this field is
   * absent. See `src/lib/constants/popularMoodProfiles.ts` for the
   * shape and CN seed value.
   */
  popularMoodProfile?: import("./popularMoodProfiles").PopularMoodAxisProfile;

  /**
   * Player-facing name for the spinoff party created when Stage 3
   * (internal challenge) fires the auto-faction-split. Only meaningful
   * for one-party-state countries; missing field → no faction split
   * fires (the regime still transitions to Stage 3, but only the
   * decision-event side runs without spawning a new party).
   *
   * Phase 4 only — the richer faction subsystem on
   * `feature/legislation-update-cn` will supersede this with per-axis
   * caucus structure later.
   */
  factionDefectionName?: string;

  /**
   * Ruling-party priority profile (9-axis ideology weights). Only meaningful
   * when `governmentType === "onePartyState"`. Drives per-turn confidence
   * drift in `processRulingPartyConfidenceTurn`. Use the shape from
   * `RulingPartyPriorityProfile` in `@/lib/turn/rulingPartyPriorities`.
   */
  priorityProfile?: import("@/lib/turn/rulingPartyPriorities").RulingPartyPriorityProfile;

  /**
   * Per-country policy-category → axis-effect map. Each enacted bill's
   * `category` is looked up here to derive axis deltas that fold into
   * ruling-party confidence drift. Only meaningful when
   * `governmentType === "onePartyState"`.
   */
  policyAxisEffects?: Record<
    string,
    Array<import("@/lib/turn/rulingPartyPriorities").PolicyAxisEffect>
  >;

  /**
   * Two-source regional-budget knobs for one-party states with a
   * CN-style "local tax retention + central transfer grant" model.
   * Read by `processCNRegionalBudgets` so a future second one-party
   * country with the same shape can populate this and pick up the
   * processor without code changes.
   */
  onePartyRegionalBudget?: {
    /** Share of the per-region tax that stays local (CN: 0.40 for EIT). */
    localTaxRetentionShare: number;
    /** Corporate profits as a fraction of regional GDP (CN: 0.06). */
    corporateProfitRatio: number;
    /** Default central transfer pool per capita (local currency / year). */
    centralTransferPerCapita: number;
    /** Fallback tax rate (%) when the primary tax has not been enacted. */
    defaultTaxRate: number;
    /** legislationTypeId of the primary regional tax (CN: cn.tax.domesticCorporateTax). */
    primaryTaxLegislationKey: string;
    /** Old-book primary tax a saved world may still have enacted (CN: cn_enterprise_income_tax). */
    savedWorldPrimaryTaxLegislationKey?: string;
    /**
     * legislationTypeId of an optional per-region resource tax. When set, the
     * processor reads each region's enacted policy rate and feeds it into the
     * resource-tax revenue stream (analogous to DE's Hebesatz/tradeTaxRevenue).
     * CN: cn_provincial_resource_tax. Omit on countries with no resource tax.
     */
    resourceTaxLegislationKey?: string;
    /**
     * Resource-extraction (mining, oil/gas, water, salt) as a fraction of
     * regional GDP. Used as the base for resource-tax revenue. Omit (or set
     * 0) when the country has no resource tax. CN: 0.03 nation-wide proxy.
     */
    resourceExtractionRatio?: number;
    /**
     * Consumption base as a fraction of regional GDP for the standing Business
     * Tax (营业税) — the dominant 1991 Chinese local tax. CN: 0.50 (derived from
     * the national sales-tax implied base). Omit when the country has no
     * standing regional consumption tax.
     */
    businessTaxConsumptionRatio?: number;
    /** Standing Business Tax rate (percent). CN: 24. Omit (or 0) for none. */
    businessTaxRate?: number;
  };

  /**
   * DE's federal fiscal-equalization pool (Länderfinanzausgleich /
   * Bundesergänzungszuweisungen) — the per-capita currency figure
   * `processDERegionalBudgets` (src/lib/turn/deRegionalBudget.ts) uses as the
   * default even split of the national grant pool when a Land has no explicit
   * Finance Minister allocation. Kept as its own top-level field (rather than
   * folded into `onePartyRegionalBudget`) because DE is not a one-party state
   * and that shape doesn't fit. Era-scaled via `ERA_COUNTRY_CONFIG_OVERRIDES`
   * the same way CN's `centralTransferPerCapita` is — see the 1953 entry.
   */
  federalEqualizationGrantPerCapita?: number;

  /**
   * Per-regime vote-weight multipliers for legislative general elections.
   * Only consulted when `governmentType === "onePartyState"`. Defaults to
   * `DEFAULT_OPS_VOTE_MULTIPLIERS` when absent.
   */
  opsVoteMultipliers?: OpsVoteMultipliers;

  /**
   * How a one-party state's ceremonial head of state is seated.
   * - "partyChairSync": auto-reconciled every turn to the ruling party's
   *   chairId (CN President — partyChairHeadOfState.ts).
   * - "legislatureAppointment": elected by the seated legislature through
   *   an appointment vote mirroring the PM flow (RU Chairman of the
   *   Presidium).
   * Only meaningful when `governmentType === "onePartyState"`. Omitted →
   * the country has no synced/appointed ceremonial head of state.
   */
  headOfStateSelection?: "partyChairSync" | "legislatureAppointment";

  // ── Phase-6 collapse / convention ────────────────────────────────────────
  /**
   * Default `governmentType` the country falls into when a Stage-4 forced
   * conversion fires without a convention's negotiated target. Only
   * meaningful on one-party-state countries.
   */
  collapseTargetSystem?: GovernmentType;

  /**
   * Government types the player is allowed to pick when drafting a
   * constitutional convention. Defaults to `[collapseTargetSystem]` when
   * omitted. Excludes `onePartyState` — conversion is one-way.
   */
  collapseTargetAllowlist?: GovernmentType[];

  /**
   * Legacy seat reservation (% of post-conversion legislature) granted to
   * the former ruling party on a voluntary convention path. Range 0..35.
   * The Stage-4 forced path always uses 5% regardless of this default
   * (and halves it to 3% when `stage4Delay.halveLegacyBonusIfStillBelow15`
   * was set by a "resist" decision).
   */
  legacyReservationDefault?: number;

  /**
   * Default delay (turns) between the convention's ratification phase
   * and the snap election. Convention draft can override per submission;
   * the runtime constraint is `{ 12, 24, 48 }`.
   */
  electionDelayDefault?: number;

  /**
   * Optional map-mode overlay this country exposes beyond the default
   * lean/approval layers. Currently "partyOrg" is the only value (CN's
   * per-region party organization heatmap).
   */
  mapOverlay?: "partyOrg";

  // ── Central Bank ──────────────────────────────────────────────────────────
  centralBank: CentralBankConfig;

  // ── Stock Exchange ─────────────────────────────────────────────────────────
  /** Display name of the country's stock exchange (e.g. "NYSE", "FTSE", "Nikkei") */
  exchangeName?: string;
  /**
   * What kind of listing venue `exchangeName` names. "market" (the default) is a
   * tradable stock exchange. "stateRegister" is a command economy's enterprise
   * register: state-owned enterprises are recorded there, but no shares change
   * hands. The distinction exists so planned economies get a listing venue of
   * their own instead of falling through to whichever exchange was the fallback.
   */
  exchangeKind?: "market" | "stateRegister";

  // ── Currency ───────────────────────────────────────────────────────────────
  /** Multiplier to convert GDP millions stored in local currency to USD millions.
   *  US/UK/CA/DE seed GDP in USD-equivalent so this is 1.0.
   *  JP seeds GDP in JPY millions — 2020 avg rate: 1 JPY = $0.00943 USD.
   */
  usdExchangeRate: number;
  /** ISO 4217 currency code for this country's home currency */
  currencyCode: CurrencyCode;

  /**
   * Turn in the 48-turn year when the next fiscal year begins.
   * This keeps fiscal-calendar rules config-driven instead of burying them in
   * budget or turn modules as more countries grow bespoke finance behavior.
   */
  fiscalYearStartTurnInYear: number;

  // ── Cabinet Bills ──────────────────────────────────────────────────────────
  /** Whether this country supports cabinet-origin bills (JP feature). Default false. */
  cabinetBillsEnabled?: boolean;

  // ── FX Intervention ────────────────────────────────────────────────────────
  /** Cabinet seat ID authorized to transfer funds from the federal budget to the
   *  central bank's FX reserve. Resolved against the country's cabinet registry.
   *  Leave unset to disable the FX Reserve Transfer action for that country. */
  financeMinisterCabinetId?: string;

  // ── UI / Navigation ────────────────────────────────────────────────────────
  status: CountryStatus;
  /** Short description shown on the world map */
  tagline: string;
  /**
   * One-sentence blurb displayed on the country overview page.
   * Should describe the political system concisely for new players.
   */
  descriptor: string;
  /** Path to a hero/banner image for the country card */
  heroImage?: string;
  /**
   * Optional wider hero for the country overview page only.
   * When set, `heroImage` is still used for world cards and the overview header flag thumbnail.
   */
  overviewHeroImage?: string;
  /** Route players navigate to when selecting this country (entry/play page) */
  entryPath: string;
  /** Route for the country overview page — defaults to entryPath if not set */
  overviewPath: string;
  /**
   * Path to the country's interactive map subpage.
   * US: "/country/us/map" (state-level approval heatmap)
   * UK: "/country/uk/map" (region clickthrough map)
   */
  mapPath: string;
  /**
   * Path to the country's executive/government page.
   * US: "/country/us/executive" (White House)
   * UK: "/country/uk/executive" (PM + Cabinet)
   */
  executivePath: string;
  /** Display name for the executive residence / seat of government (e.g. "White House", "10 Downing Street") */
  executiveLabel: string;
  /** Label for central government funding to regions (e.g. "Federal Grants", "Westminster Funding") */
  centralGovernmentLabel: string;

  // ── Imperial ──────────────────────────────────────────────────────────────
  /**
   * Whether this country has a ceremonial imperial head of state. Optional —
   * when unset, {@link isImperialCountry} returns the governmentType-derived
   * default: `true` for `parliamentaryMonarchy` (UK monarch, JP emperor),
   * `false` otherwise. Set explicitly to override (e.g. DE's
   * parliamentaryRepublic configures `true` for the ceremonial
   * Bundespräsident; IE leaves it unset so it inherits `false`).
   */
  hasImperialRole?: boolean;
  /** Gender-aware titles for the imperial head of state */
  imperialTitles?: {
    male: string;
    female: string;
    nonbinary: string;
  };
  /**
   * Gender-aware possessive prefix for government/cabinet labels.
   * UK: "His Majesty's" / "Her Majesty's" / "The Monarch's"
   * Only relevant for countries whose government labels include the head of state's style.
   */
  imperialPossessives?: {
    male: string;
    female: string;
    nonbinary: string;
  };
  /** Starter corporation config for imperial character creation */
  imperialCorporation?: {
    name: string;
    sector: CorporationType;
  };
  /**
   * If set, this country shares another country's imperial character
   * (e.g., CA shares UK's monarch). The value is the source CountryId.
   */
  imperialSharedWith?: CountryId;

  /**
   * When true, players in this country cannot found private corporations.
   * Used for command-economy states (USSR, East Germany) where private
   * enterprise is constitutionally prohibited. The server-side POST
   * /api/corporations guard rejects the request; the UI hides the
   * "Found Corp" button.
   */
}
