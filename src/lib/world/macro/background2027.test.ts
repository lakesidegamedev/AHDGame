import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { COMMODITY_TYPES, type CommodityType } from "@/lib/constants/commodities";
import type { CountryId } from "@/lib/constants/countries";
import { aggregateByCountry } from "@/lib/turn/commodity/demandLegs";
import { clearAllCommodities } from "@/lib/trade/snapshot";
import { backgroundCountriesFor } from "@/lib/world/eraRoster";
import { getWorldEntityPresetManifest } from "@/lib/world/worldEntityManifest";
import {
  BACKGROUND_2027_CAPACITY_PER_GDP,
  BACKGROUND_2027_PROFILES,
  background2027Scale,
  buildBackground2027MacroCountry,
} from "./background2027";
import { NATIONAL_FIGURES_2027 } from "@/lib/seeds/reference/nationalFigures2027";
import { buildBackgroundMacroCountry } from "./backgroundSeed";
import {
  addBackgroundBooksToCountries,
  backgroundCountryContributions,
  placeBackgroundBooksInStates,
} from "./rules/countryBooks";
import { seedMacroCountries } from "./seedMacroCountries";
import type { MacroCountryState, MacroMarketContribution } from "./types";

const now = new Date("2027-01-20T00:00:00Z");

async function seed(preset: string): Promise<MacroCountryState[]> {
  const written: MacroCountryState[] = [];
  const db = {
    collection: () => ({
      deleteMany: async () => ({}),
      bulkWrite: async (ops: { replaceOne: { replacement: MacroCountryState } }[]) => {
        written.push(...ops.map((op) => op.replaceOne.replacement));
        return {};
      },
    }),
  } as unknown as Db;
  await seedMacroCountries(db, preset);
  return written;
}

const BACKGROUND_2027 = backgroundCountriesFor("2027-default");

describe("2027 background macro seeds", () => {
  it("seeds one authored document per background country and keeps estimates elsewhere", async () => {
    const docs = await seed("2027-default");
    const authored = docs.filter((doc) => doc.dataQuality.provenance === "authored-2027");
    expect(authored.map((doc) => doc.entityId).sort()).toEqual([...BACKGROUND_2027].sort());
    expect(authored).toHaveLength(16);
    // The wider world of background entities still uses the estimate.
    expect(
      docs.filter((doc) => doc.dataQuality.provenance === "estimated-background").length
    ).toBeGreaterThan(100);
    for (const doc of authored) {
      expect(doc.simulationTier).toBe("background-macro");
      expect(doc.presetId).toBe("2027-default");
      expect(doc.economicSystem).toBe("market");
      expect(doc.dataQuality.missingFields).toEqual([]);
      expect(doc.dataQuality.fallbackFields).toEqual([]);
      expect(doc.trendGrowth).toBe(BACKGROUND_2027_PROFILES[doc.entityId].trendGrowth);
      expect(Object.keys(doc.resources).length).toBeGreaterThan(0);
      expect(Object.keys(doc.contribution.byCommodity).length).toBeGreaterThan(10);
    }
  });

  it("sizes each economy from its 2027 population and GDP", () => {
    let worldGdp = 0;
    for (const id of BACKGROUND_2027) {
      const doc = buildBackground2027MacroCountry(id, now);
      const { population, annualGdpMillions } = background2027Scale(id);
      expect(doc.population).toBe(population);
      expect(population).toBeGreaterThan(4_000_000);
      expect(population).toBeLessThan(250_000_000);
      // Annual GDP between $50B and $4T.
      expect(annualGdpMillions).toBeGreaterThan(50_000);
      expect(annualGdpMillions).toBeLessThan(4_000_000);
      const capacity = Object.values(doc.sectors).reduce((sum, s) => sum + (s?.capacity ?? 0), 0);
      expect(capacity).toBeCloseTo(annualGdpMillions * BACKGROUND_2027_CAPACITY_PER_GDP, -2);
      worldGdp += annualGdpMillions;
    }
    // The sixteen together: the IMF projects about $21.7T for 2027.
    expect(worldGdp).toBeGreaterThan(17_000_000);
    expect(worldGdp).toBeLessThan(25_000_000);
    expect(background2027Scale("FR").population).toBe(NATIONAL_FIGURES_2027.FR.population);
  });

  it("leaves other presets on their existing seeds", async () => {
    const docs = await seed("2019-default");
    expect(docs.some((doc) => doc.dataQuality.provenance === "authored-2027")).toBe(false);
    const fr = docs.find((doc) => doc.entityId === "FR");
    const entry = getWorldEntityPresetManifest("2019-default").entries.find(
      (e) => e.entityId === "FR"
    )!;
    expect(fr?.sectors).toEqual(buildBackgroundMacroCountry(entry, "2019-default", now).sectors);
    expect(fr?.trendGrowth).toBeUndefined();
  });
});

