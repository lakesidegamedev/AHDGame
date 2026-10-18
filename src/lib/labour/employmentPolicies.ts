/**
 * Employment policies read the current national and regional law books.
 * loadEmploymentPolicies recognizes existing enactments in both catalogs and
 * reuses the finance engine's actual delivery factors before resolving support.
 */
import type { Db } from "mongodb";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import type { LegislationType } from "@/lib/db/types/legislation";
import type { EnactedLaw } from "@/lib/db/types/budget";
import {
  getCatalog,
  getLaw,
  baselineLevelFor,
  isLawActive,
} from "@/lib/politicalLegislation/catalog";
import { getNationalDocId, NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import {
  loadDepartmentDeliveryMultipliersByCountry,
  loadRegionalDeliveryMultipliersByRegion,
} from "@/lib/governmentFinance/deliveryMultipliers";
import { resolvePolicyDeliveryMultiplier } from "@/lib/policyEffects";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  resolveEmploymentPolicy,
  employmentOptionStrength,
  employmentProgramShare,
  employmentLawChannels,
  type EmploymentLaw,
} from "./rules/employmentPolicy";
import type { EmploymentPolicy } from "./rules/employment";
import type { CountryId } from "@/lib/constants/countries";

export interface EmploymentRegion {
  _id: string;
  countryId: CountryId;
  population?: number;
}

