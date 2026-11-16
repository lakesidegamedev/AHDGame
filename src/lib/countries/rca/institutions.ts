import type { CountryInstitutions } from "../contract";
import { ORDERS_BY_COUNTRY } from "@/lib/constants/cabinetOrders";
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";
import {
  RCA_CABINET_SEAT_IDS,
  RCA_CONFIG,
  RCA_MILITARY_BRANCHES,
  RCA_MILITARY_SCALE,
} from "./institutionsFacts";

/**
 * California's institutions. The facts live in `./institutionsFacts`; the
 * cabinet is built once by the cabinet registries from the folder's seat list,
 * and read back here so both name the same objects.
 */
export const RCA_INSTITUTIONS: CountryInstitutions = {
  config: RCA_CONFIG,
  positions: RCA_CABINET_SEAT_IDS,
  military: {
    branches: RCA_MILITARY_BRANCHES,
    scale: RCA_MILITARY_SCALE,
  },
  cabinet: {
    positions: getCabinetPositions("RCA"),
    orders: ORDERS_BY_COUNTRY.RCA,
  },
};
