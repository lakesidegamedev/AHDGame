/** Game-calibrated v2 political positions, shared by previews, voting and enactment. */
import { bucketAffinitiesFor } from "@/lib/bucketAffinities";
import type { LawChoice } from "./eligibility";
import type { PolicyDomain } from "@/lib/policyShiftImpacts";
import { familyApprovalAffinities } from "./voterApprovalProfiles";

type Axis = "economic" | "social";
interface PoliticalRoute {
  axis: Axis;
  domain: PolicyDomain;
  fallbackDomain?: PolicyDomain;
}

// Explicit family coverage: do not send an unfamiliar family to an economic default.
export const V2_POLITICAL_ROUTES: Readonly<Record<string, PoliticalRoute>> = {
  L01: { axis: "economic", domain: "welfare" },
  L02: { axis: "economic", domain: "welfare" },
  L03: { axis: "economic", domain: "economic" },
  L04: { axis: "economic", domain: "economic" },
  L05: { axis: "economic", domain: "economic" },
  L06: { axis: "economic", domain: "economic" },
  L07: { axis: "economic", domain: "economic" },
  L08: { axis: "economic", domain: "economic" },
  L09: { axis: "economic", domain: "economic" },
  L10: { axis: "economic", domain: "education" },
  L11: { axis: "economic", domain: "education" },
  L12: { axis: "social", domain: "education" },
  L13: { axis: "economic", domain: "education" },
  L14: { axis: "economic", domain: "education" },
  L15: { axis: "economic", domain: "technology", fallbackDomain: "education" },
  L16: { axis: "economic", domain: "healthcare" },
  L17: { axis: "economic", domain: "healthcare" },
  L18: { axis: "economic", domain: "healthcare" },
  L19: { axis: "economic", domain: "healthcare" },
  L20: { axis: "economic", domain: "healthcare" },
  L21: { axis: "economic", domain: "healthcare" },
  L22: { axis: "economic", domain: "infrastructure" },
  L23: { axis: "economic", domain: "welfare" },
  L24: { axis: "economic", domain: "welfare" },
  L25: { axis: "economic", domain: "infrastructure" },
  L26: { axis: "economic", domain: "infrastructure" },
  L27: { axis: "economic", domain: "infrastructure" },
  L28: { axis: "economic", domain: "infrastructure" },
  L29: { axis: "economic", domain: "infrastructure" },
  L30: { axis: "economic", domain: "environment" },
  L31: { axis: "economic", domain: "environment" },
  L32: { axis: "economic", domain: "environment" },
  L33: { axis: "economic", domain: "environment" },
  L34: { axis: "social", domain: "criminal_justice" },
  L35: { axis: "social", domain: "criminal_justice" },
  L36: { axis: "social", domain: "criminal_justice" },
  L37: { axis: "economic", domain: "agriculture", fallbackDomain: "economic" },
  L38: { axis: "economic", domain: "welfare" },
  L39: { axis: "social", domain: "immigration" },
  L40: { axis: "social", domain: "welfare" },
  L41: { axis: "social", domain: "governance" },
  L42: { axis: "economic", domain: "infrastructure" },
  L43: { axis: "social", domain: "governance" },
  L44: { axis: "social", domain: "governance" },
  L45: { axis: "social", domain: "governance" },
  L46: { axis: "social", domain: "governance" },
  L47: { axis: "social", domain: "mediaInformation" },
  L48: { axis: "economic", domain: "economic" },
  L49: { axis: "social", domain: "immigration" },
  L50: { axis: "social", domain: "criminal_justice" },
  L51: { axis: "social", domain: "healthcare" },
  L52: { axis: "economic", domain: "immigration" },
};

const CHOICES = ["far_left", "center_left", "center", "center_right", "far_right"] as const;
const SCORES = [-5, -2.5, 0, 2.5, 5];

export interface V2PoliticalProvision {
  familyId: string;
  choice: LawChoice;
  currentChoiceSnapshot: LawChoice;
}

/** Federalism is not an ideology rung; leave_to_states has no invented axis position. */
export function v2VotePosition(
  provision: Pick<V2PoliticalProvision, "familyId" | "choice">
): { economic?: number; social?: number; includeNeutral: true } | null {
  const route = V2_POLITICAL_ROUTES[provision.familyId];
  const index = CHOICES.findIndex((choice) => choice === provision.choice);
  return route && index >= 0 ? { [route.axis]: SCORES[index], includeNeutral: true } : null;
}

/** Maximum combined cell approval change for one full left-to-right family change.
 * Dimension maxima, rather than individual buckets, bound overlapping identities.
 */
export const V2_FAMILY_APPROVAL_SPAN = 4;

/** Successor countries retain the UK census bucket vocabulary. */
export function voterAffinityCountry(countryId: string): string {
  return countryId === "SCO" || countryId === "WAL" ? "UK" : countryId;
}

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
          (((SCORES[index]! / 10) * V2_FAMILY_APPROVAL_SPAN * preference) / normalization) * 100
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
