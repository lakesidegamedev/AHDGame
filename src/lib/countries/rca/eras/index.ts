import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { RCA_1953 } from "./1953";
import { RCA_1979 } from "./1979";
import { RCA_1991 } from "./1991";
import { RCA_1999 } from "./1999";
import { RCA_2007 } from "./2007";
import { RCA_2019 } from "./2019";
import { RCA_2023 } from "./2023";
import { RCA_2027 } from "./2027";

/**
 * RCA's per-era overrides, one per shipping preset. California is absent from every
 * era roster; it exists only after a sovereignty referendum carries.
 */
export const RCA_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": RCA_1953,
  "1979-default": RCA_1979,
  "1991-default": RCA_1991,
  "1999-default": RCA_1999,
  "2007-default": RCA_2007,
  "2019-default": RCA_2019,
  "2023-default": RCA_2023,
  "2027-default": RCA_2027,
};
