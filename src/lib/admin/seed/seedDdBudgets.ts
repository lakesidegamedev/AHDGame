import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { upsertCountryOwnedCorpEntries } from "./upsertCountryOwnedCorps";

/**
 * Seeds East Germany's FY1979 national budget, default enacted laws (from the dd_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedDdBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "DD",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
    seedCorporations: async (statesForBudgets) => {
      const { generateCountryOwnedSeedData } = await import("@/lib/seeds/reference/budgets");
      // DD is a command economy, so it needs the same two arguments RU passes
      // (seedRuBudgets). Without them the generator defaults to preset
      // "2019-default" and commandEconomyEnabled false, which excludes DD from the
      // per-commanding-height SOE split by construction and prices its seed data
      // off the modern era table.
      const ddGameConfig = await db
        .collection<GameConfig>("gameConfig")
        .findOne({ _id: "default" }, { projection: { commandEconomyEnabled: 1 } });
      const countryOwnedSeedData = generateCountryOwnedSeedData(
        statesForBudgets,
        preset,
        ddGameConfig?.commandEconomyEnabled === true,
        log
      );
      const ddCorpData = countryOwnedSeedData.filter(
        (entry) => entry.corporation.countryOwnerId === "DD"
      );
      const ddUpsert = await upsertCountryOwnedCorpEntries(db, "DD", ddCorpData);
      if (ddCorpData.length > 0) {
        log(
          `Seeded ${ddCorpData.length} DD sovereign issuer setup(s)` +
            (ddUpsert.repointed > 0
              ? `, re-pointed ${ddUpsert.repointed} sector(s) off a stale state-enterprise id`
              : "")
        );
      }
    },
  });
}
