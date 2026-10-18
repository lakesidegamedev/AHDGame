/**
 * Print every strategy's margin at base prices (or a scenario's prices).
 *   npx tsx scripts/economy/base-margins.ts [scenario.json]
 * Pure: reads no database. See src/lib/economy/repricer/baseMargins.ts.
 */
import { readFileSync } from "node:fs";
import { baseMarginTable, type BaseMarginScenario } from "@/lib/economy/repricer/baseMargins";

const scenario: BaseMarginScenario = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : {};
const rows = baseMarginTable(scenario);
if (process.env.JSON === "1") {
  console.log(JSON.stringify(rows));
} else {
  const f = (n: number) => n.toFixed(1).padStart(7);
  console.log("sector/strategy".padEnd(44) + "  inputs  labour  overhd    bare  owntype offtype");
  for (const r of rows)
    console.log(
      `${r.sectorType}/${r.strategyId}`.padEnd(44) +
        f(r.inputsPct) +
        f(r.labourPct) +
        f(r.overheadPct) +
        f(r.bareMarginPct) +
        f(r.ownTypeMarginPct) +
        f(r.offTypeMarginPct)
    );
}
