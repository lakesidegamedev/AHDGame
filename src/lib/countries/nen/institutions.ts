import type { CountryInstitutions } from "../contract";
import { ORDERS_BY_COUNTRY } from "@/lib/constants/cabinetOrders";
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";
import {
  NEN_CABINET_SEAT_IDS,
  NEN_CONFIG,
  NEN_MILITARY_BRANCHES,
  NEN_MILITARY_SCALE,
} from "./institutionsFacts";

/**
 * New England's institutions. The facts live in `./institutionsFacts`; the
 * cabinet is built once by the cabinet registries from the folder's seat list,
 * and read back here so both name the same objects.
 */
export const NEN_INSTITUTIONS: CountryInstitutions = {
  config: NEN_CONFIG,
  positions: NEN_CABINET_SEAT_IDS,
  military: {
    branches: NEN_MILITARY_BRANCHES,
    scale: NEN_MILITARY_SCALE,
  },
  cabinet: {
    positions: getCabinetPositions("NEN"),
    orders: ORDERS_BY_COUNTRY.NEN,
  },
};
