import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { AB_1953 } from "./1953";
import { AB_1979 } from "./1979";
import { AB_1991 } from "./1991";
import { AB_1999 } from "./1999";
import { AB_2007 } from "./2007";
import { AB_2019 } from "./2019";
import { AB_2023 } from "./2023";
import { AB_2027 } from "./2027";

/**
 * AB's per-era overrides, one per shipping preset. Alberta is absent from every
 * era roster; it exists only after a sovereignty referendum carries.
 */
export const AB_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": AB_1953,
  "1979-default": AB_1979,
  "1991-default": AB_1991,
  "1999-default": AB_1999,
  "2007-default": AB_2007,
  "2019-default": AB_2019,
  "2023-default": AB_2023,
  "2027-default": AB_2027,
};
