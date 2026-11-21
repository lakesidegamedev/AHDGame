import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { RTX_1953 } from "./1953";
import { RTX_1979 } from "./1979";
import { RTX_1991 } from "./1991";
import { RTX_1999 } from "./1999";
import { RTX_2007 } from "./2007";
import { RTX_2019 } from "./2019";
import { RTX_2023 } from "./2023";
import { RTX_2027 } from "./2027";

/**
 * RTX's per-era overrides, one per shipping preset. Texas is absent from every
 * era roster; it exists only after a sovereignty referendum carries.
 */
export const RTX_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": RTX_1953,
  "1979-default": RTX_1979,
  "1991-default": RTX_1991,
  "1999-default": RTX_1999,
  "2007-default": RTX_2007,
  "2019-default": RTX_2019,
  "2023-default": RTX_2023,
  "2027-default": RTX_2027,
};
