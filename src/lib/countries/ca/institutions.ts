import type { CountryInstitutions } from "../contract";
import { CA_CABINET_POSITIONS } from "./cabinet/positions";
import { CA_CABINET_MECHANICS } from "./cabinet/mechanics";
import { CA_MINISTERIAL_ORDERS } from "./cabinet/orders";
import {
  CA_CABINET_GROUPS,
  CA_CABINET_SEAT_IDS,
  CA_CONFIG,
  CA_ESTATE_PORTFOLIO,
  CA_LEGISLATIVE_PROCESS,
  CA_MILITARY_BRANCHES,
  CA_MILITARY_SCALE,
  CA_ORDERS_OF_BATTLE,
  CA_REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "./institutionsFacts";

/**
 * Canada's institutions. The facts live in `./institutionsFacts`; the cabinet
 * is heavy and composed here.
 */
export const CA_INSTITUTIONS: CountryInstitutions = {
  config: CA_CONFIG,
  legislativeProcess: CA_LEGISLATIVE_PROCESS,
  regionalBillAssentOfficeKey: CA_REGIONAL_BILL_ASSENT_OFFICE_KEY,
  positions: CA_CABINET_SEAT_IDS,
  estatePortfolio: CA_ESTATE_PORTFOLIO,
  military: {
    branches: CA_MILITARY_BRANCHES,
    scale: CA_MILITARY_SCALE,
    ordersOfBattle: CA_ORDERS_OF_BATTLE,
  },
  cabinet: {
    positions: CA_CABINET_POSITIONS,
    orders: CA_MINISTERIAL_ORDERS,
    mechanics: CA_CABINET_MECHANICS,
    groups: CA_CABINET_GROUPS,
  },
};
