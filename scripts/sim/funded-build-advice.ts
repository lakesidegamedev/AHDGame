/** Small deterministic qualification: no database, network or live writes. */
import assert from "node:assert/strict";
import { settleProducerMarket } from "../../src/lib/market/producerMarket/rules";
import { fundedBuildDemand } from "../../src/lib/corporations/rules/fundedBuildDemand";
import { COMMODITY_TYPES } from "../../src/lib/constants/commoditiesCore";
import {
  isCountryBookCommodity,
  isStateScopedCommodity,
} from "../../src/lib/market/rules/commodityMarketScope";

const results = [];
for (const [countryId, stateId] of [
  ["US", "TX"],
  ["UK", "SCO"],
  ["JP", "KNS"],
]) {
  const accounts = [
    { id: "buyer", cash: 100_000 },
    { id: "seller", cash: 0 },
  ];
  const offers = COMMODITY_TYPES.map((commodity) => ({
    id: commodity,
    accountId: "seller",
    commodity,
    countryId,
    stateId,
    units: 3,
    unitPrice: 1,
    book: isCountryBookCommodity(commodity)
      ? `country:${countryId}`
      : isStateScopedCommodity(commodity)
        ? `state:${stateId}`
        : "world",
  }));
  const orders = offers.map((o) => ({
    id: `order:${o.id}`,
    accountId: "buyer",
    commodity: o.commodity,
    countryId,
    stateId,
    book: o.book,
    units: 10,
    maximumUnitPrice: 2,
  }));
  const baseline = settleProducerMarket({ turn: 1, accounts, offers, orders });
  const { countryBooks, regionalBooks, ...economic } = settleProducerMarket({
    turn: 1,
    accounts,
    offers,
    orders,
    trackCountryBooks: true,
  });
  assert.deepEqual(economic, baseline);
  for (const commodity of COMMODITY_TYPES) {
    const rows = fundedBuildDemand({
      supply: { [commodity]: 1 },
      countryId,
      stateId,
      countries: countryBooks ?? [],
      regions: regionalBooks,
      regionalUnitScale: 1,
    });
    assert.equal(rows.at(-1)?.unmet, 7);
    if (isStateScopedCommodity(commodity) && !isCountryBookCommodity(commodity))
      assert.equal(rows.length, 1);
  }
  const telecom = fundedBuildDemand({
    supply: { network_services: 1, software: 1 },
    countryId,
    stateId,
    countries: (countryBooks ?? []).map((b) =>
      b.commodity === "software" ? { ...b, funded: 3, filled: 3 } : b
    ),
    regions: regionalBooks,
    regionalUnitScale: 1,
  });
  assert.equal(
    telecom.find((r) => r.commodity === "network_services" && r.scope === "national")?.unmet,
    7
  );
  results.push({
    countryId,
    commodities: COMMODITY_TYPES.length,
    unchangedSettlement: true,
    constructionUnmet: 7,
    telecomNetworkUnmet: 7,
    softwareUnmet: 0,
  });
}
console.log(
  JSON.stringify(
    {
      scenario: "Funded build advice scope and settlement conservation",
      verdict: "passed",
      results,
    },
    null,
    2
  )
);
