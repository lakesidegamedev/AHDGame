import type { PartySeed } from "@/lib/seeds/reference/politicalParties";

/** Every authored party roster participates in reset cleanup and seed restoration. */
export async function loadResetPartySeedCatalog(): Promise<PartySeed[]> {
  const { PARTY_SEED_MODULES } = await import("@/lib/seeds/partySeedRegistry");
  const { SUCCESSOR_PARTIES_1991 } = await import("@/lib/seeds/reference/successorParties1991");
  const { PARTY_ROSTERS_2019 } = await import("@/lib/seeds/partyRosters2019");
  return [
    ...Object.values(PARTY_SEED_MODULES).flatMap((seeds) => seeds ?? []),
    ...Object.values(SUCCESSOR_PARTIES_1991).flat(),
    ...Object.values(PARTY_ROSTERS_2019).flat(),
  ];
}
