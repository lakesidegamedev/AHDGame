import type { DriverDisplayInputs } from "@/lib/elections/computePersuasionDriverDisplay";
import type { PersuasionDriverCandidate } from "./PersuasionDrivers";

/** The parts of a race's full view the Persuasion Drivers card reads. */
export interface PersuasionDriverSource extends Omit<DriverDisplayInputs, "regByParty"> {
  allCandidates: ReadonlyArray<
    Omit<PersuasionDriverCandidate, "name" | "characterId"> & {
      characterId: string | null;
      characterName: string;
    }
  > | null;
  /** The race state's registration by party (the inputs' `regByParty`). */
  persuasionRegByParty?: Record<string, number>;
}

/**
 * The Persuasion Drivers card's props from a race's full view. Every field is
 * already on the client DTO (support is fogged server-side for viewers who may
 * not see it). Shared by the election page and Campaign Manager.
 */
export function persuasionDriverProps(e: PersuasionDriverSource): {
  candidates: PersuasionDriverCandidate[];
  inputs: DriverDisplayInputs;
} {
  return {
    candidates: (e.allCandidates ?? []).map((c) => ({
      id: c.id,
      characterId: c.characterId ?? "",
      name: c.characterName,
      party: c.party,
      partyColor: c.partyColor,
      partyEcon: c.partyEcon,
      partySocial: c.partySocial,
      economicPosition: c.economicPosition,
      socialPosition: c.socialPosition,
      favorability: c.favorability,
      politicalInfluence: c.politicalInfluence,
      nationalInfluence: c.nationalInfluence,
      isNPP: c.isNPP,
      sharePct: c.sharePct,
      support: c.support,
    })),
    inputs: {
      fundsByParty: e.fundsByParty,
      incumbentSeatShareByParty: e.incumbentSeatShareByParty,
      regByParty: e.persuasionRegByParty,
      medianVoter: e.medianVoter,
      presidentialCoattailPctByParty: e.presidentialCoattailPctByParty,
      gubernatorialCoattailPctByParty: e.gubernatorialCoattailPctByParty,
      midtermOppositionBoostPctByParty: e.midtermOppositionBoostPctByParty,
      incumbentPartyId: e.incumbentPartyId,
      incumbentApproval: e.incumbentApproval,
      legislativeIncumbentPartyId: e.legislativeIncumbentPartyId,
      legislativeIncumbentTenureTerms: e.legislativeIncumbentTenureTerms,
    },
  };
}
