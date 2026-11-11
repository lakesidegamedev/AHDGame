import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
import {
  buildResetLawOpeningBoard,
  type ResetLawOpeningBoard,
} from "@/lib/resetLegislation/rules/openingBoard";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import { fundingSeatForLaw, fundingNameForLaw1991 } from "@/lib/resetLegislation/fundingOwner";
import type { ResetOpeningCountry } from "@/lib/resetFinance/opening1991";
import { groupOpeningDepartmentClaims } from "@/lib/resetFinance/rules/departmentOpening";
import type { ResetDepartmentOpeningBoard } from "@/lib/resetFinance/rules/departmentBoard";
import type { ResetRegionalOpeningBoard } from "@/lib/resetFinance/rules/regionalOpeningBoard";
import { largestRemainderAllocate } from "@/lib/redistricting/budget";

export interface ModeledLawSource {
  id: string;
  title: string;
  optionIndex: number;
  annualCost: number;
  grant: boolean;
}

export function buildModeledFiscalOpening(input: {
  worldId: string;
  turn: number;
  preset: string;
  year: number;
  references: readonly OpeningLawReference[];
  countries: readonly {
    country: ResetOpeningCountry;
    operating: number;
    grants: number;
    sources: readonly ModeledLawSource[];
    regions: readonly { id: string; spending: number }[];
  }[];
}) {
  const laws: ResetLawOpeningBoard[] = [];
  const regional: ResetRegionalOpeningBoard[] = [];
  const departments: ResetDepartmentOpeningBoard[] = [];
  for (const country of input.countries) {
    if (
      !Number.isSafeInteger(country.operating) ||
      country.operating < country.grants ||
      country.grants < 0
    )
      throw new Error(`Invalid modeled fiscal envelope ${country.country}`);
    const sourceById = new Map(country.sources.map((s) => [s.id, s]));
    const owned = new Set<string>();
    const references = input.references
      .filter((r) => r.country === country.country)
      .map((r): OpeningLawReference => ({
        ...r,
        status: "modeled-game-seed",
        currentLaw: `${input.preset} modeled ${r.familyId} opening`,
        legalNote:
          "Mapped from the selected game seed. Unmapped spending remains a continuity obligation.",
        sourceComponents: r.sourceComponents.flatMap((s) => {
          const source = sourceById.get(s.sourceId);
          if (!source || r.scope !== "national") return [];
          const owner =
            s.fiscalRole === "single-booked-owner" && !owned.has(source.id) && !source.grant;
          if (owner) owned.add(source.id);
          return [
            {
              ...s,
              selectedOption: source.title,
              optionIndex: source.optionIndex,
              historicalDisposition: "retained-legal-lineage",
              annualBooked: owner ? Math.max(0, Math.round(source.annualCost)) : 0,
              treatment: `Modeled ${input.preset} seed mapping`,
              replacementRestriction: source.grant ? ("protected-transfer" as const) : undefined,
            },
          ];
        }),
      }));
    for (const reference of references) {
      const titles = [
        ...new Set(reference.sourceComponents.map((source) => source.selectedOption)),
      ];
      if (titles.length)
        reference.currentLaw = `${input.preset} modeled opening using ${titles.join(" + ")}`;
    }
    const funded = references.flatMap((r) => r.sourceComponents.filter((s) => s.annualBooked > 0));
    const requested = funded.reduce((sum, s) => sum + s.annualBooked, 0);
    const available = country.operating - country.grants;
    if (requested > available) {
      const allocations = largestRemainderAllocate(
        available,
        funded.map((s) => s.annualBooked)
      );
      funded.forEach((s, i) => {
        s.annualBooked = allocations[i]!;
      });
    }
    const national = references.filter((r) => r.scope === "national");
    const familyAmounts = new Map(
      national.map((r) => [
        r.familyId,
        r.sourceComponents.reduce((sum, s) => sum + s.annualBooked, 0),
      ])
    );
    const familyTotal = [...familyAmounts.values()].reduce((sum, amount) => sum + amount, 0);
    const enabled = new Set(input.year >= 1980 ? ["secretary_of_education"] : []);
    const claims = resetLawFamilies
      .filter((f) => f.availability.national.includes(country.country))
      .map((family) => ({
        familyId: family.id,
        seatId: fundingSeatForLaw(family, country.country, enabled, input.year),
        agencyName: fundingNameForLaw1991(family, country.country, enabled, input.year),
        annualAmount: familyAmounts.get(family.id) ?? 0,
      }));
    departments.push({
      _id: country.country,
      countryId: country.country,
      worldId: input.worldId,
      sourceTurn: input.turn,
      operating: country.operating,
      ...groupOpeningDepartmentClaims(country.operating, claims, country.operating - familyTotal),
    });
    laws.push(
      buildResetLawOpeningBoard({
        worldId: input.worldId,
        sourceTurn: input.turn,
        countryId: country.country,
        references: national,
        modeled: true,
        modeledOpening: { preset: input.preset, year: input.year },
      })
    );
    for (const region of country.regions) {
      if (!Number.isFinite(region.spending) || region.spending < 0)
        throw new Error(`Invalid regional spending ${region.id}`);
      laws.push(
        buildResetLawOpeningBoard({
          worldId: input.worldId,
          sourceTurn: input.turn,
          countryId: country.country,
          regionId: region.id,
          references: references.filter((r) => r.scope === "regional"),
          modeled: true,
          modeledOpening: { preset: input.preset, year: input.year },
        })
      );
      regional.push({
        _id: `${country.country}:${region.id}`,
        countryId: country.country,
        regionId: region.id,
        worldId: input.worldId,
        sourceTurn: input.turn,
        annualSpending: region.spending,
        familyOwned: 0,
        otherExistingServices: region.spending,
        allocatedClaims: [],
        estimateKind: "proportional-source-pool",
      });
    }
  }
  return { laws, regional, departments };
}
