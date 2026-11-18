import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guards the rule stated in corporationCapital.ts: "Use this for anything that
 * DISPLAYS or RANKS a value. Use loadFxRatesByCurrency for anything that
 * SETTLES one."
 *
 * The valuation map backfills an authored era rate for the six bloc currencies
 * that have no live `exchangeRates` row (PLZ, CSK, HUF, YUD, BGL, ROL — 102
 * corporations at turn 366). The settlement map deliberately leaves them
 * missing so a money-moving path fails closed instead of converting at 1.0.
 *
 * A file-level guard rather than a unit test because the defect is "this module
 * imported the wrong one of two identically-shaped functions", which no
 * behavioural test on a single module would catch.
 */
const DISPLAY_PATHS = [
  "src/lib/corporations/queries/corporationDetail/portfolioHoldings.ts",
  "src/lib/corporations/queries/corporationDetail/subsidiaryContext.ts",
  "src/lib/api/commands/stock-exchange/wealth-list/handlers.ts",
  "src/lib/turn/investorWealthSnapshots.ts",
  "src/lib/character/financialData.ts",
  "src/lib/api/commands/discord-bot/financials/handlers.ts",
  "src/lib/api/commands/discord-bot/corporation/handlers.ts",
  // Portfolio valuation must agree with the portfolio route above, including
  // the history series rendered on the same page.
  "src/lib/portfolio/loadCharacterPortfolio.ts",
  "src/lib/turn/portfolioSnapshot.ts",
  "src/lib/api/commands/corporations/[id]/portfolio/handlers.ts",
  "src/lib/world/legacyLeaderboard.ts",
  // Ranks corps by revenue for the player info panel.
  "src/app/api/pip/corp/route.ts",
  // Cross-border sector money is stored in the host's era currency (FRF, ITL,
  // ...), which has no live row. These readers restate it for people, so they
  // need the authored fallback the engine uses or they show it 4.2x / 833x high.
  "src/lib/corporations/commands/capitalOperations/updateCorporationSettings.ts",
  "src/app/api/discord-bot/sectors/route.ts",
  "src/app/api/discord-bot/marketshare/route.ts",
  // Engine mirrors and money movers that read the same cross-border sector
  // money. The engine converts it at the authored rate, so each of these must
  // too: on a live-only map a French sector reads 4.2x and an Italian one 833x
  // high, which inflates bond ceilings, SOE remittance and nationalization
  // valuations instead of matching what the engine paid.
  "src/lib/corporations/corpMarketShare.ts",
  "src/lib/corporations/marketShare.ts",
  "src/lib/corporations/dailyGrossRevenue.ts",
  "src/lib/budget/publicEnterpriseRevenue.ts",
  "src/lib/nationalization/soeRemittance.ts",
  "src/lib/nationalization/soeOperations.ts",
  "src/lib/nationalization/ownershipTransition.ts",
  "src/lib/corporations/issueRelocationBond.ts",
  "src/lib/api/commands/corporations/[id]/bonds/handlers.ts",
  "src/lib/bonds/executeCorporationBondRefinance.ts",
  "src/lib/bonds/executeCorporationBondDefaultDissolution.ts",
  "src/lib/bonds/executeCorporationBondRestructure.ts",
];

/**
 * Where the line sits, because "this file performs no writes" is NOT the test.
 *
 * Use the VALUATION map when the surface values a holding for a human to read
 * or rank: portfolios, wealth lists, leaderboards, corp balance figures.
 *
 * Keep the SETTLEMENT map when the surface moves money in a currency that has
 * to exist as a live market (a trade, a refund, a takeover price) so it can fail
 * closed instead of converting at a turn-0 anchor.
 *
 * Reading stored sector money is a different case, even when the reader moves
 * money with it: the engine itself restates cross-border sector fields at the
 * authored era rate, so a bond ceiling, remittance or nationalization value
 * built from those fields must use that rate too. `inflationDiagnostics` still
 * reads the stored `surplus` cache and takes no FX map, so it is not listed.
 */
const SETTLEMENT_PATHS = [
  "src/lib/banking/lending.ts",
  "src/lib/banking/propTrading.ts",
  "src/lib/corporations/cancelShareListing.ts",
  "src/lib/corporations/commands/takeovers/hostileTakeover.ts",
  "src/lib/budget/revenue.ts",
];

describe("valuation vs settlement FX usage", () => {
  it.each(DISPLAY_PATHS)("%s uses the valuation map", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("loadValuationFxRates");
    expect(source).not.toContain("loadFxRatesByCurrency");
  });

  it.each(SETTLEMENT_PATHS)("%s keeps the settlement map", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("loadFxRatesByCurrency");
    expect(source).not.toContain("loadValuationFxRates");
  });
});

it("the profile portfolio delegates valuation to the same FX-aware loader as the owner view", () => {
  const route = readFileSync("src/app/api/character/[id]/portfolio/route.ts", "utf8");
  const loader = readFileSync("src/lib/portfolio/loadCharacterPortfolio.ts", "utf8");
  expect(route).toContain('from "@/lib/portfolio/loadCharacterPortfolio"');
  expect(route).toContain("loadPortfolioForCharacter(db, character, forexEnabled");
  expect(route).not.toContain("loadFxRatesByCurrency");
  expect(loader).toContain("loadValuationFxRates");
  expect(loader).not.toContain("loadFxRatesByCurrency");
});
