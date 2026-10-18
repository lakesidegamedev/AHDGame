import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { upsertCountryOwnedCorpEntries } from "./upsertCountryOwnedCorps";

export async function seedCnBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "CN",
    fiscalYearFallback: 2023,
    legacyRegionalBudgetIds: [
      "NORTHEAST",
      "NORTH",
      "EAST",
      "CENTRAL",
      "SOUTH",
      "SOUTHWEST",
      "NORTHWEST",
    ],
    seedCorporations: async (statesForBudgets) => {
      const { generateCountryOwnedSeedData } = await import("@/lib/seeds/reference/budgets");
      // Command Economy v2 (#3496): when `commandEconomyEnabled` is on AND CN is in
      // its fully-command era (First-Five-Year-Plan band), the CN seed splits into
      // one SOE per commanding-height sector (see generateCountryOwnedSeedData).
      // Dual-track / market CN eras are unaffected, and flag-off is byte-identical.
      const gameConfig = await db
        .collection<GameConfig>("gameConfig")
        .findOne({ _id: "default" }, { projection: { commandEconomyEnabled: 1 } });
      const commandEconomyEnabled = gameConfig?.commandEconomyEnabled === true;

      const countryOwnedSeedData = generateCountryOwnedSeedData(
        statesForBudgets,
        preset,
        commandEconomyEnabled,
        log
      );
      const cnCorpData = countryOwnedSeedData.filter(
        (entry) => entry.corporation.countryOwnerId === "CN"
      );
      await upsertCountryOwnedCorpEntries(db, "CN", cnCorpData);
      if (cnCorpData.length > 0) {
        const cnSectorCount = cnCorpData.reduce((n, e) => n + e.sectors.length, 0);
        const cnSoeCount = cnCorpData.filter((e) => e.corporation.soe).length;
        log(
          cnSoeCount > 0
            ? `Seeded 1 CN sovereign issuer + ${cnSoeCount} state enterprise(s) with ${cnSectorCount} owned producing sector(s)`
            : `Seeded ${cnCorpData.length} CN sovereign issuer setup(s)`
        );
      }
    },
  });
}
