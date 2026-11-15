/** Frozen reset law-family text. This data is not an enactable price list. */
import catalog from "./familyCatalog.json";
import {
  CA_V2_NATIONAL_FAMILIES,
  CA_V2_REGIONAL_FAMILIES,
} from "@/lib/countries/ca/data/caV2Jurisdictions";

export type LegislativePosition =
  "far_left" | "center_left" | "center" | "center_right" | "far_right";

export interface LawLevelDefinition {
  position: LegislativePosition;
  title: string;
  description: string;
}

export interface LawFamilyDefinition {
  id: string;
  title: string;
  domain: string;
  scope: string;
  ownerCode: string;
  primaryMetricIds: readonly string[];
  availability: { national: readonly string[]; regional: readonly string[] };
  leaveToStates: boolean;
  review: {
    legalComponents: "required";
    allocation: "required";
    outcomeCalibration: "required";
  };
  levels: readonly LawLevelDefinition[];
}

export const resetLawFamilies: readonly LawFamilyDefinition[] = (
  catalog as LawFamilyDefinition[]
).map((family) => ({
  ...family,
  availability: {
    national: [
      ...family.availability.national,
      ...(family.availability.national.includes("UK") ? ["IE", "SCO", "WAL"] : []),
      ...(CA_V2_NATIONAL_FAMILIES.includes(family.id) ? ["CA"] : []),
    ],
    regional: [
      ...family.availability.regional,
      ...(family.availability.regional.includes("UK") ? ["IE", "SCO", "WAL"] : []),
      ...(CA_V2_REGIONAL_FAMILIES.includes(family.id) ? ["CA"] : []),
    ],
  },
}));

export function resetLawFamilyById(id: string): LawFamilyDefinition | undefined {
  return resetLawFamilies.find((family) => family.id === id);
}

/** This is a separate federalism choice, not the center or a sixth ideology rung. */
export function leaveToStatesOption(
  family: LawFamilyDefinition
): { title: string; description: string } | null {
  if (!family.leaveToStates) return null;
  return {
    title: "Leave it to the States",
    description:
      "Wind down the eligible federal program after valid obligations. Existing state laws remain. States receive no automatic funding or outcome boost.",
  };
}
