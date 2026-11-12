import type { CountryInstitutions } from "../contract";
import { UK_CABINET_POSITIONS } from "@/lib/constants/ukCabinet";
import { UK_MINISTERIAL_ORDERS } from "@/lib/constants/ukCabinetOrders";
import { UK_CABINET_MECHANICS } from "@/lib/constants/ukCabinetMechanics";
import {
  UK_CABINET_GROUPS,
  UK_CABINET_SEAT_IDS,
  UK_CONFIG,
  UK_ESTATE_PORTFOLIO,
  UK_LEGISLATIVE_PROCESS,
  UK_MILITARY_BRANCHES,
  UK_MILITARY_SCALE,
  UK_ORDERS_OF_BATTLE,
  UK_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "./institutionsFacts";

/*
 * UK institutions. Facts live in `./institutionsFacts`, not here: this
 * composes them with the heavy cabinet, so a registry needing one seat id must
 * import from the facts module or it ships the whole cabinet to the browser.
 */
export const UK_INSTITUTIONS: CountryInstitutions = {
  config: UK_CONFIG,
  legislativeProcess: UK_LEGISLATIVE_PROCESS,
  regionalBillAssentOfficeKey: UK_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  positions: UK_CABINET_SEAT_IDS,
  estatePortfolio: UK_ESTATE_PORTFOLIO,
  military: {
    branches: UK_MILITARY_BRANCHES,
    scale: UK_MILITARY_SCALE,
    ordersOfBattle: UK_ORDERS_OF_BATTLE,
  },
  cabinet: {
    positions: UK_CABINET_POSITIONS,
    orders: UK_MINISTERIAL_ORDERS,
    mechanics: UK_CABINET_MECHANICS,
    groups: UK_CABINET_GROUPS,
  },
};
