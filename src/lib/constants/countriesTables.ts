import type { CountryConfig } from "@/lib/constants/countryConfigTypes";
export type {
  ChamberConfig,
  LegislatureConfig,
  OfficeTypeConfig,
  ElectionSystemConfig,
  CentralBankConfig,
  CountryConfig,
} from "@/lib/constants/countryConfigTypes";

import { type CountryId } from "./countriesCore";
import { JP_IDENTITY } from "@/lib/countries/jp/identity";
import { JP_ERAS } from "@/lib/countries/jp/eras";
import { AT_ERAS } from "@/lib/countries/at/eras";
import { BAL_ERAS } from "@/lib/countries/bal/eras";
import { BG_ERAS } from "@/lib/countries/bg/eras";
import { BLR_ERAS } from "@/lib/countries/blr/eras";
import { BR_ERAS } from "@/lib/countries/br/eras";
import { CN_ERAS } from "@/lib/countries/cn/eras";
import { CS_ERAS } from "@/lib/countries/cs/eras";
import { DD_ERAS } from "@/lib/countries/dd/eras";
import { DE_ERAS } from "@/lib/countries/de/eras";
import { ES_ERAS } from "@/lib/countries/es/eras";
import { FI_ERAS } from "@/lib/countries/fi/eras";
import { FR_ERAS } from "@/lib/countries/fr/eras";
import { GR_ERAS } from "@/lib/countries/gr/eras";
import { HU_ERAS } from "@/lib/countries/hu/eras";
import { IE_ERAS } from "@/lib/countries/ie/eras";
import { IT_ERAS } from "@/lib/countries/it/eras";
import { NG_ERAS } from "@/lib/countries/ng/eras";
import { PL_ERAS } from "@/lib/countries/pl/eras";
import { RO_ERAS } from "@/lib/countries/ro/eras";
import { RU_ERAS } from "@/lib/countries/ru/eras";
import { SE_ERAS } from "@/lib/countries/se/eras";
import { TR_ERAS } from "@/lib/countries/tr/eras";
import { UKR_ERAS } from "@/lib/countries/ukr/eras";
import { UK_ERAS } from "@/lib/countries/uk/eras";
import { US_ERAS } from "@/lib/countries/us/eras";
import { YU_ERAS } from "@/lib/countries/yu/eras";
import {
  JP_CONFIG,
  JP_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/jp/institutionsFacts";
import {
  US_CONFIG,
  US_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/us/institutionsFacts";
import {
  UK_CONFIG,
  UK_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/uk/institutionsFacts";
import { US_IDENTITY } from "@/lib/countries/us/identity";
import { UK_IDENTITY } from "@/lib/countries/uk/identity";
import {
  DE_CONFIG,
  DE_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/de/institutionsFacts";
import { DE_IDENTITY } from "@/lib/countries/de/identity";
import { CN_CONFIG } from "@/lib/countries/cn/institutionsFacts";
import {
  IE_CONFIG,
  IE_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/ie/institutionsFacts";
import { IE_IDENTITY } from "@/lib/countries/ie/identity";
import {
  RU_CONFIG,
  RU_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/ru/institutionsFacts";
import {
  DD_CONFIG,
  DD_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/dd/institutionsFacts";
import { NG_CONFIG } from "@/lib/countries/ng/institutionsFacts";
import { BR_CONFIG } from "@/lib/countries/br/institutionsFacts";
import { FR_CONFIG } from "@/lib/countries/fr/institutionsFacts";
import { IT_CONFIG } from "@/lib/countries/it/institutionsFacts";
import { ES_CONFIG } from "@/lib/countries/es/institutionsFacts";
import { SE_CONFIG } from "@/lib/countries/se/institutionsFacts";
import { TR_CONFIG } from "@/lib/countries/tr/institutionsFacts";
import { GR_CONFIG } from "@/lib/countries/gr/institutionsFacts";
import { AT_CONFIG } from "@/lib/countries/at/institutionsFacts";
import { FI_CONFIG } from "@/lib/countries/fi/institutionsFacts";
import { PL_CONFIG } from "@/lib/countries/pl/institutionsFacts";
import { HU_CONFIG } from "@/lib/countries/hu/institutionsFacts";
import { RO_CONFIG } from "@/lib/countries/ro/institutionsFacts";
import { YU_CONFIG } from "@/lib/countries/yu/institutionsFacts";
import { BG_CONFIG } from "@/lib/countries/bg/institutionsFacts";
import { CS_CONFIG } from "@/lib/countries/cs/institutionsFacts";
import { SCO_CONFIG } from "@/lib/countries/sco/institutionsFacts";
import { WAL_CONFIG } from "@/lib/countries/wal/institutionsFacts";
import { BLR_CONFIG } from "@/lib/countries/blr/institutionsFacts";
import { UKR_CONFIG } from "@/lib/countries/ukr/institutionsFacts";
import { BAL_CONFIG } from "@/lib/countries/bal/institutionsFacts";

// Re-export the client-safe core so every existing import from this module works.
export * from "./countriesCore";
import {
  CA_CONFIG,
  CA_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "@/lib/countries/ca/institutionsFacts";
import { QC_CONFIG } from "@/lib/countries/qc/institutionsFacts";
import { AB_CONFIG } from "@/lib/countries/ab/institutionsFacts";
import { RTX_CONFIG } from "@/lib/countries/rtx/institutionsFacts";
import { NEN_CONFIG } from "@/lib/countries/nen/institutionsFacts";
import { RCA_CONFIG } from "@/lib/countries/rca/institutionsFacts";
import { CA_IDENTITY } from "@/lib/countries/ca/identity";

export const COUNTRY_CONFIGS: Record<CountryId, CountryConfig> = {
  US: US_CONFIG,

  UK: UK_CONFIG,
  DE: DE_CONFIG,
  JP: JP_CONFIG,

  IE: IE_CONFIG,

  // Latent secession country (Sub-project 1). Authored fully but `coming-soon`
  // and absent from COUNTRY_ORDER, so invisible until the secession actuation
  // (SP2) writes its countryGameStates row. Sterlingized (shares UK's GBP rate).
  SCO: SCO_CONFIG,

  // Latent secession country (Sub-project 1). See SCO above; sterlingized,
  // unicameral Senedd, coming-soon and absent from COUNTRY_ORDER until SP2.
  WAL: WAL_CONFIG,

  BR: BR_CONFIG,

  CN: CN_CONFIG,

  NG: NG_CONFIG,

  // ── Eastern Bloc (1979 iteration) — NPP-run one-party states ────────────────
  // Template for the Warsaw-Pact / socialist roster. `status: "coming-soon"`
  // until its seed stack lands; enablement (NPP-only, econ-locked) is set per
  // preset via countryGameStates. governmentType "onePartyState" drives the
  // parliamentary-style code paths + one-party constraints.
  HU: HU_CONFIG,

  // ── Poland (PZPR) ───────────────────────────────────────────────────────────
  PL: PL_CONFIG,

  // ── Romania (PCR) ───────────────────────────────────────────────────────────
  RO: RO_CONFIG,

  // ── Yugoslavia (SKJ) — non-aligned, battleground ────────────────────────────
  YU: YU_CONFIG,

  // ── Bulgaria (BKP) ──────────────────────────────────────────────────────────
  BG: BG_CONFIG,

  // ── Belarus (BSSR / CPSU) — Soviet ruble ────────────────────────────────────
  BLR: BLR_CONFIG,

  // ── Czechoslovakia (KSČ) ────────────────────────────────────────────────────
  CS: CS_CONFIG,

  // ── Ukraine (Ukrainian SSR, KPU) — Soviet ruble ─────────────────────────────
  UKR: UKR_CONFIG,

  // ── Baltics (combined EE+LV+LT, CPSU) — Soviet ruble ────────────────────────
  BAL: BAL_CONFIG,

  // ── Russia / USSR (RU) — ONE entity; displayed "Soviet Union" in 1979 and
  // "Russia" elsewhere (era name via ERA_COUNTRY_NAMES). Carries the USSR config
  // (one-party / Supreme Soviet / Gosbank / SUR / 17 macro-regions); modern
  // Russia's distinct politics (presidential / Federal Assembly / RUB) and an
  // era-aware flag are a deferred future build. Status stays coming-soon until the
  // seed stack lands; per-game countryGameStates enables it (the 1979 sandbox).
  // RU is already in FOREX_ACTIVE_COUNTRIES (currencies.ts) with SUR as its
  // forex-active currency; the remaining modern-Russia work is the RUB anchor.
  RU: RU_CONFIG,

  // ── France (Tier-2 Econ-enabled, NPP-run) — Fifth Republic default ─────────
  // Semi-presidential (1958–): a directly-elected President (the dominant
  // executive) plus a Prime Minister and a bicameral Parliament. This is the
  // era-neutral / 1979+ default. The 1953-default Fourth Republic overlay
  // (parliamentary republic, ceremonial President, Conseil de la République)
  // lives in {@link ERA_COUNTRY_CONFIG_OVERRIDES} and is applied via
  // {@link getCountryConfig}(id, preset). Status coming-soon until its seed
  // stack lands; economyPreview enablement set per preset via countryGameStates.
  FR: FR_CONFIG,

  // ── Italy (Tier-2 Econ-enabled, NPP-run) — First Republic, 1979 ─────────────
  // Parliamentary republic: a ceremonial President + a Prime Minister governing
  // through a powerful bicameral Parliament (the unstable DC-led coalition era,
  // PCI at its "historic compromise" peak). Status coming-soon until seeded.
  IT: IT_CONFIG,

  // ── Spain (Tier-2 Econ-enabled, NPP-run) — the young democracy, 1979 ────────
  // Parliamentary monarchy under the 1978 Constitution: King Juan Carlos as head
  // of state, a Prime Minister governing through the Cortes Generales, and the
  // autonomous communities just forming. Status coming-soon until seeded.
  ES: ES_CONFIG,

  // ── Sweden (Tier-2 Econ-enabled, NPP-run) — the Swedish model, 1979 ─────────
  // Constitutional monarchy with a unicameral Riksdag (349 seats since the 1970
  // reform). In 1979 a non-socialist coalition governs with the Social Democrats
  // the largest party in opposition. Status coming-soon until seeded.
  SE: SE_CONFIG,

  // ── Turkey (Tier-2 Econ-enabled, NPP-run) — fragile pre-coup republic, 1979 ─
  // Parliamentary republic: a ceremonial President + a Prime Minister governing
  // through a bicameral parliament, amid the unstable AP/CHP coalitions and street
  // violence of the late 1970s (a year before the September 1980 coup). Status
  // coming-soon until seeded.
  //
  // Era note: the 1961-constitution Senato below is correct for 1979-default.
  // 1953-default overrides to a unicameral TBMM via {@link ERA_COUNTRY_CONFIG_OVERRIDES}
  // (no Senate existed until after the 1960 coup).
  TR: TR_CONFIG,

  // ── Greece (econ-tier democracy; Third Hellenic Republic) — 1979 base ──────
  GR: GR_CONFIG,

  // ── Austria (econ-tier democracy; Second Republic) — 1979 base ─────────────
  AT: AT_CONFIG,

  FI: FI_CONFIG,

  // ── East Germany / GDR (NPP-run one-party state; two-state Germany) — 1979 ──
  // SED-led socialist republic with the National Front bloc parties and a planned
  // economy. Player-enabled only via the economy if it decommunises;
  // collapseTargetSystem routes a collapse toward reunification/democracy. Status
  // coming-soon until seeded.
  DD: DD_CONFIG,

  // Canada: Westminster federation, 2027 world only.
  CA: CA_CONFIG,
  // Latent successor: Quebec exists only after a sovereignty referendum carries.
  QC: QC_CONFIG,
  AB: AB_CONFIG,
  RTX: RTX_CONFIG,
  NEN: NEN_CONFIG,
  RCA: RCA_CONFIG,
};

/**
 * Every configured CountryId, including latent secession countries (SCO/WAL).
 * This is the VALIDATION universe — request schemas accept any structurally-valid
 * country id; whether a country is registered/playable is decided at runtime by the
 * access layer (`getEnabledCountryIds`) + `getRegisteredCountryIds`, NOT by the Zod
 * enum (which is built once at module load and cannot be runtime-aware).
 */
export const ALL_COUNTRY_IDS: readonly CountryId[] = Object.keys(COUNTRY_CONFIGS) as CountryId[];

/**
 * Tuple for Zod `z.enum()` validation — the full id universe (see ALL_COUNTRY_IDS).
 * Iteration / display / gating use `getRegisteredCountryIds` + the access layer, not this.
 */
export const ZOD_COUNTRY_ENUM = ALL_COUNTRY_IDS as unknown as [
  CountryId,
  CountryId,
  ...CountryId[],
];

/** Default `countryId` when legacy documents omit it (historically US-only Congress). */
export const DEFAULT_LEGACY_COUNTRY_ID = COUNTRY_CONFIGS.US.id;

/**
 * Institutional fields that may diverge by historical era for the same
 * CountryId (e.g. France's Fourth → Fifth Republic, Turkey's unicameral
 * 1953 TBMM). Applied as a shallow merge over {@link COUNTRY_CONFIGS} by
 * {@link getCountryConfig} when a preset is supplied. Nested objects
 * (`legislature`, `officeTypes`, …) are replaced wholesale when present —
 * do not partial-patch nested trees here. Same shape as seedDE/seedIE
 * `eraOverride` objects.
 */
export type EraCountryConfigOverride = Partial<
  Pick<
    CountryConfig,
    | "name"
    | "flagEmoji"
    | "executiveTitle"
    | "headOfStateTitle"
    | "executiveRealmPhrase"
    | "governmentType"
    | "governmentTypeLabel"
    | "coalitionThreshold"
    | "legislature"
    | "subNationalChamber"
    | "lowerElectionSystem"
    | "upperElectionSystem"
    | "electionSystems"
    | "officeTypes"
    | "tagline"
    | "descriptor"
    | "executiveLabel"
    | "regionLabel"
    | "regionLabelPlural"
    | "rulingPartyId"
    | "headOfStateSelection"
    | "majorPartyIds"
    | "currencyCode"
    | "usdExchangeRate"
    | "centralGovernmentLabel"
    | "exchangeName"
    | "exchangeKind"
    | "onePartyRegionalBudget"
    | "federalEqualizationGrantPerCapita"
    | "priorityProfile"
  >
>;

/**
 * Per-era institutional overlays. Mirrors {@link ERA_COUNTRY_NAMES}: the base
 * entry in {@link COUNTRY_CONFIGS} stays the era-neutral / later-era default;
 * presets that need a different government model merge an override at read time.
 *
 * TR 1953: 1950s Turkey had a unicameral Grand National Assembly (TBMM). The
 * Cumhuriyet Senatosu was created by the 1961 constitution (post-1960 coup) and
 * belongs only to 1979-default. Seat count 487 = 1950 general election TBMM size
 * (YSK / Nohlen, Grotz & Hartmann, Elections in Asia Vol. I); matches
 * `trRegions1953` houseDistricts sum. (1954 election expanded to 541.)
 *
 * FR 1953: Fourth Republic (1946–1958). Ceremonial President elected by
 * Parliament; real executive is the Président du Conseil (President of the
 * Council) answerable to the Assemblée Nationale. Closest in-tree pattern is
 * Italy's parliamentaryRepublic (ceremonial president + PM first in officeTypes).
 * Chamber keys stay `assembleeNationale` / `senat` so election types and office
 * mappings remain stable; only display names and seat counts change.
 *
 * ES 1953: Franco's one-party dictatorship. Closest in-tree pattern is DD —
 * a single executive who is also head of state (no separate ceremonial HoS
 * office / partyChairSync; Franco personally held both Jefe del Estado and
 * head of government until 1973). Legislature is the unicameral Cortes
 * Españolas (1942 Ley de Cortes) — corporatist / appointed "organic democracy"
 * (syndicates, municipalities, families, direct appointment), modelled with
 * `elected: false` like HU/PL appointed upper councils. Chamber key stays
 * `congresoDiputados` so the null-gated `esCongreso` cycle mapping remains
 * stable. Seat count 350 matches `esRegions1953` houseDistricts sum.
 * `rulingPartyId: 1` = FET (sole 1953 party, seeded first → seq 1).
 *
 * SE 1953: Bicameral Riksdag (Första + Andra kammaren) until the 1970 reform.
 * Modelled on the IE Seanad / UK Lords pattern: upper chamber is real for seat
 * counts and revise/delay flavour, but `bicameral: false` so it is NOT part of
 * the player bill loop (no perpetual First Chamber elections). Seat counts
 * match `seRegions1953` (Andra 230 via houseDistricts; Första 150 via
 * stateSenateSeats — not the base config's 151, which is abolished-era metadata).
 * Chamber key `riksdag` stays stable for the election engine.
 *
 * 1953 `usdExchangeRate` (refs the 1953 economy calibration): this field is the
 * ₳ value of ONE unit of the country's stored seed currency — it is what
 * normalizes `state.gdp` and the national budget seed into the shared ₳ anchor,
 * and the ₳ anchor tracks the US dollar of the era. The base entries in
 * {@link COUNTRY_CONFIGS} are modern (US/UK/DE/IE pinned at 1.0, JP 0.00943, …)
 * or, for the Cold-War-only roster, 1979 rates — both wrong for a 1953 world,
 * where every rate must be the reciprocal of `INITIAL_RATES_1953`
 * (constants/currencies.ts), the same table `seedExchangeRates` writes into the
 * `exchangeRates` collection. Left unfixed, the seeder and the forex collection
 * disagreed by up to 83x (FR) and the 1953 world's ₳ GDP ranking was fiction:
 * France read as a $3.9T economy and the USSR $1.9T against a $387B United
 * States, while Turkey read $0.7B and the UK $14.4B.
 *
 * IT/JP/CN/NG deliberately stay at 1.0: their 1953 regional GDP is authored in
 * **USD millions**, so
 * they are already ₳-denominated and a rate of 1.0 IS their era-correct
 * normalization. Do not "fix" them to 1/INITIAL_RATES_1953 — that would read
 * Italy as a $27M economy.
 *
 * HU/PL/RO/YU/BG/CS now have authored 1953 rates too. They stay
 * OUT of `FOREX_ACTIVE_COUNTRIES` — `seedExchangeRates` still writes no
 * `exchangeRates` row for them and they remain budget-only, non-convertible
 * economies. Only the config-side GDP→₳ normalization is authored, sourced from
 * `INITIAL_RATES_1953` like every entry above; the per-country reasoning (which
 * official parity each rate departs from, and why) lives on those constants.
 * Before this, the base config's 1979 rates read Bulgaria as a $40B economy —
 * larger than West Germany.
 *
 * Seat-count-only overlays (UK/IT/DE/JP/IE/BR/CN/NG/RU): modern base
 * `lowerChamber.seats` disagreed with historically authored `*Regions1953`
 * houseDistricts sums — the 1953 sim audit reported party seats vs totalSeats
 * mismatches (UK 806≠650, IT 945≠630). Align config to the era seed totals
 * (same pattern as TR/ES/SE above). FR already had a 627-seat era overlay;
 * its region HD were scaled to match.
 */
export const ERA_COUNTRY_CONFIG_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, EraCountryConfigOverride>>
> = {
  "1979-default": {
    BR: BR_ERAS["1979-default"]?.config,
  },
  // First non-1953 era to use this table. The lookup was always generic; nothing
  // had exercised it.
  //
  // ⚠️ THIS TABLE IS THE WIRING, NOT THE DATA. A country's era file can define
  // `config` and have it silently ignored, because only the entries listed here
  // are ever consulted. DE/IE/CN each carried a `1991-default` config that
  // reached nothing until they were added below — the folder looked right and
  // the value never applied. Adding an era override means editing BOTH places.
  // 2027 eurozone: FR/IT/ES/GR/AT/FI seed budgets in EUR (see
  // convertEuroMemberBudgetsFor2027), so their GDP→₳ normalization must be the
  // euro-anchored value, not the base legacy-currency rate. Each era file shows
  // the derivation (base × R_legacy/R_EUR from the seeder's rate table). DE is
  // already EUR and IE converts at 1.0, so neither needs an entry.
  "2027-default": {
    US: US_ERAS["2027-default"]?.config,
    FR: FR_ERAS["2027-default"]?.config,
    IT: IT_ERAS["2027-default"]?.config,
    ES: ES_ERAS["2027-default"]?.config,
    GR: GR_ERAS["2027-default"]?.config,
    AT: AT_ERAS["2027-default"]?.config,
    FI: FI_ERAS["2027-default"]?.config,
    HU: HU_ERAS["2027-default"]?.config,
    RO: RO_ERAS["2027-default"]?.config,
    BG: BG_ERAS["2027-default"]?.config,
    PL: PL_ERAS["2027-default"]?.config,
    RU: RU_ERAS["2027-default"]?.config,
    // Modern lira: the 2027 budget and bonds seed in TRY.
    TR: TR_ERAS["2027-default"]?.config,
  },
  "1991-default": {
    UK: UK_ERAS["1991-default"]?.config,
    JP: JP_ERAS["1991-default"]?.config,
    // GDP→anchor normalization (see each era file's header): their regional GDP
    // is authored in local currency, so the anchor is the reciprocal of
    // `INITIAL_RATES_1991`. The Soviet slot's output uses original rubles;
    // Nigeria's local GDP now agrees with its national nominal seed anchor.
    DE: DE_ERAS["1991-default"]?.config,
    IE: IE_ERAS["1991-default"]?.config,
    CN: CN_ERAS["1991-default"]?.config,
    PL: PL_ERAS["1991-default"]?.config,
    HU: HU_ERAS["1991-default"]?.config,
    CS: CS_ERAS["1991-default"]?.config,
    BG: BG_ERAS["1991-default"]?.config,
    YU: YU_ERAS["1991-default"]?.config,
    RO: RO_ERAS["1991-default"]?.config,
    RU: RU_ERAS["1991-default"]?.config,
    NG: NG_ERAS["1991-default"]?.config,
    // FR/IT/ES/SE/TR/GR/AT/FI: legacy-currency 1991 GDP at the WDI 1991 average rate.
    FR: FR_ERAS["1991-default"]?.config,
    IT: IT_ERAS["1991-default"]?.config,
    ES: ES_ERAS["1991-default"]?.config,
    SE: SE_ERAS["1991-default"]?.config,
    TR: TR_ERAS["1991-default"]?.config,
    GR: GR_ERAS["1991-default"]?.config,
    AT: AT_ERAS["1991-default"]?.config,
    FI: FI_ERAS["1991-default"]?.config,
  },
  "1953-default": {
    US: US_ERAS["1953-default"]?.config,
    TR: TR_ERAS["1953-default"]?.config,
    GR: GR_ERAS["1953-default"]?.config,
    AT: AT_ERAS["1953-default"]?.config,
    FI: FI_ERAS["1953-default"]?.config,
    FR: FR_ERAS["1953-default"]?.config,
    ES: ES_ERAS["1953-default"]?.config,
    SE: SE_ERAS["1953-default"]?.config,
    // Rákosi's MDP (1948–1956); MSZMP only founded after the 1956 revolution.
    HU: HU_ERAS["1953-default"]?.config,
    // Gheorghiu-Dej's PMR (1948–1965); "PCR" name restored only in 1965.
    RO: RO_ERAS["1953-default"]?.config,
    PL: PL_ERAS["1953-default"]?.config,
    CS: CS_ERAS["1953-default"]?.config,
    BG: BG_ERAS["1953-default"]?.config,
    YU: YU_ERAS["1953-default"]?.config,
    DD: DD_ERAS["1953-default"]?.config,
    BLR: BLR_ERAS["1953-default"]?.config,
    BAL: BAL_ERAS["1953-default"]?.config,
    UKR: UKR_ERAS["1953-default"]?.config,
    // ── Seat-count alignments to *Regions1953 houseDistricts ───────────────
    UK: UK_ERAS["1953-default"]?.config,
    IT: IT_ERAS["1953-default"]?.config,
    DE: DE_ERAS["1953-default"]?.config,
    JP: JP_ERAS["1953-default"]?.config,
    IE: IE_ERAS["1953-default"]?.config,
    BR: BR_ERAS["1953-default"]?.config,
    CN: CN_ERAS["1953-default"]?.config,
    NG: NG_ERAS["1953-default"]?.config,
    RU: RU_ERAS["1953-default"]?.config,
  },
};

/**
 * Per-era country display-name overrides. A country's `name` in COUNTRY_CONFIGS is
 * the era-neutral default; some countries are known by a different name in a given
 * preset's year (e.g. the FRG is "West Germany" while the GDR exists in 1979).
 * Use {@link getCountryDisplayName} at display sites that know the active preset.
 */
export const ERA_COUNTRY_NAMES: Record<string, Partial<Record<CountryId, string>>> = {
  "1953-default": {
    DE: "West Germany",
    RU: "Soviet Union",
  },
  "1979-default": {
    DE: "West Germany",
    RU: "Soviet Union",
  },
  "1991-default": {
    RU: "Soviet Union",
  },
};

/** Maps country to the office key used for regional executive assent on state bills. */
export const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = {
  US: US_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  UK: UK_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  JP: JP_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  IE: IE_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  CA: CA_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  DE: DE_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  // One-party regional executives — Republic / Land First Secretaries. Without
  // these entries the region pages fell back to the generic "Governor" label.
  RU: RU_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  DD: DD_REGIONAL_BILL_ASSENT_OFFICE_KEY,
};

/** Behavioral shape of a region-appointable seat in the admin seat appointer. */
export type RegionSeatKind =
  | "executive" // single-seat regional chief executive (governor / minister-president)
  | "classedUpper" // US-style per-region senate elected in rotating classes
  | "upperChamber" // multi-seat contested upper chamber (RU Soviet of Nationalities)
  | "lowerChamber" // region-elected federal lower house (House / NPC Delegate / Shūgiin / …)
  | "subNationalChamber"; // sub-national legislature (State Senate / People's Congress / Landtag / …)

/**
 * One region-appointable seat group for a country, derived entirely from config.
 * The admin seat appointer (panel + vacant-seats GET + assign-seat POST) renders
 * and validates against this — there are no hardcoded US offices.
 */
export interface RegionAppointableSeatSpec {
  /** `electedOfficials.officeType` + `Character/NPP.currentOffice.type`. */
  officeType: string;
  /** Singular display label, e.g. "Governor", "NPC Delegate", "Senator". */
  label: string;
  /** Panel heading, e.g. "Governor", "Senate", "House", "People's Congress". */
  groupLabel: string;
  kind: RegionSeatKind;
  /** lower/sub-national chambers hold many seats (seatsToAssign); executive/senate are single. */
  multiSeat: boolean;
  /** Which `State` field holds the seat total for a multi-seat group (null otherwise). */
  totalField: "houseDistricts" | "stateSenateSeats" | null;
  /**
   * Per-region seat totals for groups whose apportionment lives in a config
   * map rather than a `State` field (RU Soviet of Nationalities — the D11
   * republic-weighted map). Checked before `totalField` by the admin
   * vacant-seats / assign-seat routes.
   */
  totalsByRegion?: Record<string, number>;
}

/**
 * ⚠️ `?.` IS LOAD-BEARING, NOT DEFENSIVE NOISE. The registry is `Partial`, and
 * `addressNames` is optional in the country contract because China has no row
 * here at all -- `getNationalAddressName` falls back to "Address to the
 * Nation". A country that omits the field therefore stays omitted rather than
 * acquiring someone else's phrase.
 */
export const NATIONAL_ADDRESS_NAME: Partial<Record<CountryId, string>> = {
  US: US_IDENTITY.addressNames?.national,
  UK: UK_IDENTITY.addressNames?.national,
  DE: DE_IDENTITY.addressNames?.national,
  JP: JP_IDENTITY.addressNames?.national,
  IE: IE_IDENTITY.addressNames?.national,
  CA: CA_IDENTITY.addressNames?.national,
};

/**
 * Display and label helpers now live in `countryClientConfig.ts` (generated,
 * client-safe). They are re-exported here so every existing server import keeps
 * working, and the two this module still uses are imported above.
 */
export {
  getCountryDisplayName,
  getCountryIdByName,
  getExecutiveOrderName,
  getExecutiveOrderNamePlural,
  getNationalAddressName,
  getRegionalBillAssentTitle,
  getRegionalBillAssentTitleForState,
  getRegionalExecutiveOfficeKey,
  getSubNationalLegislatureKey,
} from "./countryClientConfig";
