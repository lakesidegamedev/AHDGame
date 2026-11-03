/** Synthetic accounting replay. No database, player records or ambient time. */
import { acquisitionBalanceSheet } from "../../src/lib/corporations/commands/acquisitions/rules";
import {
  getNewCharacterTransferBarrier,
  getNewCorporationFoundingBarrier,
} from "../../src/lib/character/rules/newCharacterTransferBarrier";

const rows: object[] = [];
for (const [country, localPerAnchor] of [
  ["US", 1],
  ["UK", 2],
  ["JP", 100],
] as const) {
  for (const scenario of [
    { name: "cash IPO shell", cash: 20_000_000, investments: 0, debt: 0, oldPrice: 1_000_000 },
    { name: "private starter shell", cash: 5_000_000, investments: 0, debt: 0, oldPrice: 100_000 },
    {
      name: "cash moved into securities",
      cash: 0,
      investments: 20_000_000,
      debt: 0,
      oldPrice: 1_000_000,
    },
    {
      name: "debt-financed subsidiary",
      cash: 20_000_000,
      investments: 0,
      debt: 18_000_000,
      oldPrice: 1_000_000,
    },
  ]) {
    const { minimumPriceAnchor: floor } = acquisitionBalanceSheet({
      cashAnchor: (scenario.cash * localPerAnchor) / localPerAnchor,
      sectorsAnchor: 0,
      bankEquityAnchor: 0,
      fundsAnchor: 0,
      receivablesAnchor: 0,
      facilityDebtLocal: 0,
      facilityFxRate: localPerAnchor,
      heldBonds: [
        {
          units: scenario.investments / 1000,
          faceValue: 1000 * localPerAnchor,
          marketPrice: 1,
          fxRate: localPerAnchor,
        },
      ],
      heldShares: [],
      issuedBonds: [{ principalLocal: scenario.debt * localPerAnchor, fxRate: localPerAnchor }],
    });
    const netAssets = scenario.cash + scenario.investments - scenario.debt;
    const gain = netAssets - floor;
    if (gain > 0) throw new Error("Acquisition extracts net assets below their cost");
    rows.push({
      country,
      scenario: scenario.name,
      previousNetAssetGain: netAssets - scenario.oldPrice,
      minimumPriceAnchor: floor,
      protectedNetAssetGain: gain,
    });
  }
}
for (const age of [0, 23, 24, 47, 48, 49]) {
  const input = { createdTurn: 100 };
  const transfer = getNewCharacterTransferBarrier(input, 100 + age, 0);
  const ordinaryFounding = getNewCorporationFoundingBarrier(input, 100 + age, 0, false);
  const launchFounding = getNewCorporationFoundingBarrier(input, 100 + age, 0, true);
  if (
    transfer.blocked !== age < 48 ||
    ordinaryFounding.blocked !== transfer.blocked ||
    launchFounding.blocked
  )
    throw new Error("Incorrect startup restriction boundary");
  rows.push({
    age,
    transfersBlocked: transfer.blocked,
    corporationCreationBlocked: ordinaryFounding.blocked,
    foundingPeriodCreationBlocked: launchFounding.blocked,
  });
}
console.log(JSON.stringify({ verdict: "passed", cases: rows.length, rows }, null, 2));
