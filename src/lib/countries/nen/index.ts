import type { CountryFolder } from "../contract";
import { NEN_IDENTITY } from "./identity";
import { NEN_INSTITUTIONS } from "./institutions";
import { NEN_ELECTIONS } from "./elections";
import { NEN_ECONOMY } from "./economy";
import { NEN_GEOGRAPHY } from "./geography";
import { NEN_ERAS } from "./eras";

/**
 * New England's country folder: the latent successor a passed sovereignty
 * referendum stands up. Server-side consumers only; client surfaces take
 * `./identity` or `./geographyFacts`.
 */
export const NEN: CountryFolder<"NEN"> = {
  id: "NEN",
  identity: NEN_IDENTITY,
  institutions: NEN_INSTITUTIONS,
  elections: NEN_ELECTIONS,
  economy: NEN_ECONOMY,
  geography: NEN_GEOGRAPHY,
  eras: NEN_ERAS,
};

export { NEN_IDENTITY } from "./identity";
export { NEN_INSTITUTIONS } from "./institutions";
export { NEN_ELECTIONS } from "./elections";
export { NEN_ECONOMY } from "./economy";
export { NEN_GEOGRAPHY } from "./geography";
export { NEN_ERAS } from "./eras";
