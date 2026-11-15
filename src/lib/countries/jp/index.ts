import type { CountryFolder } from "../contract";
import { JP_IDENTITY } from "./identity";
import { JP_INSTITUTIONS } from "./institutions";
import { JP_ELECTIONS } from "./elections";
import { JP_ECONOMY } from "./economy";
import { JP_GEOGRAPHY } from "./geography";
import { JP_ERAS } from "./eras";

/**
 * SERVER-SIDE CONSUMERS ONLY. Composes the whole folder; ./elections
 * reaches getDb, so a client import pulls the MongoDB driver into the
 * browser bundle. Client surfaces must import ./identity or ./geography
 * directly. Enforced by noClientBarrelImport.test.ts.
 *
 * Exists so contract.test.ts can assert Japan satisfies CountryFolder
 * with nothing quietly absent.
 */
export const JP: CountryFolder<"JP"> = {
  id: "JP",
  identity: JP_IDENTITY,
  institutions: JP_INSTITUTIONS,
  elections: JP_ELECTIONS,
  economy: JP_ECONOMY,
  geography: JP_GEOGRAPHY,
  eras: JP_ERAS,
};

export { JP_IDENTITY } from "./identity";
export { JP_INSTITUTIONS } from "./institutions";
export { JP_ELECTIONS } from "./elections";
export { JP_ECONOMY } from "./economy";
export { JP_GEOGRAPHY } from "./geography";
export { JP_ERAS } from "./eras";

export type {
  CountryElections,
  CountryEconomy,
  CountryEraOverride,
  CountryFolder,
  CountryGeography,
  CountryIdentity,
  CountryInstitutions,
} from "../contract";
