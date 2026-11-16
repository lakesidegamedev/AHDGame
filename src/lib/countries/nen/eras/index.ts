import type { ShippingPreset } from "@/lib/world/eraRoster";
import type { CountryEraOverride } from "../../contract";
import { NEN_1953 } from "./1953";
import { NEN_1979 } from "./1979";
import { NEN_1991 } from "./1991";
import { NEN_1999 } from "./1999";
import { NEN_2007 } from "./2007";
import { NEN_2019 } from "./2019";
import { NEN_2023 } from "./2023";
import { NEN_2027 } from "./2027";

/**
 * NEN's per-era overrides, one per shipping preset. New England is absent from every
 * era roster; it exists only after a sovereignty referendum carries.
 */
export const NEN_ERAS: Record<ShippingPreset, CountryEraOverride> = {
  "1953-default": NEN_1953,
  "1979-default": NEN_1979,
  "1991-default": NEN_1991,
  "1999-default": NEN_1999,
  "2007-default": NEN_2007,
  "2019-default": NEN_2019,
  "2023-default": NEN_2023,
  "2027-default": NEN_2027,
};
