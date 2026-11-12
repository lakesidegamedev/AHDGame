/** Emit client-safe seat projections; raw results and derivation stay off the client graph. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import snapshot from "../../src/lib/countries/us/data/us2026ResultsSnapshot.json";
import { US_SENATE_BASE_2027 } from "../../src/lib/countries/us/data/usSenateBase2027";
import {
  openingParty,
  provisionalHouseSeats,
  provisionalSenateSeats,
  provisionalStateSenates,
} from "../../src/lib/countries/us/rules/provisionalOpeningSeats";

const groups = [
  ["usHouse2027", { US_HOUSE_2027: provisionalHouseSeats(snapshot.house) }],
  [
    "usSenate2027",
    { US_SENATE_2027: provisionalSenateSeats(US_SENATE_BASE_2027, snapshot.senate) },
  ],
  [
    "usStateOffices2027",
    {
      US_GOVERNORS_2027: snapshot.governors.map((row) => ({
        state: row.state,
        officeType: "governor",
        party: openingParty(row.party),
      })),
      US_STATE_SENATE_2027: provisionalStateSenates(snapshot.stateSenates),
    },
  ],
] as const;
async function main() {
  for (const [file, exports] of groups) {
    const header =
      '/** Dated provisional 2026 results, emitted by scripts/seeds/derive-us-opening-seats-2027.ts. */\nimport type { HistoricalSeat } from "@/lib/constants/historicalSeats";\n';
    const body = Object.entries(exports)
      .map(
        ([name, rows]) =>
          `export const ${name}: HistoricalSeat[] = ${JSON.stringify(rows, null, 2)};\n`
      )
      .join("\n");
    const filename = resolve(`src/lib/countries/us/data/${file}.ts`);
    writeFileSync(
      filename,
      await format(header + body, { ...(await resolveConfig(filename)), filepath: filename })
    );
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
