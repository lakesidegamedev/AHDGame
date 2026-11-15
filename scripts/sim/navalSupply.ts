/** Synthetic, database-free supply replay. Run with npx tsx scripts/sim/navalSupply.ts. */
import { performance } from "node:perf_hooks";
import { planSupply, type SupplyContext } from "../../src/lib/navair/rules/supply";
import { supplyCeiling, berthCapacity, overcrowdPenalty } from "../../src/lib/navair/basing";
import { homeRegionOf } from "../../src/lib/military/regionTopology";
import type { NavairUnit } from "../../src/lib/navair/types";
import type { CountryId } from "../../src/lib/constants/countries";
import type { RegionCode } from "../../src/lib/military/types";

const context: SupplyContext = { blocs: {}, enemies: {}, agreements: [] };
function hull(countryId: CountryId, station: RegionCode, i: number): NavairUnit {
  return {
    _id: `synthetic-${countryId}-${i}`,
    countryId,
    domain: "naval",
    station,
    type: "Guided-Missile Destroyer",
    integrity: 100,
  } as unknown as NavairUnit;
}
const scenarios = (
  [
    ["US", "nat"],
    ["UK", "nat"],
    ["JP", "eas"],
  ] as const
).map(([country, station]) => {
  const units = Array.from({ length: 26 }, (_, i) => hull(country, station, i));
  const status = homeRegionOf(country) === station ? "home" : "neutral";
  return {
    country,
    station,
    oldSupply: supplyCeiling(
      units[0],
      status,
      overcrowdPenalty(26, berthCapacity(station, status, 0)),
      false
    ),
    newAdvice: planSupply(units, context)[0],
  };
});
const fighter = { ...hull("US", "eas", 1), domain: "air", type: "Fighter Wing" } as NavairUnit;
const war: SupplyContext = { ...context, enemies: { US: ["JP"], JP: ["US"] } };
const noBase = planSupply([fighter], war)[0];
const withBase = planSupply([fighter], {
  ...war,
  agreements: [
    { _id: "CN:US:air", host: "CN", guest: "US", domain: "air", status: "active", updatedTurn: 1 },
  ],
})[0];
const fleet = Array.from({ length: 1000 }, (_, i) =>
  hull(i % 2 ? "US" : "UK", i % 2 ? "nat" : "med", i)
);
const started = performance.now();
for (let i = 0; i < 10; i++) planSupply(fleet, context);
console.log(
  JSON.stringify(
    {
      scenarios,
      air: { noBase, withBase },
      performance: {
        formations: fleet.length,
        repetitions: 10,
        totalMs: Math.round(performance.now() - started),
      },
    },
    null,
    2
  )
);
