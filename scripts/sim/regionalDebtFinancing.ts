import assert from "node:assert/strict";
import {
  settleRegionalDebt,
  regionalDebtApprovalPenalty,
  type RegionalDebtLedger,
} from "../../src/lib/budget/rules/regionalDebt";
const scenarios = [
  {
    name: "USD deficit",
    cash: 0,
    revenue: 1_000_000_000,
    spending: 1_100_000_000,
    gdp: 5_000_000_000,
  },
  {
    name: "CAD deficit",
    cash: 0,
    revenue: 1_000_000_000,
    spending: 1_100_000_000,
    gdp: 5_000_000_000,
  },
  {
    name: "Legacy debt and recovery",
    cash: -50_000_000,
    revenue: 1_100_000_000,
    spending: 1_000_000_000,
    gdp: 5_000_000_000,
  },
];
for (const scenario of scenarios) {
  let previous: RegionalDebtLedger | undefined;
  let revenue = 0,
    spending = 0,
    interest = 0;
  for (let turn = 1; turn <= 96; turn++) {
    const cash = previous?.cash ?? scenario.cash;
    previous = settleRegionalDebt({
      previous,
      openingCash: cash,
      annualRevenue: scenario.revenue,
      annualPrimarySpending: scenario.spending,
      turn,
      turnsPerYear: 48,
    });
    revenue += Math.round((scenario.revenue / 48) * 100) / 100;
    spending += Math.round((scenario.spending / 48) * 100) / 100;
    interest += previous.interestPaid;
    assert(
      Math.abs(
        previous.cash - previous.principal - (scenario.cash + revenue - spending - interest)
      ) < 0.001
    );
    assert.equal(
      settleRegionalDebt({
        previous,
        openingCash: cash,
        annualRevenue: scenario.revenue,
        annualPrimarySpending: scenario.spending,
        turn,
        turnsPerYear: 48,
      }),
      previous
    );
    if (turn === 48 || turn === 96)
      console.log(
        JSON.stringify({
          scenario: scenario.name,
          turn,
          principal: previous.principal,
          cash: previous.cash,
          interestPaid: Math.round(interest * 100) / 100,
          approvalPenalty: regionalDebtApprovalPenalty(previous.principal, scenario.gdp),
        })
      );
  }
}
