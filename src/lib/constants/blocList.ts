/**
 * National Front bloc-list quotas.
 *
 * WHAT A BLOC-LIST ELECTION IS. Several one-party states did not contest
 * between parties. They ran a SINGLE list, agreed in advance, with each
 * participating party holding a fixed seat quota, and the electorate voted the
 * list up or down. The DDR's National Front is the type specimen: 1954
 * Volkskammer, 466 seats on one list, 99.46% of the vote, seat split a
 * negotiated allocation rather than an outcome.
 *
 * WHY A QUOTA RATHER THAN A VOTE MULTIPLIER. Proportional PR with the ruling
 * party's vote multiplier (3.0) against the bloc parties' 0.375 fails because
 * the multiplier is one factor among policy-distance appeal, party fit,
 * regional bases and group favourability, and the appeal term swings far wider
 * than 8x. The ruling party of a one-party state could rank third and hand the
 * largest delegation to a bloc party. Raising the multiplier only moves the
 * threshold; the multiplier is the wrong instrument for a chamber whose seats
 * were never contested between parties.
 *
 * Under a quota the party split is not an outcome of the vote, so candidate
 * positioning cannot game it. The vote decides WHO fills each party's slots,
 * which is the contest DDR politics actually had.
 *
 * MASS ORGANISATIONS. The game models five DD parties and no mass
 * organisations, so the 141 seats held by the FDGB, DFD, FDJ, Kulturbund and
 * VdgB fold into the SED, where their political control sat: all five were
 * SED-run transmission belts whose delegations voted with the party. That gives
 * SED 25.1% nominal + 30.3% organisational = 55.4%, leaving each bloc party on
 * its historical 11.2%. Rounded to 55 / 11.25 x 4, summing to 100 exactly.
 *
 * Giving the SED only its nominal 25% would model the institution and lose the
 * politics: a ruling party without a working majority in its own rubber-stamp
 * parliament cannot govern, and the DDR's SED plainly could.
 */

import type { CountryId, GovernmentType } from "./countries";

export interface BlocListQuota {
  /** Display name of the alliance, for UI copy. */
  label: string;
  /**
   * Party `sequentialId` (as a string, matching `ElectionCandidate.party`)
   * mapped to its share of the chamber. Values are weights and are normalised,
   * so they do not have to sum to 100.
   */
  shares: Readonly<Record<string, number>>;
}

/**
 * Per-country bloc-list quotas. A country absent from this map resolves its
 * elections normally, so this is inert for every country but the DDR today.
 *
 * DD party sequentialIds: 1 SED, 2 CDU, 3 LDPD, 4 NDPD, 5 DBD.
 */
export const BLOC_LIST_QUOTAS: Partial<Record<CountryId, BlocListQuota>> = {
  DD: {
    label: "National Front",
    shares: {
      "1": 55, // SED, including the mass organisations it controlled
      "2": 11.25, // CDU
      "3": 11.25, // LDPD
      "4": 11.25, // NDPD
      "5": 11.25, // DBD
    },
  },
};

/** The bloc-list quota for a country, or null when it holds ordinary elections. */
export function blocListQuota(countryId: string | null | undefined): BlocListQuota | null {
  if (!countryId) return null;
  return BLOC_LIST_QUOTAS[countryId as CountryId] ?? null;
}

/** True when the country allocates legislative seats by bloc-list quota. */
export function isBlocListCountry(countryId: string | null | undefined): boolean {
  return blocListQuota(countryId) !== null;
}

/**
 * Runtime quota for an election. A country keeps its historical quota config,
 * but a democratic regime conversion must immediately switch its elections to
 * ordinary allocation.
 */
export function blocListQuotaForGovernment(
  countryId: string | null | undefined,
  governmentType: GovernmentType | null | undefined
): BlocListQuota | null {
  return governmentType === "onePartyState" ? blocListQuota(countryId) : null;
}
