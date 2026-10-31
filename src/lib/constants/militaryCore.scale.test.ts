import { describe, expect, it } from "vitest";
import type { CountryId } from "./countriesCore";
import { MILITARY_COUNTRY_SCALE } from "./militaryCore";
import { AT_MILITARY_SCALE } from "@/lib/countries/at/institutionsFacts";
import { BAL_MILITARY_SCALE } from "@/lib/countries/bal/institutionsFacts";
import { BG_MILITARY_SCALE } from "@/lib/countries/bg/institutionsFacts";
import { BLR_MILITARY_SCALE } from "@/lib/countries/blr/institutionsFacts";
import { BR_MILITARY_SCALE } from "@/lib/countries/br/institutionsFacts";
import { CN_MILITARY_SCALE } from "@/lib/countries/cn/institutionsFacts";
import { CS_MILITARY_SCALE } from "@/lib/countries/cs/institutionsFacts";
import { DD_MILITARY_SCALE } from "@/lib/countries/dd/institutionsFacts";
import { DE_MILITARY_SCALE } from "@/lib/countries/de/institutionsFacts";
import { ES_MILITARY_SCALE } from "@/lib/countries/es/institutionsFacts";
import { FI_MILITARY_SCALE } from "@/lib/countries/fi/institutionsFacts";
import { FR_MILITARY_SCALE } from "@/lib/countries/fr/institutionsFacts";
import { GR_MILITARY_SCALE } from "@/lib/countries/gr/institutionsFacts";
import { HU_MILITARY_SCALE } from "@/lib/countries/hu/institutionsFacts";
import { IE_MILITARY_SCALE } from "@/lib/countries/ie/institutionsFacts";
import { IT_MILITARY_SCALE } from "@/lib/countries/it/institutionsFacts";
import { JP_MILITARY_SCALE } from "@/lib/countries/jp/institutionsFacts";
import { NG_MILITARY_SCALE } from "@/lib/countries/ng/institutionsFacts";
import { PL_MILITARY_SCALE } from "@/lib/countries/pl/institutionsFacts";
import { RO_MILITARY_SCALE } from "@/lib/countries/ro/institutionsFacts";
import { RU_MILITARY_SCALE } from "@/lib/countries/ru/institutionsFacts";
import { SCO_MILITARY_SCALE } from "@/lib/countries/sco/institutionsFacts";
import { SE_MILITARY_SCALE } from "@/lib/countries/se/institutionsFacts";
import { TR_MILITARY_SCALE } from "@/lib/countries/tr/institutionsFacts";
import { UK_MILITARY_SCALE } from "@/lib/countries/uk/institutionsFacts";
import { UKR_MILITARY_SCALE } from "@/lib/countries/ukr/institutionsFacts";
import { US_MILITARY_SCALE } from "@/lib/countries/us/institutionsFacts";
import { WAL_MILITARY_SCALE } from "@/lib/countries/wal/institutionsFacts";
import { YU_MILITARY_SCALE } from "@/lib/countries/yu/institutionsFacts";

/**
 * The client-safe scale table is authored as literals so unit pricing does not
 * import every country's institution module. This pins it to the authored
 * constants so a balance change cannot leave the browser pricing units at an
 * old scale.
 */
const AUTHORED: Record<CountryId, number> = {
  AT: AT_MILITARY_SCALE,
  BAL: BAL_MILITARY_SCALE,
  BG: BG_MILITARY_SCALE,
  BLR: BLR_MILITARY_SCALE,
  BR: BR_MILITARY_SCALE,
  CN: CN_MILITARY_SCALE,
  CS: CS_MILITARY_SCALE,
  DD: DD_MILITARY_SCALE,
  DE: DE_MILITARY_SCALE,
  ES: ES_MILITARY_SCALE,
  FI: FI_MILITARY_SCALE,
  FR: FR_MILITARY_SCALE,
  GR: GR_MILITARY_SCALE,
  HU: HU_MILITARY_SCALE,
  IE: IE_MILITARY_SCALE,
  IT: IT_MILITARY_SCALE,
  JP: JP_MILITARY_SCALE,
  NG: NG_MILITARY_SCALE,
  PL: PL_MILITARY_SCALE,
  RO: RO_MILITARY_SCALE,
  RU: RU_MILITARY_SCALE,
  SCO: SCO_MILITARY_SCALE,
  SE: SE_MILITARY_SCALE,
  TR: TR_MILITARY_SCALE,
  UK: UK_MILITARY_SCALE,
  UKR: UKR_MILITARY_SCALE,
  US: US_MILITARY_SCALE,
  WAL: WAL_MILITARY_SCALE,
  YU: YU_MILITARY_SCALE,
};

describe("militaryCore country scale", () => {
  it("matches every authored country scale", () => {
    expect(MILITARY_COUNTRY_SCALE).toEqual(AUTHORED);
  });
});
