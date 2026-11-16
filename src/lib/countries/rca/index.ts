import type { CountryFolder } from "../contract";
import { RCA_IDENTITY } from "./identity";
import { RCA_INSTITUTIONS } from "./institutions";
import { RCA_ELECTIONS } from "./elections";
import { RCA_ECONOMY } from "./economy";
import { RCA_GEOGRAPHY } from "./geography";
import { RCA_ERAS } from "./eras";

/**
 * California's country folder: the latent successor a passed sovereignty
 * referendum stands up. Server-side consumers only; client surfaces take
 * `./identity` or `./geographyFacts`.
 */
export const RCA: CountryFolder<"RCA"> = {
  id: "RCA",
  identity: RCA_IDENTITY,
  institutions: RCA_INSTITUTIONS,
  elections: RCA_ELECTIONS,
  economy: RCA_ECONOMY,
  geography: RCA_GEOGRAPHY,
  eras: RCA_ERAS,
};

export { RCA_IDENTITY } from "./identity";
export { RCA_INSTITUTIONS } from "./institutions";
export { RCA_ELECTIONS } from "./elections";
export { RCA_ECONOMY } from "./economy";
export { RCA_GEOGRAPHY } from "./geography";
export { RCA_ERAS } from "./eras";
