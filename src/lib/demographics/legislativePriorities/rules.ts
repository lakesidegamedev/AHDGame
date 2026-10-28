/**
 * Legislative priorities on the electorate board. resolveLegislativePriorities
 * combines authored group interests with regional emphasis and resolves one
 * primary and three secondary requests to exact law options, without vote effects.
 */
import { PRIORITY_COUNTRIES, type PriorityReference } from "./catalog";

export interface PriorityLaw {
  _id: string;
  countryScope?: string;
  name: string;
  policyOptions: readonly { id: string; name: string }[];
}

export interface LegislativePriority extends PriorityReference {
  lawName: string;
  policyOptionName: string;
}

export interface LegislativePriorities {
  primary: LegislativePriority;
  secondary: [LegislativePriority, LegislativePriority, LegislativePriority];
}

export interface LegislativePrioritySelection {
  primary: PriorityReference;
  secondary: [PriorityReference, PriorityReference, PriorityReference];
}

/** Only authored region/group targets can receive an admin override. */
export function isPriorityTarget(countryId: string, regionId: string, bucketId: string): boolean {
  const countryKey = countryId.toUpperCase();
  const config = PRIORITY_COUNTRIES[countryKey];
  const dimensions =
    countryKey === "US"
      ? ["race", "age", "education", "wealth"]
      : ["ethnicity", "age", "education", "income"];
  return Boolean(
    dimensions.includes(bucketId.split(":")[0]) &&
    config?.regions[regionId.toUpperCase()] &&
    config.groups[bucketId]
  );
}

/** Parse persisted content defensively; old or damaged records must not break a region page. */
export function parsePrioritySelection(value: unknown): LegislativePrioritySelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = value as Partial<LegislativePrioritySelection>;
  if (!Array.isArray(selection.secondary) || selection.secondary.length !== 3) return null;
  const references = [selection.primary, ...selection.secondary].map(
    (value): PriorityReference | null => {
      if (!value || typeof value !== "object") return null;
      const reference = value as Partial<PriorityReference>;
      if (
        typeof reference.lawTypeId !== "string" ||
        !reference.lawTypeId.length ||
        reference.lawTypeId.length > 128 ||
        typeof reference.policyOptionId !== "string" ||
        !reference.policyOptionId.length ||
        reference.policyOptionId.length > 128
      )
        return null;
      return { lawTypeId: reference.lawTypeId, policyOptionId: reference.policyOptionId };
    }
  );
  const [primary, first, second, third] = references;
  if (
    !primary ||
    !first ||
    !second ||
    !third ||
    new Set([primary, first, second, third].map((r) => r.lawTypeId)).size !== 4
  )
    return null;
  return { primary, secondary: [first, second, third] };
}

/** Resolve saved references against the actual country's catalog, rejecting malformed data or stale levels. */
export function resolvePrioritySelection(
  countryId: string,
  value: unknown,
  laws: ReadonlyMap<string, PriorityLaw>
): LegislativePriorities | null {
  const selection = parsePrioritySelection(value);
  if (!selection) return null;
  const references = [selection.primary, ...selection.secondary];
  const resolved = references.map((reference): LegislativePriority | null => {
    const law = laws.get(reference.lawTypeId);
    const option = law?.policyOptions.find((o) => o.id === reference.policyOptionId);
    if (!law || !option || law.countryScope?.toUpperCase() !== countryId.toUpperCase()) return null;
    return { ...reference, lawName: law.name, policyOptionName: option.name };
  });
  const [primary, first, second, third] = resolved;
  return primary && first && second && third
    ? { primary, secondary: [first, second, third] }
    : null;
}

/**
 * Regional first/second interests add four/two ranks to an existing group
 * interest. Ties keep the authored group order. No random, turn or live-policy
 * input: adopting a law does not silently replace the request with another one.
 * The injected catalog keeps the resolver usable outside the server process.
 */
export function resolveLegislativePriorities(
  countryId: string,
  regionId: string,
  bucketId: string,
  laws: ReadonlyMap<string, PriorityLaw>
): LegislativePriorities | null {
  const countryKey = countryId.toUpperCase();
  const config = PRIORITY_COUNTRIES[countryKey];
  const interests = config?.groups[bucketId];
  const regional = config?.regions[regionId.toUpperCase()];
  if (!config || !interests || !regional) return null;

  const ranked = interests
    .map((topic, index) => ({
      topic,
      index,
      rank: interests.length - index + (topic === regional[0] ? 4 : topic === regional[1] ? 2 : 0),
    }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index);

  const requests: LegislativePriority[] = [];
  const seen = new Set<string>();
  for (const { topic } of ranked) {
    const reference = config.topics[topic];
    const law = reference ? laws.get(reference.lawTypeId) : undefined;
    const option = law?.policyOptions.find((o) => o.id === reference?.policyOptionId);
    if (!reference || !law || !option || law.countryScope?.toUpperCase() !== countryKey) {
      throw new Error(`Invalid legislative priority: ${countryKey}/${bucketId}/${topic}`);
    }
    if (seen.has(law._id)) continue;
    seen.add(law._id);
    requests.push({ ...reference, lawName: law.name, policyOptionName: option.name });
    if (requests.length === 4) break;
  }
  const [primary, first, second, third] = requests;
  if (!primary || !first || !second || !third) {
    throw new Error(`Four distinct legislative priorities required: ${countryKey}/${bucketId}`);
  }
  return { primary, secondary: [first, second, third] };
}
