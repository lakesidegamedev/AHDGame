import type { CountryInstitutions } from "../contract";
import { ORDERS_BY_COUNTRY } from "@/lib/constants/cabinetOrders";
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";
import {
  RTX_CABINET_SEAT_IDS,
  RTX_CONFIG,
  RTX_MILITARY_BRANCHES,
  RTX_MILITARY_SCALE,
} from "./institutionsFacts";

/**
 * Texas's institutions. The facts live in `./institutionsFacts`; the
 * cabinet is built once by the cabinet registries from the folder's seat list,
 * and read back here so both name the same objects.
 */
export const RTX_INSTITUTIONS: CountryInstitutions = {
  config: RTX_CONFIG,
  positions: RTX_CABINET_SEAT_IDS,
  military: {
    branches: RTX_MILITARY_BRANCHES,
    scale: RTX_MILITARY_SCALE,
  },
  cabinet: {
    positions: getCabinetPositions("RTX"),
    orders: ORDERS_BY_COUNTRY.RTX,
  },
};
