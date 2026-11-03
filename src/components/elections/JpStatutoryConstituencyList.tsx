"use client";

import { JP_SHUGIIN_1994_CONSTITUENCIES } from "@/lib/countries/jp/data/jpShugiinConstituencies1994";

/**
 * The 1994 Shugiin statutory constituency list for one region.
 *
 * It sits inside a collapsed `<details>` (the election header, Campaign
 * Manager's race notes) and is the only reader of the 72 KB constituency
 * table, so both import it lazily: Japanese parliamentary races get the full
 * map, and every other page stops downloading it.
 */
export function JpStatutoryConstituencyList({ regionId }: { regionId: string | undefined }) {
  return (
    <ol className="mt-2 max-h-72 list-decimal space-y-1 overflow-y-auto pl-6">
      {JP_SHUGIIN_1994_CONSTITUENCIES.filter((district) => district.regionId === regionId).map(
        (district, index) => (
          <li key={district.id}>
            <span className="font-medium">
              {index + 1}. {district.prefecture}
            </span>{" "}
            {district.statutoryBoundary}
          </li>
        )
      )}
    </ol>
  );
}
