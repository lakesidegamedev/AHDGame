import { presetUsesDemographicPaths } from "@/lib/demographics/rules/demographicPaths";

/** The society pressures ship with the 2027 world's demography paths and nowhere else. */
export function presetUsesSocietyPressures(preset: string | undefined): boolean {
  return presetUsesDemographicPaths(preset);
}
