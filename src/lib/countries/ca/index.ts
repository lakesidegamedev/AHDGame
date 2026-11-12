import type { CountryFolder } from "../contract";
import { CA_IDENTITY } from "./identity";
import { CA_INSTITUTIONS } from "./institutions";
import { CA_ELECTIONS } from "./elections";
import { CA_ECONOMY } from "./economy";
import { CA_GEOGRAPHY } from "./geography";
import { CA_ERAS } from "./eras";

/**
 * Canada's country folder.
 *
 * SERVER-SIDE CONSUMERS ONLY. Client surfaces take `./identity` or
 * `./geographyFacts`, never this file and never `./geography`.
 */
export const CA: CountryFolder<"CA"> = {
  id: "CA",
  identity: CA_IDENTITY,
  institutions: CA_INSTITUTIONS,
  elections: CA_ELECTIONS,
  economy: CA_ECONOMY,
  geography: CA_GEOGRAPHY,
  eras: CA_ERAS,
};

export { CA_IDENTITY } from "./identity";
export { CA_INSTITUTIONS } from "./institutions";
export { CA_ELECTIONS } from "./elections";
export { CA_ECONOMY } from "./economy";
export { CA_GEOGRAPHY } from "./geography";
export { CA_ERAS } from "./eras";
