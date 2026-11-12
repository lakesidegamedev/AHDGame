import type { EasternBlocSeedConfig } from "@/lib/admin/seed/seedEasternBloc";
import { balRegions } from "@/lib/seeds/bal/balRegions";
import { balRegions1953 } from "@/lib/seeds/bal/balRegions1953";
import { balParties } from "@/lib/seeds/bal/balParties";
import {
  makeEasternBlocStateMetrics,
  makeEasternBlocBaselines,
} from "@/lib/seeds/shared/easternBlocMetrics";

/**
 * Baltic republics seed config: three union republics, not one blob.
 *
 * INCOME SCALE. Both eras are in the same Soviet rubles as the region GDP
 * seeds. The 1953 figures weight to about 20,200 rubles, roughly 2.0x the
 * 10,057 per head implied by balRegions1953, staying inside the [0.8, 2.6]
 * band checked by easternBlocIncomeGdpScale1953.test.ts. Deliberately toward
 * the upper half: this is the one part of the USSR where consumer supply
 * outran the plan average.
 *
 * The per-republic overrides are the point of the three-region split. Estonia
 * must read materially better off than Lithuania on every consumer indicator
 * (income, life expectancy, urbanisation) because it was, by a wide margin.
 */
export function getBalSeedConfig(preset: string): EasternBlocSeedConfig {
  const is1953 = preset === "1953-default";
  const regions = is1953 ? balRegions1953 : balRegions;
  const defaultIncome = is1953 ? 20_000 : 5_000;
  const metrics = makeEasternBlocStateMetrics(
    "BAL",
    defaultIncome,
    {
      BAL_LTU: {
        // The laggard on every consumer measure: a farm republic that has only
        // just been collectivised, with the smallest industrial base and the
        // heaviest security presence (the Forest Brothers held out longest
        // here, into 1953 in the Dzukija and Suvalkija forests).
        medianIncome: is1953 ? 17_000 : 4_600,
        lifeExpectancy: is1953 ? 64 : 71, // catches up and passes the north by 1979
        pressFreedom: is1953 ? 4 : 12, // hardest repression of the three in 1953
        urbanizationRate: is1953 ? 32 : 61,
        gdpGrowth: is1953 ? 4.5 : 2.9, // low base, but little new heavy industry yet
      },
      BAL_LVA: {
        // Riga's machine-building makes Latvia the most industrial republic and
        // the highest output per head in 1953, though Estonia edges it on the
        // consumer basket that medianIncome actually measures.
        medianIncome: is1953 ? 21_000 : 5_200,
        lifeExpectancy: is1953 ? 65 : 70,
        pressFreedom: is1953 ? 5 : 12,
        urbanizationRate: is1953 ? 50 : 70,
        gdpGrowth: is1953 ? 5.0 : 2.8,
      },
      BAL_EST: {
        // Best-off republic in the whole Union: oil shale energy of its own, the
        // highest consumer allocations, and Finnish radio and (later) television
        // across the gulf, which is why the press-freedom reading is a shade
        // less bleak than its neighbours' even under the same censorship.
        medianIncome: is1953 ? 25_000 : 5_600,
        lifeExpectancy: is1953 ? 66 : 70, // best in the USSR in 1953
        pressFreedom: is1953 ? 6 : 13,
        urbanizationRate: is1953 ? 50 : 70,
        gdpGrowth: is1953 ? 6.0 : 2.8, // shale power build-out drives the 1950s
      },
    },
    is1953 ? "1953" : "1979"
  );
  return {
    countryId: "BAL",
    regions,
    parties: balParties,
    metrics,
    baselines: makeEasternBlocBaselines(metrics),
  };
}

const balSeedConfig: EasternBlocSeedConfig = getBalSeedConfig("2019-default");
export default balSeedConfig;
