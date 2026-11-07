import type { CountryId } from "@/lib/constants/countries";
import { DE_COALITION_REFUSALS_2027 } from "@/lib/countries/de/data/deCoalitionRefusals";
import type { CoalitionRefusalSeed } from "./rules/coalitionRefusals";

/** Authored coalition refusals by preset and country. */
const COALITION_REFUSAL_SEEDS: Readonly<
  Record<string, Partial<Record<CountryId, readonly CoalitionRefusalSeed[]>>>
> = {
  "2027-default": { DE: DE_COALITION_REFUSALS_2027 },
};

export function coalitionRefusalSeedsFor(
  preset: string | undefined,
  countryId: CountryId
): readonly CoalitionRefusalSeed[] {
  return (preset && COALITION_REFUSAL_SEEDS[preset]?.[countryId]) || [];
}
