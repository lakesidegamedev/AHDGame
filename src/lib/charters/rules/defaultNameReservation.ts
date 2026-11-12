import { supportsNoStartingParties } from "@/lib/admin/startingPartiesPresets";

/** Empty player starts let founders create the reserved default party identities. */
export function retainsDefaultPartyNameReservation(input: {
  preset?: string;
  startingPartiesMode?: string;
  playerCountry: boolean;
}): boolean {
  return !(
    supportsNoStartingParties(input.preset) &&
    input.startingPartiesMode === "none" &&
    input.playerCountry
  );
}
