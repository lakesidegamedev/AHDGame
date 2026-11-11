/**
 * Turn shell for cyber resilience: loads the three inputs for a set of countries and
 * hands plain numbers to `rules.ts`. Three reads in total, whatever the country count.
 */
import type { Db } from "mongodb";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import { MODERN_ERA_LEGISLATURE_SPECS } from "@/lib/seeds/shared/modernEraLegislation";
import {
  cyberResilienceScore,
  mandateIndexForLevel,
  mandateIndexForSecurityActLevel,
} from "./rules";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";
import { politicalMetricsCollection } from "@/lib/db/repositories/politicalMetrics";

const MANDATE_SLUG = "cyber_resilience_mandate";
const BOOK_MANDATE_SLUG = "cyberResilienceMandate";
/** Law book countries whose mandate sets resilience (the US and UK books do not model it). */
const BOOK_COUNTRIES: ReadonlySet<string> = new Set(["DE", "JP", "CN"]);

/** Canada's security act doubles as its cyber mandate; its book has no separate law. */
const CA_SECURITY_ACT_ID = "ca.defense.security.primary";

/**
 * The cyber resilience mandate law id for a country, or null where it has none.
 * Law book countries carry it as a five-level law; legacy countries as a
 * seven-option ladder.
 */
export function cyberMandateTypeIdFor(countryId: string): string | null {
  if (countryId === "CA") return CA_SECURITY_ACT_ID;
  if (BOOK_COUNTRIES.has(countryId)) return `${countryId.toLowerCase()}.sec.${BOOK_MANDATE_SLUG}`;
  const spec = MODERN_ERA_LEGISLATURE_SPECS.find((s) => s.prefix.toUpperCase() === countryId);
  return spec ? `${spec.prefix}_${MANDATE_SLUG}` : null;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export interface CountryCyberResilience {
  countryId: string;
  /** 0..1; null for a country with no regional board. */
  resilience: number | null;
}

export async function loadCyberResilience(
  db: Db,
  countryIds: string[]
): Promise<CountryCyberResilience[]> {
  if (countryIds.length === 0) return [];
  const mandateIds = new Map<string, string>();
  for (const countryId of countryIds) {
    const typeId = cyberMandateTypeIdFor(countryId);
    if (typeId) mandateIds.set(typeId, countryId);
  }

  const [boards, macro, policies] = await Promise.all([
    // Board values are keyed by literal dotted ids, so the field cannot be
    // projected on its own path; read the values record.
    politicalMetricsCollection<Pick<PoliticalMetricsDoc, "countryId" | "values">>(db)
      .find({ countryId: { $in: countryIds } } as never, {
        projection: { _id: 0, countryId: 1, values: 1 },
      })
      .toArray(),
    macroMetricsCollection<{ countryId?: string; economic?: { rdIntensity?: { value?: number } } }>(
      db
    )
      .find(
        { countryId: { $in: countryIds } },
        { projection: { _id: 0, countryId: 1, "economic.rdIntensity.value": 1 } }
      )
      .toArray(),
    mandateIds.size === 0
      ? Promise.resolve([] as Pick<StatePolicy, "legislationTypeId" | "policyOptionIndex">[])
      : statePoliciesCollection(db)
          .find(
            { scope: "national", legislationTypeId: { $in: [...mandateIds.keys()] } },
            { projection: { _id: 0, legislationTypeId: 1, policyOptionIndex: 1 } }
          )
          .toArray(),
  ]);

  const mandateByCountry = new Map<string, number>();
  for (const policy of policies) {
    const countryId = mandateIds.get(policy.legislationTypeId);
    if (countryId && finite(policy.policyOptionIndex)) {
      const isBook = BOOK_COUNTRIES.has(countryId);
      const index =
        countryId === "CA"
          ? mandateIndexForSecurityActLevel(policy.policyOptionIndex)
          : isBook
            ? mandateIndexForLevel(policy.policyOptionIndex)
            : policy.policyOptionIndex;
      if (index !== null) mandateByCountry.set(countryId, index);
    }
  }

  return countryIds.map((countryId) => ({
    countryId,
    resilience: cyberResilienceScore({
      utilities: mean(
        boards
          .filter((row) => row.countryId === countryId)
          .map((row) => row.values?.["infrastructure.utilities"])
          .filter(finite)
      ),
      rdIntensity: mean(
        macro
          .filter((row) => row.countryId === countryId)
          .map((row) => row.economic?.rdIntensity?.value)
          .filter(finite)
      ),
      mandateOptionIndex: mandateByCountry.get(countryId) ?? null,
    }),
  }));
}
