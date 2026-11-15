import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { JP_1953 } from "./1953";
import { JP_1979 } from "./1979";
import { JP_1991 } from "./1991";
import { JP_1999 } from "./1999";
import { JP_2007 } from "./2007";
import { JP_2019 } from "./2019";
import { JP_2023 } from "./2023";
import { JP_2027 } from "./2027";

/**
 * Every preset in SHIPPING_PRESETS needs an era override here;
 * contract.test.ts asserts the count so a new preset fails loudly.
 * Japan also has TWO config overrides (1953 and 1991): 1953 carries a full
 * 466/248 legislature, so both must be pinned by eraConfigOverrides.test.ts.
 */
export const JP_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": JP_1953,
  "1979-default": JP_1979,
  "1991-default": JP_1991,
  "1999-default": JP_1999,
  "2007-default": JP_2007,
  "2019-default": JP_2019,
  "2023-default": JP_2023,
  "2027-default": JP_2027,
};
