import type { CountryFolder } from "../contract";
import { RTX_IDENTITY } from "./identity";
import { RTX_INSTITUTIONS } from "./institutions";
import { RTX_ELECTIONS } from "./elections";
import { RTX_ECONOMY } from "./economy";
import { RTX_GEOGRAPHY } from "./geography";
import { RTX_ERAS } from "./eras";

/**
 * Texas's country folder: the latent successor a passed sovereignty
 * referendum stands up. Server-side consumers only; client surfaces take
 * `./identity` or `./geographyFacts`.
 */
export const RTX: CountryFolder<"RTX"> = {
  id: "RTX",
  identity: RTX_IDENTITY,
  institutions: RTX_INSTITUTIONS,
  elections: RTX_ELECTIONS,
  economy: RTX_ECONOMY,
  geography: RTX_GEOGRAPHY,
  eras: RTX_ERAS,
};

export { RTX_IDENTITY } from "./identity";
export { RTX_INSTITUTIONS } from "./institutions";
export { RTX_ELECTIONS } from "./elections";
export { RTX_ECONOMY } from "./economy";
export { RTX_GEOGRAPHY } from "./geography";
export { RTX_ERAS } from "./eras";
