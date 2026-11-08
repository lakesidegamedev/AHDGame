import { US_DOMAIN_BUCKET_AFFINITIES } from "@/lib/countries/us/data/usBucketAffinities";
import { UK_DOMAIN_BUCKET_AFFINITIES } from "@/lib/countries/uk/data/ukBucketAffinities";
import { IE_DOMAIN_BUCKET_AFFINITIES } from "@/lib/countries/ie/data/ieBucketAffinities";
import { JP_DOMAIN_BUCKET_AFFINITIES } from "@/lib/countries/jp/data/jpBucketAffinities";
import { DE_DOMAIN_BUCKET_AFFINITIES } from "@/lib/countries/de/data/deBucketAffinities";
import { CN_DOMAIN_BUCKET_AFFINITIES } from "@/lib/countries/cn/data/cnBucketAffinities";
/**
 * Domain affinities in the Layer-1 census-bucket vocabulary.
 *
 * How each bucket of voters reacts to a RIGHTWARD policy shift in a domain.
 * Positive = likes rightward shifts, negative = likes leftward, magnitude = how
 * much that bucket cares. At bill enactment:
 *
 *     impact = (newPosition - oldPosition) x affinity x SHIFT_IMPACT_SCALE
 *
 * Buckets are the unit the vote engine counts; archetypes were an authoring
 * format that had to be projected onto buckets at read time, and an archetype
 * with no mapping silently vanished.
 *
 * Tuning notes:
 * - Where two archetypes shared a bucket, their affinities SUMMED, so a bucket
 *   can carry more weight than any single archetype did.
 * - Buckets are not mutually exclusive: a cell picks up the sum of every bucket
 *   it matches, one per dimension.
 *
 * This file is now hand-edited and is the source of truth.
 */

/** Per-country, per-domain bucket affinities. Countries absent fall back to US. */
export const DOMAIN_BUCKET_AFFINITIES: Record<string, Record<string, Record<string, number>>> = {
  US: US_DOMAIN_BUCKET_AFFINITIES,
  UK: UK_DOMAIN_BUCKET_AFFINITIES,
  IE: IE_DOMAIN_BUCKET_AFFINITIES,
  JP: JP_DOMAIN_BUCKET_AFFINITIES,
  DE: DE_DOMAIN_BUCKET_AFFINITIES,
  CN: CN_DOMAIN_BUCKET_AFFINITIES,
};

/**
 * Bucket affinities for a country + domain, falling back to the US table.
 *
 * The fallback is the historical behaviour and is deliberately kept: a country
 * with no table of its own gets approximate effects rather than none, and
 * "none" is the failure mode that is invisible.
 */
export function bucketAffinitiesFor(
  countryId: string | undefined,
  domain: string
): Record<string, number> {
  const table = countryId ? DOMAIN_BUCKET_AFFINITIES[countryId.toUpperCase()] : undefined;
  return (
    (table ?? DOMAIN_BUCKET_AFFINITIES.US)[domain] ?? DOMAIN_BUCKET_AFFINITIES.US[domain] ?? {}
  );
}
