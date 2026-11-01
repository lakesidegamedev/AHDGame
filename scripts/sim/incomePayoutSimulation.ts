/** Synthetic currency-scaled scenarios; no player data or production writes. */
import { planIncomePayout } from "../../src/lib/budget/rules/incomePayout";
import { COUNTRY_CURRENCY_MAP } from "../../src/lib/constants/currencies";
const results = [];
for (const [country, currency] of Object.entries(COUNTRY_CURRENCY_MAP)) {
  const fx = currency === "JPY" ? 150 : currency === "GBP" ? 0.8 : 1;
  const federal = 1000 * fx;
  let collectedFederal = 0;
  let clearedTurn: number | null = null;
  let income = 0;
  for (let turn = 1; turn <= 48; turn++) {
    const gross = 100 * fx;
    const paid = planIncomePayout({
      gross,
      income: gross,
      capital: 0,
      sourceFx: fx,
      incomeRates: { national: 20, regional: 10 },
      capitalRates: { national: 20, regional: 10 },
      debts: [
        { id: "opening-debt", turn: 0, federal, regional: 0, collectedFederal, sourceFx: fx },
      ],
    });
    collectedFederal += paid.arrears.reduce((sum, payment) => sum + payment.slice.federal, 0);
    income += paid.net;
    const conservation = paid.net + paid.currentTax + paid.arrearsPaid;
    if (Math.abs(conservation - gross) > 1e-6) throw new Error("Money conservation failed");
    if (clearedTurn === null && federal - collectedFederal < 1e-6) clearedTurn = turn;
  }
  if (clearedTurn !== 15) throw new Error("Arrears should clear on turn 15: " + country);
  results.push({
    country,
    currency,
    clearedTurn,
    spendableAnchorOver48Turns: Math.round((income / fx) * 100) / 100,
  });
}
console.log(
  JSON.stringify(
    {
      scenario: "100 anchor income/turn, 30% current tax, 1000 anchor old debt; no later debts",
      countries: results.length,
      results,
    },
    null,
    2
  )
);
