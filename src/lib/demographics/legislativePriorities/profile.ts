/**
 * Legislative wants on regional electorate profiles. withLegislativePriorities
 * adds catalog-backed requests for the strategy board at page load only;
 * electoral calculations and the hourly turn do not consume these requests.
 */
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import type { BucketProfileSection } from "../bucketProfile";
import { resolveLegislativePriorities, type PriorityContext, type PriorityLaw } from "./rules";

// Only serializable names and references cross the page's client boundary.
// Keep the consolidated seed catalog out of the client and turn import graphs.
const priorityLaws: ReadonlyMap<string, PriorityLaw> = new Map(
  legislationTypes.map((law) => [
    law._id,
    {
      _id: law._id,
      countryScope: law.countryScope,
      name: law.name,
      policyOptions: (law.policyOptions ?? []).map(({ id, name }) => ({ id, name })),
    },
  ])
);

export function getDefaultLegislativePriorities(
  countryId: string,
  regionId: string,
  bucketId: string,
  context?: PriorityContext
) {
  return resolveLegislativePriorities(countryId, regionId, bucketId, priorityLaws, context);
}

export function withLegislativePriorities(
  profile: BucketProfileSection[] | null,
  countryId: string,
  regionId: string,
  year?: number | null
): BucketProfileSection[] | null {
  return (
    profile?.map((section) => ({
      ...section,
      buckets: section.buckets.map((bucket) => ({
        ...bucket,
        legislativePriorities: getDefaultLegislativePriorities(countryId, regionId, bucket.id, {
          year,
          economicLean: bucket.economicLean,
          socialLean: bucket.socialLean,
        }),
      })),
    })) ?? null
  );
}
