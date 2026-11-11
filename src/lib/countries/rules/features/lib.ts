/** Single-country features used by the lib area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const LIB_FEATURES = {
  bgLib: ["BG"],
  brLib: ["BR"],
  cnLib: ["CN"],
  ddLib: ["DD"],
  deLib: ["DE"],
  grLib: ["GR"],
  huLib: ["HU"],
  ieLib: ["IE"],
  jpLib: ["JP"],
  ngLib: ["NG"],
  plLib: ["PL"],
  roLib: ["RO"],
  ruLib: ["RU"],
  scoLib: ["SCO"],
  seLib: ["SE"],
  trLib: ["TR"],
  ukLib: ["UK"],
  usLib: ["US"],
  walLib: ["WAL"],
  yuLib: ["YU"],
} as const satisfies Record<string, readonly CountryId[]>;
