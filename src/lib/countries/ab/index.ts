import type { CountryFolder } from "../contract";
import { AB_IDENTITY } from "./identity";
import { AB_INSTITUTIONS } from "./institutions";
import { AB_ELECTIONS } from "./elections";
import { AB_ECONOMY } from "./economy";
import { AB_GEOGRAPHY } from "./geography";
import { AB_ERAS } from "./eras";

/**
 * Alberta's country folder: the latent successor a passed sovereignty
 * referendum stands up. Server-side consumers only; client surfaces take
 * `./identity` or `./geographyFacts`.
 */
export const AB: CountryFolder<"AB"> = {
  id: "AB",
  identity: AB_IDENTITY,
  institutions: AB_INSTITUTIONS,
  elections: AB_ELECTIONS,
  economy: AB_ECONOMY,
  geography: AB_GEOGRAPHY,
  eras: AB_ERAS,
};

export { AB_IDENTITY } from "./identity";
export { AB_INSTITUTIONS } from "./institutions";
export { AB_ELECTIONS } from "./elections";
export { AB_ECONOMY } from "./economy";
export { AB_GEOGRAPHY } from "./geography";
export { AB_ERAS } from "./eras";
