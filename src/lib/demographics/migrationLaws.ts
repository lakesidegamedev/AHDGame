/**
 * Enacted national migration laws for v2 playable countries.
 *
 * Entry and residence (L49) and Labour migration (L52) are national-only
 * families. A country with no enacted program sits at its 1991 opening
 * choice, derived from the same current-law reference the bill picker shows.
 */
import type { Db } from "mongodb";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";
import { openingChoice1991 } from "@/lib/resetLegislation/rules/reviewCatalog";
import type { MigrationLawPosition } from "./flows/internationalMigration";

const ENTRY_AND_RESIDENCE_FAMILY_ID = "L49";
const LABOUR_MIGRATION_FAMILY_ID = "L52";

export interface MigrationLawPositions {
  entry: MigrationLawPosition;
  labour: MigrationLawPosition;
}

const POSITIONS = new Set<string>([
  "far_left",
  "center_left",
  "center",
  "center_right",
  "far_right",
]);

function asPosition(choice: unknown): MigrationLawPosition | null {
  return typeof choice === "string" && POSITIONS.has(choice)
    ? (choice as MigrationLawPosition)
    : null;
}

export async function loadMigrationLawPositions(
  db: Db,
  worldId: string,
  countries: readonly ResetCountry[]
): Promise<Map<string, MigrationLawPositions>> {
  const familyIds = [ENTRY_AND_RESIDENCE_FAMILY_ID, LABOUR_MIGRATION_FAMILY_ID];
  const [programs, { default: references }] = await Promise.all([
    db
      .collection<ResetLawProgramDocument>("resetLawPrograms")
      .find(
        {
          worldId,
          scope: "national",
          country: { $in: [...countries] },
          familyId: { $in: familyIds },
        },
        { projection: { country: 1, familyId: 1, choice: 1 } }
      )
      .toArray(),
    // Raw crosswalk only: the opening choice needs statuses and option
    // indexes, not the fitted 1991 costs openingLaw computes on import.
    import("@/lib/resetLegislation/openingLawReferences.json"),
  ]);
  const enacted = new Map(
    programs.map((program) => [
      `${program.country}:${program.familyId}`,
      asPosition(program.choice),
    ])
  );
  const resolve = (country: string, familyId: string): MigrationLawPosition => {
    const current = enacted.get(`${country}:${familyId}`);
    if (current) return current;
    const reference = (references as OpeningLawReference[]).find(
      (row) => row.country === country && row.scope === "national" && row.familyId === familyId
    );
    return reference ? openingChoice1991(reference) : "center";
  };
  return new Map(
    countries.map((country) => [
      country,
      {
        entry: resolve(country, ENTRY_AND_RESIDENCE_FAMILY_ID),
        labour: resolve(country, LABOUR_MIGRATION_FAMILY_ID),
      },
    ])
  );
}
