/**
 * Server-side loaders for the live national GDP per capita that campaign
 * income and cost scalars measure regions against. Kept apart from
 * `campaignCurrency` so client bundles that import the action rules never
 * reach the database.
 */

import type { Db } from "mongodb";
import { getStatesCollection } from "@/lib/db/collections/states";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { isLiveWorldSwitchOn } from "@/lib/gameConfig/liveWorldSwitches";
import {
  campaignGdpPerCapitaIndex,
  requireNationalGdpPerCapita,
  type CampaignGdpBasis,
} from "./rules/gdpBaseline";

/** Whether this world's campaign money follows live GDP, and the era preset for the table. */
export async function loadCampaignGdpBasis(db: Db): Promise<CampaignGdpBasis> {
  const [live, preset] = await Promise.all([
    isLiveWorldSwitchOn(db, "campaignLiveGdpBasisEnabled"),
    getGameStatePresetOrDefault(db),
  ]);
  return { live, preset };
}

/**
 * Load the figure campaign money measures regions against, for every country
 * in one grouped read: live national GDP per capita when the world's switch is
 * on, the era table otherwise. Countries with no usable figure are absent.
 */
export async function loadNationalGdpPerCapitaIndex(db: Db): Promise<Map<string, number>> {
  const basis = await loadCampaignGdpBasis(db);
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
  return campaignGdpPerCapitaIndex(
    rows.map((r) => ({ countryId: r._id ?? "US", gdp: r.gdp, population: r.population })),
    basis
  );
}

/** One country's live national GDP per capita; throws when it has no regional GDP. */
export async function loadNationalGdpPerCapita(db: Db, countryId: string): Promise<number> {
  return requireNationalGdpPerCapita(await loadNationalGdpPerCapitaIndex(db), countryId);
}
