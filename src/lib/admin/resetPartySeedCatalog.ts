import type { PartySeed } from "@/lib/seeds/reference/politicalParties";

/**
 * Every authored default-party seed the reset's era cleanup judges against.
 *
 * A party is removed as preset-mismatched only when NO seed active in the new
 * preset carries its name, so every roster bootstrap can seed must be listed
 * here. The 1991 successor rosters and the 2019 rosters were missing: Bulgaria's
 * Movement for Rights and Freedoms, seeded for 1991 by the successor roster,
 * shares its name with a 2027-only seed and was deleted on every 1991 reset.
 */
export async function loadResetPartySeedCatalog(): Promise<PartySeed[]> {
  const { ukParties } = await import("@/lib/seeds/uk/ukParties");
  const { politicalParties: usParties } = await import("@/lib/seeds/reference/politicalParties");
  const { deParties } = await import("@/lib/seeds/de/deParties");
  const { jpParties } = await import("@/lib/countries/jp/data/jpParties");
  const { brParties } = await import("@/lib/seeds/br/brParties");
  const { ieParties } = await import("@/lib/seeds/ie/ieParties");
  const { frParties } = await import("@/lib/seeds/fr/frParties");
  const { itParties } = await import("@/lib/seeds/it/itParties");
  const { esParties } = await import("@/lib/seeds/es/esParties");
  const { seParties } = await import("@/lib/seeds/se/seParties");
  const { trParties } = await import("@/lib/seeds/tr/trParties");
  const { huParties } = await import("@/lib/seeds/hu/huParties");
  const { roParties } = await import("@/lib/seeds/ro/roParties");
  const { ngParties } = await import("@/lib/seeds/ng/ngParties");
  const { ruParties } = await import("@/lib/seeds/ru/ruParties");
  const { ddParties } = await import("@/lib/seeds/dd/ddParties");
  const { plParties } = await import("@/lib/seeds/pl/plParties");
  const { yuParties } = await import("@/lib/seeds/yu/yuParties");
  const { csParties } = await import("@/lib/seeds/cs/csParties");
  const { bgParties } = await import("@/lib/seeds/bg/bgParties");
  const { blrParties } = await import("@/lib/seeds/blr/blrParties");
  const { balParties } = await import("@/lib/seeds/bal/balParties");
  const { SUCCESSOR_PARTIES_1991 } = await import("@/lib/seeds/reference/successorParties1991");
  const { PARTY_ROSTERS_2019 } = await import("@/lib/seeds/partyRosters2019");
  return [
    ...usParties,
    ...ukParties,
    ...deParties,
    ...jpParties,
    ...brParties,
    ...ieParties,
    ...frParties,
    ...itParties,
    ...esParties,
    ...seParties,
    ...trParties,
    ...huParties,
    ...roParties,
    ...ngParties,
    ...ruParties,
    ...ddParties,
    ...plParties,
    ...yuParties,
    ...csParties,
    ...bgParties,
    ...blrParties,
    ...balParties,
    ...Object.values(SUCCESSOR_PARTIES_1991).flat(),
    ...Object.values(PARTY_ROSTERS_2019).flat(),
  ];
}