describe("2027 manifest tiers", () => {
  it("classifies every background country as a background-macro economy", () => {
    const entries = getWorldEntityPresetManifest("2027-default").entries;
    for (const id of BACKGROUND_2027) {
      const entry = entries.find((e) => e.entityId === id)!;
      expect(entry.simulationTier).toBe("background-macro");
      expect(entry.economicArchetype).toBe("macro");
      expect(entry.readiness.autonomous).toBe("blocked");
      expect(entry.readiness.player).toBe("blocked");
    }
    for (const id of ["UK", "DE", "JP", "CN", "US"]) {
      expect(entries.find((e) => e.entityId === id)?.simulationTier).toBe("full-autonomous");
    }
  });

  it("keeps Ireland full-autonomous outside 2027", () => {
    const ie = getWorldEntityPresetManifest("2019-default").entries.find(
      (e) => e.entityId === "IE"
    );
    expect(ie?.simulationTier).toBe("full-autonomous");
  });
});

function book(entries: Partial<Record<CommodityType, { supply: number; demand: number }>>) {
  return new Map(
    COMMODITY_TYPES.map((c) => [
      c,
      { supply: entries[c]?.supply ?? 0, demand: entries[c]?.demand ?? 0 },
    ])
  );
}

const contribution = (
  byCommodity: MacroMarketContribution["byCommodity"]
): MacroMarketContribution => ({ byCommodity, bySector: {}, computedOnTurn: 1 });

describe("background countries in the national books", () => {
  it("places a background country's contribution in its regions by GDP share", () => {
    const byState = new Map<string, ReturnType<typeof book>>();
    const unplaced = placeBackgroundBooksInStates(
      [{ countryId: "FR", contribution: contribution({ steel: { supply: 100, demand: 40 } }) }],
      new Map([
        [
          "FR",
          new Map([
            ["FR_IDF", 3],
            ["FR_ARA", 1],
          ]),
        ],
      ]),
      byState
    );
    expect(unplaced).toEqual([]);
    expect(byState.get("FR_IDF")?.get("steel")).toEqual({ supply: 75, demand: 30 });
    expect(byState.get("FR_ARA")?.get("steel")).toEqual({ supply: 25, demand: 10 });
    const byCountry = aggregateByCountry(
      byState,
      new Map([
        ["FR_IDF", "FR"],
        ["FR_ARA", "FR"],
      ])
    );
    expect(byCountry.get("FR")?.get("steel")).toEqual({ supply: 100, demand: 40 });
  });

  it("falls back to a national row when the country has no priced region", () => {
    const byCountry = new Map<string, ReturnType<typeof book>>();
    const unplaced = placeBackgroundBooksInStates(
      [{ countryId: "GR", contribution: contribution({ food: { supply: 5, demand: 9 } }) }],
      new Map(),
      new Map()
    );
    addBackgroundBooksToCountries(unplaced, byCountry);
    expect(byCountry.get("GR")?.get("food")).toEqual({ supply: 5, demand: 9 });
  });

  it("only treats tier-resolved background countries as national books", () => {
    const tagged = [
      { entityId: "FR", contribution: contribution({}) },
      { entityId: "CA", contribution: contribution({}) },
      { entityId: "DE", contribution: contribution({}) },
    ];
    expect(
      backgroundCountryContributions(tagged, new Set(["FR"])).map((item) => item.countryId)
    ).toEqual(["FR"]);
    expect(backgroundCountryContributions(tagged, new Set())).toEqual([]);
  });

  it("lets the US export into a background country's demand and import its surplus", () => {
    const fr = buildBackground2027MacroCountry("FR", now);
    const byState = new Map([
      [
        "US_TX",
        book({ chemicals: { supply: 0, demand: 1_000_000 }, software: { supply: 5e6, demand: 0 } }),
      ],
    ]);
    const [france] = backgroundCountryContributions(
      [{ entityId: "FR", contribution: fr.contribution }],
      new Set(["FR"])
    );
    placeBackgroundBooksInStates([france], new Map([["FR", new Map([["FR_IDF", 1]])]]), byState);
    const byCountry = aggregateByCountry(
      byState,
      new Map([
        ["US_TX", "US"],
        ["FR_IDF", "FR"],
      ])
    );
    const frChemicals = byCountry.get("FR")!.get("chemicals")!;
    const frSoftware = byCountry.get("FR")!.get("software")!;
    expect(frChemicals.supply).toBeGreaterThan(frChemicals.demand);
    expect(frSoftware.demand).toBeGreaterThan(frSoftware.supply);

    const countries: CountryId[] = ["US", "FR"];
    const clearing = clearAllCommodities(countries, byCountry, () => 1);
    // US software meets French demand; French chemicals surplus meets US demand.
    expect(clearing.get("software")!.perCountry.US.exports).toBeGreaterThan(0);
    expect(clearing.get("software")!.perCountry.FR.imports).toBeGreaterThan(0);
    expect(clearing.get("chemicals")!.perCountry.US.imports).toBeGreaterThan(0);

    // An embargo-style zero affinity stops the flow.
    const blocked = clearAllCommodities(countries, byCountry, () => 0);
    expect(blocked.get("software")!.perCountry.US.exports).toBe(0);
  });
});
