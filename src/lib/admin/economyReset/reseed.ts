/**
 * Reseed steps of the economy-only reset. Each step reuses the bootstrap's
 * own seeder so the rebuilt economy matches a fresh world of the same preset,
 * except that it runs on the kept states, budgets and clock.
 */
import type { Db } from "mongodb";
import type { State } from "@/lib/db/types";
import { upsertCountryOwnedCorpEntries } from "@/lib/admin/seed/upsertCountryOwnedCorps";
import {
  generateCountryOwnedSeedData,
  getInitialNationalBudgetsForPreset,
  type CountryOwnedSeedData,
} from "@/lib/seeds/reference/budgets";
import { isEasternBlocEra } from "@/lib/seeds/presetSelector";
import type { CountryId } from "@/lib/constants/countries";
import { countryCorporationSeeds, type CountryCorporationSeed } from "./rules/countryCorporations";

type Log = (message: string) => void;

/** Index fund and equity pool bootstraps, forced because their markers survive. */
export const ECONOMY_RESET_FUND_MIGRATIONS: readonly string[] = Object.freeze([
  "2026-06-01-index-fund-foundation",
  "2026-06-01-index-fund-seed",
  "2026-06-02-index-fund-real-bonds",
  "2026-09-03-equity-market-pools",
  "2026-08-01-backfill-unowned-headroom-units",
]);

/** Model and media-lane unique keys that must exist before seeders write markets. */
export const ECONOMY_RESET_INDEX_MIGRATIONS: readonly string[] = Object.freeze([
  "2026-10-04-media-discriminator-market-indexes",
]);

function entriesFor(
  seed: CountryCorporationSeed,
  states: { id: string; population: number; gdp: number; countryId: string }[],
  preset: string,
  commandEconomyEnabled: boolean,
  log: Log
): CountryOwnedSeedData[] {
  const generated = generateCountryOwnedSeedData(
    states,
    preset,
    seed.commandAware ? commandEconomyEnabled : false,
    log
  ).filter((entry) => entry.corporation.countryOwnerId === seed.countryId);
  if (seed.mode === "generator") return generated;
  // Same override seedModernBudgets2019 writes.
  const issuer = generated.find((entry) => entry.corporation.isPrimaryNationalCorporation);
  if (!issuer) throw new Error("Missing 2019 RU sovereign issuer template");
  return [
    {
      corporation: {
        ...issuer.corporation,
        name: "Russian Federation",
        description: "2019 Russian sovereign issuer; no Soviet command-economy production assets.",
        liquidCurrencyCode: "RUB",
      },
      sectors: [],
    },
  ];
}

/**
 * Rebuild every country-owned corporation and SOE from the generators, one
 * country at a time, using the live regions. Never calls the budget seeders,
 * which would overwrite the kept budgets and enacted laws.
 */
export async function reseedCountryOwnedCorporations(
  db: Db,
  preset: string,
  commandEconomyEnabled: boolean,
  log: Log
): Promise<{ countries: number; corporations: number; sectors: number }> {
  const states = await db
    .collection<State>("states")
    .find({}, { projection: { _id: 1, countryId: 1, population: 1, gdp: 1 } })
    .toArray();
  const byCountry = new Map<
    string,
    { id: string; population: number; gdp: number; countryId: string }[]
  >();
  for (const state of states) {
    const rows = byCountry.get(state.countryId) ?? [];
    rows.push({
      id: String(state._id),
      population: state.population,
      gdp: state.gdp,
      countryId: state.countryId,
    });
    byCountry.set(state.countryId, rows);
  }
  const seeds = countryCorporationSeeds({
    preset,
    nationalBudgetCountries: getInitialNationalBudgetsForPreset(preset).map(
      (budget) => budget.countryId
    ),
    easternBlocEra: isEasternBlocEra(preset),
  });
  const totals = { countries: 0, corporations: 0, sectors: 0 };
  for (const seed of seeds) {
    const entries = entriesFor(
      seed,
      byCountry.get(seed.countryId) ?? [],
      preset,
      commandEconomyEnabled,
      log
    );
    if (entries.length === 0) continue;
    // One bounded write set per country; the helper also re-points sectors left
    // on stale country-owned ids, which a fresh wipe never has.
    const result = await upsertCountryOwnedCorpEntries(db, seed.countryId as CountryId, entries);
    totals.countries += 1;
    totals.corporations += result.corporations;
    totals.sectors += result.sectors;
  }
  log(
    `Economy reset: ${totals.corporations} country-owned corporations with ${totals.sectors} sectors across ${totals.countries} countries`
  );
  return totals;
}
