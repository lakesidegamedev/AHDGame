import { describe, expect, it } from "vitest";
import corporationsEn from "../../messages/en/corporations.json";
import corporationsDe from "../../messages/de/corporations.json";
import electionsEn from "../../messages/en/elections.json";
import electionsDe from "../../messages/de/elections.json";

type Tree = { [key: string]: string | Tree };

function get(tree: Tree, path: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of path.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

const names = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();

// Keys that must exist in German. Add new player-facing keys here as they land.
const CORPORATIONS = [
  "corporations.supplyAgreements.negotiation.moneyMarket",
  "corporations.supplyAgreements.negotiation.moneyRange",
  "corporations.supplyAgreements.negotiation.moneyBuyerSide",
  "corporations.supplyAgreements.negotiation.moneySellerSide",
  "corporations.supplyAgreements.negotiation.moneyPerDay",
  "corporations.sectorInvestment.freightNoneEstimate",
  "corporations.sectorInvestment.forecastUnavailableReasons.noCapacity",
  "corporations.sectorInvestment.forecastUnavailableReasons.notRun",
  "corporations.sectorInvestment.forecastUnavailableReasons.mothballed",
  "corporations.sectorInvestment.forecastUnavailableReasons.ramping",
  "corporations.sectorInvestment.forecastUnavailableReasons.transition",
  "corporations.sectorInvestment.forecastUnavailableReasons.upkeepBasis",
  "corporations.sectorInvestment.forecastUnavailableReasons.other",
  "corporations.sectorInvestment.noExtraBuyersNote",
  "corporations.sectorInvestment.warnFreight",
  "corporations.sectorInvestment.invalidBuildCount",
  "corporations.sectorInvestment.marketReadout.nationalMarket",
  "corporations.sectorInvestment.marketReadout.sidebarCapped",
  "corporations.sectorInvestment.marketReadout.capNote",
  "corporations.runHold.stoppedByInput",
  "corporations.runHold.stoppedByInputHelp",
];

const ELECTIONS = [
  "elections.campaignTargeting.unitCost",
  "elections.campaignManager.finder.showUnopposed",
  "elections.campaignManager.finder.hideUnopposed",
  "elections.campaignManager.race.primaryShareNote",
  "elections.campaignManager.chart.loading",
  "elections.campaignManager.map.legendScale",
  "elections.campaignManager.map.legendScalePrimary",
];

describe.each([
  ["corporations", CORPORATIONS, corporationsEn, corporationsDe],
  ["elections", ELECTIONS, electionsEn, electionsDe],
] as Array<[string, string[], Tree, Tree]>)("German parity: %s", (_n, keys, en, de) => {
  it.each(keys)("%s is translated with the same placeholders", (key) => {
    const english = get(en, key);
    const german = get(de, key);
    expect(english, "English key exists").toBeDefined();
    expect(german, "German key exists").toBeDefined();
    expect(names(german as string)).toEqual(names(english as string));
  });
});
