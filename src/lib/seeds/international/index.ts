import type { EraId } from "@/lib/seeds/presetSelector";
import type { CountryLayer1Model } from "./types";
import { getUkModel } from "./uk";
import { getScoModel } from "./sco";
import { getWalModel } from "./wal";
import { getDeModel } from "./de";
import { getJpModel } from "./jp";
import { getIeModel } from "./ie";
import { getBrModel } from "./br";
import { getCnModel } from "./cn";
import { getNgModel } from "./ng";
import { getRuModel } from "./ru";
import { getFrModel } from "./fr";
import { getItModel } from "./it";
import { getEsModel } from "./es";
import { getSeModel } from "./se";
import { getTrModel } from "./tr";
import { getGrModel } from "./gr";
import { getAtModel } from "./at";
import { getFiModel } from "./fi";
import { getDdModel } from "./dd";
import { getHuModel } from "./hu";
import { getPlModel } from "./pl";
import { getRoModel } from "./ro";
import { getYuModel } from "./yu";
import { getBgModel } from "./bg";
import { getBlrModel } from "./blr";
import { getUaModel } from "./ua";
import { getCsModel } from "./cs";
import { getBalModel } from "./bal";
import { getSuccessor1991Model, type Successor1991CountryId } from "./successor1991";

export { buildModelRegionDemographics } from "./derive";
export type { CountryLayer1Model } from "./types";

const LAYER1_MODEL_BUILDERS: Record<string, (era: EraId) => CountryLayer1Model | null> = {
  UK: getUkModel,
  SCO: getScoModel,
  WAL: getWalModel,
  DE: getDeModel,
  JP: getJpModel,
  IE: getIeModel,
  BR: getBrModel,
  CN: getCnModel,
  NG: getNgModel,
  RU: getRuModel,
  FR: getFrModel,
  IT: getItModel,
  ES: getEsModel,
  SE: getSeModel,
  TR: getTrModel,
  GR: getGrModel,
  AT: getAtModel,
  FI: getFiModel,
  DD: getDdModel,
  HU: getHuModel,
  PL: getPlModel,
  RO: getRoModel,
  YU: getYuModel,
  BG: getBgModel,
  BLR: getBlrModel,
  UKR: getUaModel,
  CS: getCsModel,
  BAL: getBalModel,
};

/**
 * Resolve a country's historically-grounded Layer-1 model for an era, or null
 * if the country has no international Layer-1 model. Used by the gated seed path.
 */
export function getCountryLayer1Model(countryId: string, era: EraId): CountryLayer1Model | null {
  if (
    era === "1991" &&
    (["RU", "PL", "CS", "HU", "RO", "BG", "YU"] as string[]).includes(countryId)
  ) {
    return getSuccessor1991Model(countryId as Successor1991CountryId);
  }
  if (!Object.hasOwn(LAYER1_MODEL_BUILDERS, countryId)) return null;
  return LAYER1_MODEL_BUILDERS[countryId](era);
}
