/**
 * Server-side loaders for the live national GDP per capita that campaign
 * income and cost scalars measure regions against. Kept apart from
 * `campaignCurrency` so client bundles that import the action rules never
 * reach the database.
 */

import type { Db } from "mongodb";
import { getStatesCollection } from "@/lib/db/collections/states";
import { nationalGdpPerCapitaIndex, requireNationalGdpPerCapita } from "./rules/gdpBaseline";

/**
 * Load live national GDP per capita for every country in one grouped read.
 * Campaign income and cost scalars measure a region against this figure, so
 * they follow the economy instead of a start-of-world number. Countries with
 * no usable regional GDP are absent from the map.
 */
export async function loadNationalGdpPerCapitaIndex(db: Db): Promise<Map<string, number>> {
  const rows = await (
    await getStatesCollection(db)
  )
    .aggregate<{ _id: string | null; gdp: number; population: number }>([
      {
        $group: {
          _id: "$countryId",
          gdp: { $sum: { $ifNull: ["$gdp", 0] } },
          population: { $sum: "$population" },
        },
      },
    ])
    .toArray();
  return nationalGdpPerCapitaIndex(
    rows.map((r) => ({ countryId: r._id ?? "US", gdp: r.gdp, population: r.population }))
  );
}

/** One country's live national GDP per capita; throws when it has no regional GDP. */
export async function loadNationalGdpPerCapita(db: Db, countryId: string): Promise<number> {
  return requireNationalGdpPerCapita(await loadNationalGdpPerCapitaIndex(db), countryId);
}
