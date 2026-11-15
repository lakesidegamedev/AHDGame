/** Deterministic source-based Canadian fuel-risk sensitivity qualification. */
import { CA_ENERGY_2025 } from "../../src/lib/countries/ca/data/caEnergy2025";
import { canadianEnergySecurity } from "../../src/lib/countries/ca/rules/energySecurity";

const risk = (imports: number, stocks: number) =>
  canadianEnergySecurity({
    ...CA_ENERGY_2025,
    fuels: CA_ENERGY_2025.fuels.map((fuel) => ({
      ...fuel,
      annualImports: fuel.annualImports * imports,
      decemberClosingCommercialStock: fuel.decemberClosingCommercialStock * stocks,
    })),
  }).value!;
const imports = [0, 0.5, 1, 1.5, 2];
const stocks = [0, 0.5, 1, 2, 5];
const scenarios = imports.flatMap((importMultiplier) =>
  stocks.map((stockMultiplier) => ({
    importMultiplier,
    stockMultiplier,
    risk: risk(importMultiplier, stockMultiplier),
  }))
);
const failures: string[] = [];
for (const stock of stocks)
  for (let i = 1; i < imports.length; i++)
    if (risk(imports[i]!, stock) < risk(imports[i - 1]!, stock))
      failures.push("More imports reduced exposure");
for (const imp of imports)
  for (let i = 1; i < stocks.length; i++)
    if (risk(imp, stocks[i]!) > risk(imp, stocks[i - 1]!))
      failures.push("More inventory increased exposure");
if (scenarios.some((s) => !Number.isFinite(s.risk) || s.risk < 0 || s.risk > 100))
  failures.push("Invalid risk band");
console.log(
  JSON.stringify(
    {
      qualified: failures.length === 0,
      source: CA_ENERGY_2025,
      baseline: canadianEnergySecurity(CA_ENERGY_2025),
      scenarios,
      failures,
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
