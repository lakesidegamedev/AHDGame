import type { CountryInstitutions } from "../contract";
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
 * positions, orders and mechanics are added with the executive module.
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
    groups: CA_CABINET_GROUPS,
  },
};
