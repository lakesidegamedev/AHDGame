/** Game-calibrated v2 political positions, shared by previews, voting and enactment. */
import { bucketAffinitiesFor } from "@/lib/bucketAffinities";
import { familyApprovalAffinities } from "./voterApprovalProfiles";

import {
  V2_POLITICAL_ROUTES,
  v2VotePosition,
  type V2PoliticalProvision,
} from "./politicalPositions";
export {
  V2_POLITICAL_ROUTES,
  v2VotePosition,
  type V2PoliticalProvision,
} from "./politicalPositions";

/** Maximum combined cell approval change for one full left-to-right family change.
 * Dimension maxima, rather than individual buckets, bound overlapping identities.
 */
export const V2_FAMILY_APPROVAL_SPAN = 4;

/** Successor countries retain the UK census bucket vocabulary. */
export function voterAffinityCountry(countryId: string): string {
  return countryId === "SCO" || countryId === "WAL" ? "UK" : countryId;
}

const CHOICES = ["far_left", "center_left", "center", "center_right", "far_right"] as const;

/** Endpoint potentials telescope: reversing or splitting a policy move cannot farm rewards. */
export function v2EnactmentApproval(
  provisions: readonly V2PoliticalProvision[],
  countryId: string
): Record<string, number> {
  const cents: Record<string, number> = {};
  const affinityCountry = voterAffinityCountry(countryId);
  for (const provision of provisions) {
    const route = V2_POLITICAL_ROUTES[provision.familyId];
    const before = CHOICES.findIndex((choice) => choice === provision.currentChoiceSnapshot);
    const after = CHOICES.findIndex((choice) => choice === provision.choice);
    if (!route || before < 0 || after < 0) continue;
    const domain =
      route.fallbackDomain &&
      !Object.keys(bucketAffinitiesFor(affinityCountry, route.domain)).length
        ? route.fallbackDomain
        : route.domain;
    const affinities = familyApprovalAffinities(
      provision.familyId,
      bucketAffinitiesFor(affinityCountry, domain)
    );
    const dimensionMaxima: Record<string, number> = {};
    for (const [bucket, preference] of Object.entries(affinities)) {
      const dimension = bucket.split(":", 1)[0]!;
      dimensionMaxima[dimension] = Math.max(dimensionMaxima[dimension] ?? 0, Math.abs(preference));
    }
    const normalization = Object.values(dimensionMaxima).reduce((sum, value) => sum + value, 0);
    if (!normalization) continue;
    for (const [bucket, preference] of Object.entries(affinities)) {
      const potential = (index: number) =>
        Math.trunc(
          ((((v2VotePosition({ familyId: provision.familyId, choice: CHOICES[index]! })?.[
            route.axis
          ] ?? 0) /
            10) *
            V2_FAMILY_APPROVAL_SPAN *
            preference) /
            normalization) *
            100
        );
      const change = potential(after) - potential(before);
      cents[bucket] = (cents[bucket] ?? 0) + change;
    }
  }
  return Object.fromEntries(
    Object.entries(cents)
      .filter(([, value]) => value !== 0)
      .map(([bucket, value]) => [bucket, value / 100])
  );
}

/** Rate percentages, not proposal ideology or rounded option indexes. */
export function corporateTaxApproval(
  currentRate: number,
  proposedRate: number,
  incomeDimension: "income" | "wealth"
): Record<string, number> {
  if (
    ![currentRate, proposedRate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)
  )
    throw new RangeError("Invalid corporate tax rate");
  const slopes = { low: 0.1, middle: 0.08, high: -0.12 };
  return Object.fromEntries(
    Object.entries(slopes).flatMap(([tier, slope]) => {
      const change =
        (Math.round(proposedRate * slope * 100) - Math.round(currentRate * slope * 100)) / 100;
      return change ? [[`${incomeDimension}:${tier}`, change]] : [];
    })
  );
}

/** Income vocabularies follow the country's census model, including successor countries. */
export function corporateTaxApprovalForCountry(
  currentRate: number,
  proposedRate: number,
  countryId: string
): Record<string, number> {
  const dimension = Object.keys(
    bucketAffinitiesFor(voterAffinityCountry(countryId), "economic")
  ).some((key) => key.startsWith("wealth:"))
    ? "wealth"
    : "income";
  return corporateTaxApproval(currentRate, proposedRate, dimension);
}

export type VoterChoice = "for" | "against" | "abstain";

/** One reaction per identity; a later chamber/override ballot supersedes an earlier one. */
export function finalV2Voters(
  maps: readonly (Record<string, VoterChoice> | undefined)[]
): Array<{ id: string; kind: "character" | "npp"; vote: "for" | "against" }> {
  const votes = new Map<string, VoterChoice>();
  for (const map of maps)
    for (const [key, vote] of Object.entries(map ?? {})) votes.set(key.toLowerCase(), vote);
  return [...votes].flatMap(([key, vote]) => {
    const npp = key.startsWith("npp_");
    const id = npp ? key.slice(4) : key;
    return /^[a-f0-9]{24}$/.test(id) && (vote === "for" || vote === "against")
      ? [{ id, kind: npp ? ("npp" as const) : ("character" as const), vote }]
      : [];
  });
}
