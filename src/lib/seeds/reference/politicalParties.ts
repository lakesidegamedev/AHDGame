import type { PoliticalParty } from "@/lib/db/types";

/**
 * Party seed data type - excludes fields generated at insert time.
 * seedOrder determines the sequentialId assignment order.
 */
export type PartySeed = Omit<PoliticalParty, "_id" | "sequentialId" | "createdAt" | "updatedAt"> & {
  seedOrder: number;
  /**
   * When set, this party is only seeded for the listed preset IDs. When omitted,
   * the party is preset-agnostic. `ensureDefaultParties`, `seedUKParties` and
   * `resetGameWorld` all filter on this field.
   */
  validForPresets?: string[];
};

/**
 * The United States' default parties.
 *
 * ⚠️ A FORWARDER, NOT A COPY. The rows now live in
 * `@/lib/countries/us/data/usParties`, beside every other country's roster.
 * This export stays so the wiki dashboard and `finalizeResetGameWorld` are
 * untouched, and because dropping it would silently remove the US default
 * parties from a reset.
 *
 * ⚠️ `PartySeed` ABOVE IS SHARED AND STAYS HERE. Every country's roster
 * imports it, including `jp/data/jpParties.ts`. Moving the TYPE into one
 * country's folder would make 23 other countries depend on the United States
 * to describe a party, which is the mixing this split exists to undo.
 */
export { usParties as politicalParties } from "@/lib/countries/us/data/usParties";
