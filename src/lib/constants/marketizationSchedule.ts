/**
 * Per-country marketization trajectories, split out of `commandEconomy` so a
 * client that only needs to know WHICH countries are on a planned schedule does
 * not pull the whole command-economy model (and the SOE sector stack behind it)
 * into its bundle. `commandEconomy` re-exports this map, and
 * `marketizationSchedule.test.ts` pins the two together.
 */
import type { CountryId } from "@/lib/constants/countries";

export type MarketizationStep = { throughYear: number; level: number };

/**
 * Per-country marketization trajectory. Each step's `level` applies for years
 * up to and including `throughYear`; past the last step the country is fully
 * marketized (MARKET_LEVEL). Absent country means always market.
 */
export const MARKETIZATION_SCHEDULE: Partial<Record<CountryId, MarketizationStep[]>> = {
  // Soviet ruble: command through the 1991 dissolution.
  RU: [{ throughYear: 1991, level: 10 }],
  // Soviet republics (Ukrainian SSR, Byelorussian SSR, Baltic SSRs): constituent parts of the
  // USSR planning system, so they carry RU's union-wide trajectory. Absent from
  // this map they read as fully marketized even with the command flag on.
  BLR: [{ throughYear: 1991, level: 10 }],
  BAL: [{ throughYear: 1991, level: 10 }],
  UKR: [{ throughYear: 1991, level: 10 }],
  // China's migration: First-Five-Year-Plan command (1953), post-Deng
  // dual-track / dual-rate (1979-92), largely marketized reform era (1993+).
  CN: [
    { throughYear: 1978, level: 10 }, // pre-Deng planned economy
    { throughYear: 1992, level: 50 }, // dual-track (guidance + market prices, dual FX)
    { throughYear: 2018, level: 85 }, // socialist market economy
  ],
  // NPP-run Eastern-bloc satellites: closed planned economies (already
  // excluded from the forex market) until the 1989-90 revolutions / German
  // reunification decommunise them. Mostly AI(NPP)-governed, so the planned
  // regime is what the NPP brain operates for them.
  DD: [{ throughYear: 1990, level: 10 }], // East Germany, reunified Oct 1990
  PL: [{ throughYear: 1989, level: 12 }], // Poland, Round Table / Balcerowicz
  HU: [{ throughYear: 1989, level: 15 }], // Hungary, "goulash" was least rigid
  CS: [{ throughYear: 1989, level: 10 }], // Czechoslovakia, Velvet Revolution
  BG: [{ throughYear: 1990, level: 10 }], // Bulgaria
  RO: [{ throughYear: 1989, level: 8 }], // Romania, most autarkic/rigid
  // Yugoslavia: self-management made it the least command of the bloc, but a
  // flat 35 described LATE self-management (post-1965 market reforms) and
  // applied it to 1953, when the country was still running Five-Year-Plan
  // central allocation because the 1950 workers'-council law had barely begun to
  // devolve anything. At 35 it sat above COMMAND_CEILING, so a planned economy
  // was simulated as a floating market one with no monetary authority to
  // respond, and its CPI ratcheted past the 15% clamp to 16.6 by turn 25.
  YU: [
    { throughYear: 1964, level: 20 }, // plan-directed; councils nominal
    { throughYear: 1990, level: 35 }, // post-1965 market-socialist reforms
  ],
};
