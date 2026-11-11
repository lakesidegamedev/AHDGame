import type { CountryInstitutions } from "../contract";
import { ORDERS_BY_COUNTRY } from "@/lib/constants/cabinetOrders";
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";
import {
  QC_CABINET_SEAT_IDS,
  QC_CONFIG,
  QC_MILITARY_BRANCHES,
  QC_MILITARY_SCALE,
} from "./institutionsFacts";

/**
 * Quebec's institutions. The facts live in `./institutionsFacts`; the
 * cabinet is built once by the cabinet registries from the folder's seat list,
 * and read back here so both name the same objects.
 */
export const QC_INSTITUTIONS: CountryInstitutions = {
  config: QC_CONFIG,
  positions: QC_CABINET_SEAT_IDS,
  military: {
    branches: QC_MILITARY_BRANCHES,
    scale: QC_MILITARY_SCALE,
  },
  cabinet: {
    positions: getCabinetPositions("QC"),
    orders: ORDERS_BY_COUNTRY.QC,
  },
};
