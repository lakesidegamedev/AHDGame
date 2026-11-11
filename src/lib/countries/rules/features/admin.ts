/** Single-country features used by the admin area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const ADMIN_FEATURES = {
  bgAdmin: ["BG"],
  cnAdmin: ["CN"],
  ddAdmin: ["DD"],
  deAdmin: ["DE"],
  ieAdmin: ["IE"],
  plAdmin: ["PL"],
  roAdmin: ["RO"],
  ruAdmin: ["RU"],
  ukAdmin: ["UK"],
  usAdmin: ["US"],
  yuAdmin: ["YU"],
} as const satisfies Record<string, readonly CountryId[]>;
