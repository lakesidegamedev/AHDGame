import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { CA_1953 } from "./1953";
import { CA_1979 } from "./1979";
import { CA_1991 } from "./1991";
import { CA_1999 } from "./1999";
import { CA_2007 } from "./2007";
import { CA_2019 } from "./2019";
import { CA_2023 } from "./2023";
import { CA_2027 } from "./2027";

/**
 * CA's per-era overrides, one per shipping preset. Canada is authored for the
 * 2027 world; every other era declares no override and the era roster marks the
 * country absent there.
 */
export const CA_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": CA_1953,
  "1979-default": CA_1979,
  "1991-default": CA_1991,
  "1999-default": CA_1999,
  "2007-default": CA_2007,
  "2019-default": CA_2019,
  "2023-default": CA_2023,
  "2027-default": CA_2027,
};
