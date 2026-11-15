/**
 * Ireland Region Census Profiles for the 2007 peak-boom era.
 *
 * Anchor: CSO Census of Population 2006. Values are authored independently per
 * region, not scaled from other era files. Income tiers are era-neutral relative tiers.
 */

import type { IERegionLayer1 } from "@/lib/seeds/ie/ieRegionCensusData";

export const ieRegionCensusData2007: Record<string, IERegionLayer1> = {
  // Dublin — financial/tech hub, largest and most varied migrant population.
  DUB: {
    ethnicity: { irish: 82, uk_british: 3, eu_other: 9, rest_of_world: 6 },
    age: { young: 25, mid: 29, mature: 27, senior: 19 },
    education: { primary_or_less: 14, leaving_cert: 30, post_secondary: 22, third_level: 34 },
    income: { low: 22, middle: 50, high: 28 },
    urbanization: { urban: 91, suburban: 8, rural: 1 },
  },
  // Kildare / commuter belt — fastest-growing housing market in the state.
  KIL: {
    ethnicity: { irish: 88, uk_british: 3, eu_other: 6, rest_of_world: 3 },
    age: { young: 25, mid: 29, mature: 28, senior: 18 },
    education: { primary_or_less: 17, leaving_cert: 34, post_secondary: 22, third_level: 27 },
    income: { low: 22, middle: 54, high: 24 },
    urbanization: { urban: 42, suburban: 38, rural: 20 },
  },
  // Midlands — construction and meat-plant work drew a notable EU inflow.
  MID: {
    ethnicity: { irish: 89, uk_british: 2, eu_other: 7, rest_of_world: 2 },
    age: { young: 25, mid: 27, mature: 27, senior: 21 },
    education: { primary_or_less: 23, leaving_cert: 37, post_secondary: 21, third_level: 19 },
    income: { low: 30, middle: 54, high: 16 },
    urbanization: { urban: 28, suburban: 32, rural: 40 },
  },
  // Wexford / South-East — building boom along the coast and N11 corridor.
  WEX: {
    ethnicity: { irish: 90, uk_british: 3, eu_other: 5, rest_of_world: 2 },
    age: { young: 25, mid: 27, mature: 27, senior: 21 },
    education: { primary_or_less: 22, leaving_cert: 36, post_secondary: 22, third_level: 20 },
    income: { low: 28, middle: 54, high: 18 },
    urbanization: { urban: 34, suburban: 32, rural: 34 },
  },
  // Limerick / Mid-West — Dell at peak employment just before the 2009 exit.
  LIM: {
    ethnicity: { irish: 88, uk_british: 2, eu_other: 7, rest_of_world: 3 },
    age: { young: 25, mid: 28, mature: 27, senior: 20 },
    education: { primary_or_less: 19, leaving_cert: 35, post_secondary: 22, third_level: 24 },
    income: { low: 26, middle: 54, high: 20 },
    urbanization: { urban: 49, suburban: 27, rural: 24 },
  },
  // Cork / South-West — pharma capital of Europe; strong graduate base.
  COR: {
    ethnicity: { irish: 88, uk_british: 2, eu_other: 6, rest_of_world: 4 },
    age: { young: 25, mid: 28, mature: 27, senior: 20 },
    education: { primary_or_less: 17, leaving_cert: 33, post_secondary: 22, third_level: 28 },
    income: { low: 24, middle: 52, high: 24 },
    urbanization: { urban: 54, suburban: 25, rural: 21 },
  },
  // Galway / West — medtech boomtown; large student and EU-worker presence.
  GAL: {
    ethnicity: { irish: 88, uk_british: 2, eu_other: 6, rest_of_world: 4 },
    age: { young: 26, mid: 27, mature: 26, senior: 21 },
    education: { primary_or_less: 19, leaving_cert: 34, post_secondary: 21, third_level: 26 },
    income: { low: 28, middle: 52, high: 20 },
    urbanization: { urban: 39, suburban: 26, rural: 35 },
  },
  // Donegal / Border — least boom exposure; cross-border shopping era.
  DON: {
    ethnicity: { irish: 92, uk_british: 4, eu_other: 3, rest_of_world: 1 },
    age: { young: 25, mid: 26, mature: 27, senior: 22 },
    education: { primary_or_less: 26, leaving_cert: 36, post_secondary: 22, third_level: 16 },
    income: { low: 36, middle: 50, high: 14 },
    urbanization: { urban: 24, suburban: 27, rural: 49 },
  },
};
