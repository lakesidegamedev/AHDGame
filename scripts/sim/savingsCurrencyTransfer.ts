/** Small deterministic currency-transfer replay; no server or database access. */
import { redenominateSavings } from "../../src/lib/savings/rules/redenomination";
const scenarios = [
  { source: "GBP", destination: "IEP", scale: 0.97 },
  { source: "USD", destination: "JPY", scale: 145 },
  { source: "JPY", destination: "GBP", scale: 0.005 },
  { source: "GBP", destination: "GBP", scale: 1 },
  { source: "IEP", destination: "USD", scale: 1.1 },
];
for (const scenario of scenarios) {
  for (const existing of [0, 20_000]) {
    const source = { balance: 100_000, accruedInterest: 120, interestEarned: 900 };
    const destination = { balance: existing, accruedInterest: 0, interestEarned: 0 };
    const result = redenominateSavings(source, destination, scenario.scale);
    const error = Math.abs((result.balance - existing) / scenario.scale - source.balance);
    if (error > 1e-8) throw new Error("Currency value was not conserved.");
    console.log(JSON.stringify({ ...scenario, existing, result, conservationError: error }));
  }
}
console.log("10 deterministic currency/account scenarios passed.");
