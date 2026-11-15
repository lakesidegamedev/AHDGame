import { canPartyFieldInState } from "@/lib/turn/nppEntryLogic";

/** Each concurrent race needs a distinct unseated actor, not one actor per seat. */
export function planCaElectionBench(input: {
  preset: string;
  startingPartiesMode?: string;
  regionalRaceCount: number;
  regions: readonly { _id: string; countryId: string }[];
  parties: readonly { sequentialId: number; countryId?: string; isDefault?: boolean }[];
  orgs: readonly { countryId?: string; stateId: string; partyId: string; hasPresence?: boolean }[];
  actors: readonly {
    id: string;
    countryId?: string;
    party: string;
    homeState?: string;
    retired: boolean;
    isTechnocrat?: boolean;
  }[];
  busyActorIds: ReadonlySet<string>;
  filedSlots?: readonly { regionId: string; partyId: string; electionType: string }[];
}): Array<{ regionId: string; partyId: string; count: number }> {
  if (input.preset !== "2027-default" || (input.startingPartiesMode ?? "default") !== "default")
    return [];
  if (!Number.isSafeInteger(input.regionalRaceCount) || input.regionalRaceCount < 1)
    throw new Error("Canadian regional race count must be positive");
  const orgs = input.orgs.filter((org) => org.countryId === "CA");
  const slots: Array<{ regionId: string; partyId: string; count: number }> = [];
  for (const region of input.regions.filter((row) => row.countryId === "CA")) {
    for (const party of input.parties.filter((row) => row.countryId === "CA" && row.isDefault)) {
      const partyId = String(party.sequentialId);
      if (!Number.isSafeInteger(party.sequentialId)) throw new Error("Invalid Canadian party id");
      if (
        !canPartyFieldInState(
          orgs.find((org) => org.stateId === region._id && org.partyId === partyId),
          orgs.some((org) => org.stateId === region._id),
          partyId
        )
      )
        continue;
      const available = input.actors.filter(
        (actor) =>
          actor.countryId === "CA" &&
          actor.homeState === region._id &&
          actor.party === partyId &&
          !actor.retired &&
          !actor.isTechnocrat &&
          !input.busyActorIds.has(actor.id)
      ).length;
      const covered = new Set(
        input.filedSlots
          ?.filter((slot) => slot.regionId === region._id && slot.partyId === partyId)
          .map((slot) => slot.electionType)
      ).size;
      const count = Math.max(0, input.regionalRaceCount - covered - available);
      if (count) slots.push({ regionId: region._id, partyId, count });
    }
  }
  return slots;
}
