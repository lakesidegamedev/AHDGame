import type { CountryInstitutions } from "../contract";
import { ORDERS_BY_COUNTRY } from "@/lib/constants/cabinetOrders";
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";
import {
  AB_CABINET_SEAT_IDS,
  AB_CONFIG,
  AB_MILITARY_BRANCHES,
  AB_MILITARY_SCALE,
} from "./institutionsFacts";

/**
 * Alberta's institutions. The facts live in `./institutionsFacts`; the
 * cabinet is built once by the cabinet registries from the folder's seat list,
 * and read back here so both name the same objects.
 */
export const AB_INSTITUTIONS: CountryInstitutions = {
  config: AB_CONFIG,
  positions: AB_CABINET_SEAT_IDS,
  military: {
    branches: AB_MILITARY_BRANCHES,
    scale: AB_MILITARY_SCALE,
  },
  cabinet: {
    positions: getCabinetPositions("AB"),
    orders: ORDERS_BY_COUNTRY.AB,
  },
};
