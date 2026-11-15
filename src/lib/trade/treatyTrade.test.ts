import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import { ftaPairKey, type FtaPairSet } from "@/lib/tariffs/ftaOverrides";
import { clearCommodity } from "./clearing";
import { buildTradeAffinity, type TradeAffinityContext } from "./tradeAffinity";
import { treatyAffinityMultiplier, treatyImportCostMultiplier } from "./rules/treatyTrade";

const countries = ["US", "DE", "JP"] as CountryId[];
const ctx = (over: Partial<TradeAffinityContext> = {}): TradeAffinityContext => ({
  ftaPairs: new Set() as FtaPairSet,
  blocsByCountry: new Map(),
  tariffs: [],
  embargoes: [],
  ...over,
});

/** US has the surplus; DE and JP both want it. Returns units shipped from US to each. */
function clearRareEarth(over: Partial<TradeAffinityContext>) {
  const { affinityFor, capUnitsFor, importCostMultiplierFor } = buildTradeAffinity(ctx(over));
  const result = clearCommodity({
    countries,
    supply: { US: 100 },
    demand: { DE: 60, JP: 60 },
    affinity: (e, i) => affinityFor("rare_earth", e, i),
    capUnits: (e, i) => capUnitsFor("rare_earth", e, i),
    importCostMultiplier: (e, i) => importCostMultiplierFor("rare_earth", e, i),
  });
  return { toDE: result.flow.US?.DE ?? 0, toJP: result.flow.US?.JP ?? 0, result };
}

describe("a sanction cuts trade between the pair", () => {
  it("moves the sanctioned partner's share of the surplus to the other buyer", () => {
    const open = clearRareEarth({});
    expect(open.toDE).toBeGreaterThan(0);
    const embargo = {
      sourceCountry: "US",
      targetCountry: "DE",
      commodity: "all",
      direction: "both",
      mode: "block",
      origin: "crisis",
      createdTurn: 1,
    } as TradeEmbargo;
    const sanctioned = clearRareEarth({ embargoes: [embargo] });
    expect(sanctioned.toDE).toBe(0);
    expect(sanctioned.toJP).toBeGreaterThan(open.toJP);
  });
});

describe("a trade treaty raises trade between its members", () => {
  const members = new Map([
    ["US", new Set(["CRITICAL_MINERALS_CLUB"])],
    ["DE", new Set(["CRITICAL_MINERALS_CLUB"])],
    ["JP", new Set<string>()],
  ]);
  const active = new Set(["CRITICAL_MINERALS_CLUB"]);

  it("shifts the surplus toward the fellow member", () => {
    const without = clearRareEarth({ blocsByCountry: members });
    const withTreaty = clearRareEarth({ blocsByCountry: members, activeTreaties: active });
    expect(withTreaty.toDE).toBeGreaterThan(without.toDE);
    expect(withTreaty.toJP).toBeLessThan(without.toJP);
  });

  it("does nothing once its terms lapse, or for commodities it does not name", () => {
    const lapsed = clearRareEarth({ blocsByCountry: members, activeTreaties: new Set() });
    expect(lapsed.toDE).toBeCloseTo(clearRareEarth({ blocsByCountry: members }).toDE);
    const orgs = members.get("US");
    const deOrgs = members.get("DE");
    expect(treatyAffinityMultiplier("steel", orgs, deOrgs, active)).toBe(1);
    expect(treatyAffinityMultiplier("rare_earth", orgs, deOrgs, active)).toBeGreaterThan(1);
  });

  it("lowers landed cost between members only", () => {
    const fns = buildTradeAffinity(ctx({ blocsByCountry: members, activeTreaties: active }));
    expect(fns.importCostMultiplierFor("rare_earth", "US", "DE")).toBeLessThan(1);
    expect(fns.importCostMultiplierFor("rare_earth", "US", "JP")).toBe(1);
    expect(
      treatyImportCostMultiplier("rare_earth", members.get("US"), members.get("JP"), active)
    ).toBe(1);
  });
});