export async function loadEmploymentLawBook(
  db: Db,
  turn: number,
  regions: readonly EmploymentRegion[],
  finance: { national: boolean; regional: boolean; year?: number; baselineYear?: number }
): Promise<Map<string, EmploymentLaw[]>> {
  const countries = [...new Set(regions.map((r) => r.countryId))];
  const knownCountry = (country: string): country is CountryId =>
    countries.some((c) => c === country);
  const [records, enacted, nationalDelivery, regionalDelivery] = await Promise.all([
    db
      .collection<StatePolicy>("statePolicies")
      .find(
        {},
        {
          projection: {
            stateId: 1,
            countryId: 1,
            scope: 1,
            legislationTypeId: 1,
            policyOptionId: 1,
            policyOptionIndex: 1,
            enactedTurn: 1,
            effectDirection: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<EnactedLaw>("enactedLaws")
      .find(
        { repealedAt: { $exists: false } },
        {
          projection: {
            countryId: 1,
            scope: 1,
            stateId: 1,
            legislationTypeId: 1,
            policyOptionIndex: 1,
            annualCostUsd: 1,
          },
        }
      )
      .toArray(),
    loadDepartmentDeliveryMultipliersByCountry(db, turn, finance.national, countries),
    loadRegionalDeliveryMultipliersByRegion(
      db,
      turn,
      finance.regional,
      regions.map((r) => r._id)
    ),
  ]);
  const ids = [...new Set([...records, ...enacted].map((r) => r.legislationTypeId))];
  // Option names identify explicit jobs guarantees; option ordering determines
  // intensity, and finance uses implementation metadata to fail closed.
  const types = ids.length
    ? await db
        .collection<LegislationType>("legislationTypes")
        .find(
          { _id: { $in: ids } },
          {
            projection: {
              _id: 1,
              name: 1,
              countryScope: 1,
              effectTarget: 1,
              effectTargetsWeighted: 1,
              "policyOptions.id": 1,
              "policyOptions.name": 1,
              "policyOptions.effectDirection": 1,
              "policyOptions.implementation": 1,
            },
          }
        )
        .toArray()
    : [];
  const typeById = new Map(types.map((t) => [t._id, t]));
  const regionCountry = new Map(regions.map((r) => [r._id, r.countryId]));
  const nationalCountry = new Map(countries.map((c) => [getNationalDocId(c), c]));
  const byJurisdiction = new Map<string, Map<string, StatePolicy>>();
  for (const record of records) {
    const country =
      record.countryId ?? regionCountry.get(record.stateId) ?? nationalCountry.get(record.stateId);
    if (!country || !knownCountry(country)) continue;
    const national = record.scope === "national" || NATIONAL_SCOPE_IDS.has(record.stateId);
    const key = national ? `national:${country}` : `region:${record.stateId}`;
    const policies = byJurisdiction.get(key) ?? new Map<string, StatePolicy>();
    const prior = policies.get(record.legislationTypeId);
    if (!prior || (record.enactedTurn ?? -1) > (prior.enactedTurn ?? -1))
      policies.set(record.legislationTypeId, record);
    byJurisdiction.set(key, policies);
  }
  const annualCosts = new Map<string, number>();
  for (const law of enacted) {
    const country =
      law.countryId ??
      (law.stateId
        ? (regionCountry.get(law.stateId) ?? nationalCountry.get(law.stateId))
        : undefined) ??
      countries.find((c) => c.toLowerCase() === typeById.get(law.legislationTypeId)?.countryScope);
    if (!country || !knownCountry(country)) continue;
    const key = law.scope === "national" ? `national:${country}` : `region:${law.stateId}`;
    // An enacted law is a fallback only. statePolicies is the current option
    // authority, including changes made after the original bill was passed.
    const policies = byJurisdiction.get(key) ?? new Map<string, StatePolicy>();
    if (!policies.has(law.legislationTypeId) && law.policyOptionIndex !== undefined) {
      policies.set(law.legislationTypeId, {
        stateId: law.stateId ?? getNationalDocId(country) ?? "",
        countryId: country,
        scope: law.scope,
        legislationTypeId: law.legislationTypeId,
        policyOptionIndex: law.policyOptionIndex,
        policyOptionId:
          typeById.get(law.legislationTypeId)?.policyOptions?.[law.policyOptionIndex]?.id ?? "",
      } as StatePolicy);
    }
    byJurisdiction.set(key, policies);
    if (
      policies.get(law.legislationTypeId)?.policyOptionIndex === law.policyOptionIndex &&
      Number.isFinite(law.annualCostUsd) &&
      (law.annualCostUsd ?? 0) > 0
    ) {
      annualCosts.set(`${key}:${law.legislationTypeId}`, law.annualCostUsd!);
    }
  }
  const nationalLaws = new Map<string, EmploymentLaw[]>();
  const regionLaws = new Map<string, EmploymentLaw[]>();
  for (const [key, policies] of byJurisdiction) {
    const national = key.startsWith("national:");
    const owner = key.slice(key.indexOf(":") + 1);
    const delivery = national ? nationalDelivery.get(owner) : regionalDelivery.get(owner);
    const enabled = national ? finance.national : finance.regional;
    const laws: EmploymentLaw[] = [];
    for (const policy of policies.values()) {
      const type = typeById.get(policy.legislationTypeId);
      const typed = getLaw(policy.legislationTypeId);
      if (!type && !typed) continue;
      const indexById = type?.policyOptions?.findIndex((o) => o.id === policy.policyOptionId) ?? -1;
      const index = indexById >= 0 ? indexById : policy.policyOptionIndex;
      const option = type?.policyOptions?.[index];
      const count = typed ? 5 : (type?.policyOptions?.length ?? 0);
      const targets =
        typed?.targets.map((t) => t.metricId) ??
        type?.effectTargetsWeighted?.map((t) => `${t.metricCategoryId}.${t.metricId}`) ??
        (type?.effectTarget
          ? [`${type.effectTarget.metricCategoryId}.${type.effectTarget.metricId}`]
          : []);
      laws.push({
        id: policy.legislationTypeId,
        title: typed?.title ?? type?.name ?? policy.legislationTypeId,
        targets,
        strength: employmentOptionStrength(index, count, !!typed),
        ...(typed
          ? {
              baselineStrength: employmentOptionStrength(
                baselineLevelFor(typed, finance.baselineYear ?? finance.year ?? 1991),
                5,
                true
              ),
            }
          : {}),
        delivery: enabled ? resolvePolicyDeliveryMultiplier(policy, typeById, delivery) : 1,
        enactedTurn: policy.enactedTurn,
        optionTitle: option?.name,
        annualCost: annualCosts.get(`${key}:${policy.legislationTypeId}`),
      });
    }
    (national ? nationalLaws : regionLaws).set(owner, laws);
  }
  // Typed catalogs use ascending levels (0=repealed), unlike legacy ladders.
  // Their targets are authored here, not inferred from projected old effects.
  for (const country of countries) {
    const catalog = getCatalog(country);
    const nationalRecords = byJurisdiction.get(`national:${country}`);
    const laws = nationalLaws.get(country) ?? [];
    const typedIds = new Set(catalog.map((l) => l.id));
    const filtered = laws.filter((l) => !typedIds.has(l.id));
    for (const law of catalog) {
      if (law.kind === "tax" || law.allowedScope === "regional") continue;
      const record = nationalRecords?.get(law.id);
      if (!record && finance.year !== undefined && !isLawActive(law, finance.year)) continue;
      const level =
        record?.policyOptionIndex ??
        baselineLevelFor(law, finance.baselineYear ?? finance.year ?? 1991);
      const description: EmploymentLaw = {
        id: law.id,
        title: law.title,
        targets: law.targets.map((t) => t.metricId),
        strength: employmentOptionStrength(level, 5, true),
        baselineStrength: employmentOptionStrength(
          baselineLevelFor(law, finance.baselineYear ?? finance.year ?? 1991),
          5,
          true
        ),
        weights: {
          matching: law.targets.find((t) => t.metricId === "education.adultSkills")?.weight ?? 1,
          transport:
            law.targets.find(
              (t) =>
                t.metricId === "infrastructure.transit" || t.metricId === "infrastructure.highways"
            )?.weight ?? 1,
        },
        delivery: finance.national
          ? (nationalDelivery.get(country)?.get(law.id) ??
            (typeById.get(law.id)?.policyOptions?.[level]?.implementation ? 0 : 1))
          : 1,
        enactedTurn: record?.enactedTurn,
        optionTitle: law.levels?.[level]?.name,
        annualCost: annualCosts.get(`national:${country}:${law.id}`),
      };
      if (Object.values(employmentLawChannels(description)).some(Boolean))
        filtered.push(description);
    }
    nationalLaws.set(country, filtered);
    for (const region of regions.filter((r) => r.countryId === country)) {
      const recordsForRegion = byJurisdiction.get(`region:${region._id}`);
      const local = (regionLaws.get(region._id) ?? []).filter((l) => !typedIds.has(l.id));
      for (const law of catalog) {
        const record = recordsForRegion?.get(law.id);
        if (!record || law.kind === "tax" || law.allowedScope === "national") continue;
        local.push({
          id: law.id,
          title: law.title,
          targets: law.targets.map((t) => t.metricId),
          strength: employmentOptionStrength(record.policyOptionIndex, 5, true),
          baselineStrength: employmentOptionStrength(
            baselineLevelFor(law, finance.baselineYear ?? finance.year ?? 1991),
            5,
            true
          ),
          delivery: finance.regional
            ? (regionalDelivery.get(region._id)?.get(law.id) ??
              (typeById.get(law.id)?.policyOptions?.[record.policyOptionIndex]?.implementation
                ? 0
                : 1))
            : 1,
          enactedTurn: record.enactedTurn,
          optionTitle: law.levels?.[record.policyOptionIndex]?.name,
          annualCost: annualCosts.get(`region:${region._id}:${law.id}`),
        });
      }
      regionLaws.set(region._id, local);
    }
  }
  const populationByCountry = new Map<string, number>();
  for (const region of regions)
    populationByCountry.set(
      region.countryId,
      (populationByCountry.get(region.countryId) ?? 0) + Math.max(0, region.population ?? 0)
    );
  return new Map(
    regions.map((r) => [
      r._id,
      [
        ...(nationalLaws.get(r.countryId) ?? []).map((law) => ({
          ...law,
          annualCost:
            law.annualCost === undefined
              ? undefined
              : law.annualCost *
                employmentProgramShare(r.population, populationByCountry.get(r.countryId) ?? 0),
        })),
        ...(regionLaws.get(r._id) ?? []),
      ],
    ])
  );
}

export async function loadEmploymentPolicies(
  db: Db,
  turn: number,
  regions: readonly EmploymentRegion[],
  finance: { national: boolean; regional: boolean; year?: number; baselineYear?: number }
): Promise<Map<string, EmploymentPolicy>> {
  const books = await loadEmploymentLawBook(db, turn, regions, finance);
  return new Map(
    [...books].map(([id, laws]) => [id, resolveEmploymentPolicy(laws, turn, TURNS_PER_YEAR)])
  );
}
