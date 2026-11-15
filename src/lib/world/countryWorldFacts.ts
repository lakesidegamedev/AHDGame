/**
 * Per-country world facts for CountryConfig-backed entities: coverage region
 * and UN admission year. Each row forwards the country folder's own fact.
 */
import type { CountryId } from "@/lib/constants/countries";
import { JP_UN_MEMBER_SINCE, JP_WORLD_REGION } from "@/lib/countries/jp/geographyFacts";
import type { WorldEntityRegion } from "./worldEntityManifest";
import { US_WORLD_REGION, US_UN_MEMBER_SINCE } from "@/lib/countries/us/geographyFacts";
import { UK_WORLD_REGION, UK_UN_MEMBER_SINCE } from "@/lib/countries/uk/geographyFacts";
import { DE_WORLD_REGION } from "@/lib/countries/de/geographyFacts";
import { CN_WORLD_REGION, CN_UN_MEMBER_SINCE } from "@/lib/countries/cn/geographyFacts";
import { IE_WORLD_REGION, IE_UN_MEMBER_SINCE } from "@/lib/countries/ie/geographyFacts";
import { RU_WORLD_REGION, RU_UN_MEMBER_SINCE } from "@/lib/countries/ru/geographyFacts";
import { DD_WORLD_REGION } from "@/lib/countries/dd/geographyFacts";
import { NG_WORLD_REGION, NG_UN_MEMBER_SINCE } from "@/lib/countries/ng/geographyFacts";
import { BR_WORLD_REGION, BR_UN_MEMBER_SINCE } from "@/lib/countries/br/geographyFacts";
import { FR_WORLD_REGION, FR_UN_MEMBER_SINCE } from "@/lib/countries/fr/geographyFacts";
import { IT_WORLD_REGION, IT_UN_MEMBER_SINCE } from "@/lib/countries/it/geographyFacts";
import { ES_WORLD_REGION, ES_UN_MEMBER_SINCE } from "@/lib/countries/es/geographyFacts";
import { SE_WORLD_REGION, SE_UN_MEMBER_SINCE } from "@/lib/countries/se/geographyFacts";
import { TR_WORLD_REGION, TR_UN_MEMBER_SINCE } from "@/lib/countries/tr/geographyFacts";
import { GR_WORLD_REGION, GR_UN_MEMBER_SINCE } from "@/lib/countries/gr/geographyFacts";
import { AT_WORLD_REGION, AT_UN_MEMBER_SINCE } from "@/lib/countries/at/geographyFacts";
import { FI_WORLD_REGION, FI_UN_MEMBER_SINCE } from "@/lib/countries/fi/geographyFacts";
import { PL_WORLD_REGION, PL_UN_MEMBER_SINCE } from "@/lib/countries/pl/geographyFacts";
import { HU_WORLD_REGION, HU_UN_MEMBER_SINCE } from "@/lib/countries/hu/geographyFacts";
import { RO_WORLD_REGION, RO_UN_MEMBER_SINCE } from "@/lib/countries/ro/geographyFacts";
import { YU_WORLD_REGION, YU_UN_MEMBER_SINCE } from "@/lib/countries/yu/geographyFacts";
import { BG_WORLD_REGION, BG_UN_MEMBER_SINCE } from "@/lib/countries/bg/geographyFacts";
import { CS_WORLD_REGION, CS_UN_MEMBER_SINCE } from "@/lib/countries/cs/geographyFacts";
import { SCO_WORLD_REGION } from "@/lib/countries/sco/geographyFacts";
import { WAL_WORLD_REGION } from "@/lib/countries/wal/geographyFacts";
import { BLR_WORLD_REGION, BLR_UN_MEMBER_SINCE } from "@/lib/countries/blr/geographyFacts";
import { UKR_WORLD_REGION, UKR_UN_MEMBER_SINCE } from "@/lib/countries/ukr/geographyFacts";
import { BAL_WORLD_REGION } from "@/lib/countries/bal/geographyFacts";
import { CA_WORLD_REGION, CA_UN_MEMBER_SINCE } from "@/lib/countries/ca/geographyFacts";
import { QC_WORLD_REGION } from "@/lib/countries/qc/geographyFacts";

/** Coverage region for CountryConfig-backed entities (1953 gate + diagnostics). */
export const COUNTRY_REGIONS: Record<CountryId, WorldEntityRegion> = {
  US: US_WORLD_REGION,
  BR: BR_WORLD_REGION,
  UK: UK_WORLD_REGION,
  FR: FR_WORLD_REGION,
  DE: DE_WORLD_REGION,
  DD: DD_WORLD_REGION,
  IT: IT_WORLD_REGION,
  ES: ES_WORLD_REGION,
  SE: SE_WORLD_REGION,
  IE: IE_WORLD_REGION,
  HU: HU_WORLD_REGION,
  PL: PL_WORLD_REGION,
  RO: RO_WORLD_REGION,
  YU: YU_WORLD_REGION,
  BG: BG_WORLD_REGION,
  CS: CS_WORLD_REGION,
  UKR: UKR_WORLD_REGION,
  RU: RU_WORLD_REGION,
  TR: TR_WORLD_REGION,
  JP: JP_WORLD_REGION,
  CN: CN_WORLD_REGION,
  NG: NG_WORLD_REGION,
  AT: AT_WORLD_REGION,
  GR: GR_WORLD_REGION,
  FI: FI_WORLD_REGION,
  BLR: BLR_WORLD_REGION,
  BAL: BAL_WORLD_REGION,
  SCO: SCO_WORLD_REGION,
  WAL: WAL_WORLD_REGION,
  CA: CA_WORLD_REGION,
  QC: QC_WORLD_REGION,
};

/** UN admission year priors for CountryConfig sovereigns (strong defaults). */
export const COUNTRY_UN_MEMBER_SINCE: Partial<Record<CountryId, number>> = {
  US: US_UN_MEMBER_SINCE,
  UK: UK_UN_MEMBER_SINCE,
  FR: FR_UN_MEMBER_SINCE,
  RU: RU_UN_MEMBER_SINCE,
  CN: CN_UN_MEMBER_SINCE,
  BR: BR_UN_MEMBER_SINCE,
  DE: undefined, // FRG admitted 1973
  DD: undefined, // GDR admitted 1973
  IT: IT_UN_MEMBER_SINCE,
  ES: ES_UN_MEMBER_SINCE,
  SE: SE_UN_MEMBER_SINCE,
  TR: TR_UN_MEMBER_SINCE,
  JP: JP_UN_MEMBER_SINCE,
  IE: IE_UN_MEMBER_SINCE,
  NG: NG_UN_MEMBER_SINCE,
  PL: PL_UN_MEMBER_SINCE,
  HU: HU_UN_MEMBER_SINCE,
  RO: RO_UN_MEMBER_SINCE,
  BG: BG_UN_MEMBER_SINCE,
  // The Ukrainian and Byelorussian SSRs were UN founding members in their own
  // right - Stalin's price for the Yalta voting arrangement. This is real, not a
  // modelling convenience, and it is the single largest thing that separates
  // them from the Baltic republics, whose annexation the UN never recognised and
  // which therefore have no admission year at all.
  UKR: UKR_UN_MEMBER_SINCE,
  BLR: BLR_UN_MEMBER_SINCE,
  YU: YU_UN_MEMBER_SINCE,
  CS: CS_UN_MEMBER_SINCE,
  GR: GR_UN_MEMBER_SINCE,
  AT: AT_UN_MEMBER_SINCE,
  FI: FI_UN_MEMBER_SINCE,
  CA: CA_UN_MEMBER_SINCE,
};
