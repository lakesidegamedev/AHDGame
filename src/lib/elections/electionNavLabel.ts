import { displayCanadianRegionCode } from "@/lib/countries/ca/regionCodes";

export function electionNavLabel(
  typeLabel: string,
  election: { electionType: string; state?: string | null }
): string {
  const national = ["president", "special_president", "primeMinister", "uachtaran"].includes(
    election.electionType
  );
  return `${typeLabel} · ${national ? "National" : displayCanadianRegionCode(election.state)}`;
}
