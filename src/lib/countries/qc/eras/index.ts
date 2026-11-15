import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { QC_1953 } from "./1953";
import { QC_1979 } from "./1979";
import { QC_1991 } from "./1991";
import { QC_1999 } from "./1999";
import { QC_2007 } from "./2007";
import { QC_2019 } from "./2019";
import { QC_2023 } from "./2023";
import { QC_2027 } from "./2027";

/**
 * QC's per-era overrides, one per shipping preset. Quebec is absent from every
 * era roster; it exists only after a sovereignty referendum carries.
 */
export const QC_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": QC_1953,
  "1979-default": QC_1979,
  "1991-default": QC_1991,
  "1999-default": QC_1999,
  "2007-default": QC_2007,
  "2019-default": QC_2019,
  "2023-default": QC_2023,
  "2027-default": QC_2027,
};
