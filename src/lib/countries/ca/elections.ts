import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";
import type { CountryElections } from "../contract";
import { CA_COMMONS_SEATS_PER_REGION, CA_SENATE_SEATS_PER_REGION } from "./data/caRegions2027";

const sum = (table: Readonly<Record<string, number>>): number =>
  Object.values(table).reduce((a, b) => a + b, 0);

/** Default parties that seed as Major; every other default party seeds Minor. */
const majorDefaultParties: MajorDefaultParty[] = [{ abbr: "FUP" }, { abbr: "NPA" }];

/**
 * Canada's elections.
 *
 * Totals are summed from the tables, not declared as constants, so a ridings
 * change cannot leave a second figure behind. The election spawners and turn
 * phases are added with the parliament and election machinery.
 */
export const CA_ELECTIONS: CountryElections = {
  majorDefaultParties,
  seats: {
    byChamber: {
      caCommons: CA_COMMONS_SEATS_PER_REGION,
      caSenate: CA_SENATE_SEATS_PER_REGION,
    },
    totals: {
      caCommons: sum(CA_COMMONS_SEATS_PER_REGION),
      caSenate: sum(CA_SENATE_SEATS_PER_REGION),
    },
  },
};
