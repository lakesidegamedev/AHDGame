import type { CountryInstitutions } from "../contract";
import { CABINET_POSITIONS } from "./cabinet/positions";
import { US_MINISTERIAL_ORDERS } from "./cabinet/orders";
import { US_CABINET_MECHANICS } from "./cabinet/mechanics";
import {
  US_CABINET_GROUPS,
  US_CABINET_SEAT_IDS,
  US_CONFIG,
  US_ESTATE_PORTFOLIO,
  US_LEGISLATIVE_PROCESS,
  US_MILITARY_BRANCHES,
  US_MILITARY_SCALE,
  US_ORDERS_OF_BATTLE,
  US_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "./institutionsFacts";

/**
 * The United States' institutions.
 *
 * Facts live in `./institutionsFacts`, not here: this module pulls in the heavy
 * cabinet. Import from `institutionsFacts` for seat ids or the legislative
 * process, or the whole cabinet ships to the browser. Enforced by
 * `clientSafeLeafModules.test.ts`.
 *
 * `CABINET_POSITIONS` keeps its unprefixed name despite the per-country
 * convention; API routes read it through the `@/lib/constants` barrel.
 */
export const US_INSTITUTIONS: CountryInstitutions = {
  config: US_CONFIG,
  legislativeProcess: US_LEGISLATIVE_PROCESS,
  regionalBillAssentOfficeKey: US_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  positions: US_CABINET_SEAT_IDS,
  estatePortfolio: US_ESTATE_PORTFOLIO,
  military: {
    branches: US_MILITARY_BRANCHES,
    scale: US_MILITARY_SCALE,
    ordersOfBattle: US_ORDERS_OF_BATTLE,
  },
  cabinet: {
    positions: CABINET_POSITIONS,
    orders: US_MINISTERIAL_ORDERS,
    mechanics: US_CABINET_MECHANICS,
    groups: US_CABINET_GROUPS,
  },
};
