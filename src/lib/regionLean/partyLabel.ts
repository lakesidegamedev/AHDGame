import { getDisplayLean } from "@/lib/utils/demographics";
import { getEconomicPositionName } from "@/lib/utils/politics";
import { pickMainParties, regionLeanVerdict, type MainParties, type PartyPlatform } from "./rules";

/** The party fields the label needs, as served by the parties API and the parties collection. */
export interface PartyLabelSource {
  id: string;
  name: string;
  abbreviation?: string;
  economicPosition?: number | null;
  socialPosition?: number | null;
  isDefault?: boolean;
  memberCount?: number;
}

export function mainPartiesFor(parties: readonly PartyLabelSource[]): MainParties | null {
  const platforms: PartyPlatform[] = parties.flatMap((p) =>
    p.economicPosition == null || p.socialPosition == null
      ? []
      : [
          {
            id: p.id,
            name: p.name,
            abbreviation: p.abbreviation,
            lean: getDisplayLean(p.economicPosition, p.socialPosition),
            isDefault: p.isDefault,
            memberCount: p.memberCount,
          },
        ]
  );
  return pickMainParties(platforms);
}

/**
 * Label for a region's electorate by which main party it favours and how
 * strongly. Without two usable parties it falls back to the ideology ruler.
 */
export function regionLeanLabel(displayLean: number, main: MainParties | null): string {
  return main ? regionLeanVerdict(displayLean, main).label : getEconomicPositionName(displayLean);
}
