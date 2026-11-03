/** Deterministic fixed-input confidence replay; not a whole-economy forecast. */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import {
  COUNTRY_CONFIGS,
  supportsSnapElections,
  hasConfidenceVoteMechanism,
} from "../../src/lib/constants/countries";
import { snapConfidenceReset } from "../../src/lib/turn/rules/snapConfidence";
import {
  tickConfidence,
  confidenceAfterGovernmentFormation,
  applyConfidenceEvent,
} from "../../src/lib/countries/uk/confidence/confidenceGauge";
const countries = Object.entries(COUNTRY_CONFIGS)
  .filter(([, c]) => supportsSnapElections(c) && hasConfidenceVoteMechanism(c))
  .map(([id]) => id);
let cases = 0;
const startingCases: { country: string; before: number; after: number; after48Turns: number }[] =
  [];
for (const country of countries) {
  for (const initial of [0, 10, 49.9, 50, 90, 100]) {
    const reset = snapConfidenceReset(3)!;
    assert.equal(reset.value, 50, country);
    let value = reset.value;
    for (let hour = 1; hour <= 48; hour++) {
      assert.equal(snapConfidenceReset(3, 3), null);
      value = tickConfidence(value, { approval: 25 });
      assert.equal(value, Math.max(0, 50 - hour));
    }
    assert.equal(snapConfidenceReset(4, 3)?.value, 50);
    assert.equal(snapConfidenceReset(2, 3), null);
    assert.equal(confidenceAfterGovernmentFormation(reset.value), 55);
    startingCases.push({ country, before: initial, after: reset.value, after48Turns: value });
    cases++;
  }
}
const trajectories = [0, 25, 50, 75, 100].map((approval) => {
  let value = 50;
  let firstZero: number | null = null;
  for (let turn = 1; turn <= 96; turn++) {
    value = tickConfidence(value, { approval });
    if (value === 0 && firstZero === null) firstZero = turn;
  }
  return { approval, confidenceAtTurn96: value, firstZeroAfterReset: firstZero };
});
assert.equal(trajectories.find((x) => x.approval === 0)!.firstZeroAfterReset, 25);
assert.equal(trajectories.find((x) => x.approval === 25)!.firstZeroAfterReset, 50);
assert.equal(applyConfidenceEvent(50, { kind: "budgetDefeat" }), 0);
const report = {
  kind: "deterministic fixed-input confidence replay",
  countries,
  cases,
  startingCases,
  horizonTurns: 96,
  resetValue: 50,
  retryReplays: cases * 48,
  allAssertionsPassed: true,
  formationFromReset: 55,
  trajectories,
  limits: [
    "This reset prevents immediate dissolution caused by inherited zero confidence; it does not prevent later legitimate confidence loss.",
    "Budget defeats and the separate PM vacancy deadline retain their rules.",
    "These are synthetic constant-input trajectories, not forecasts for a live country.",
  ],
};
const index = process.argv.indexOf("--out");
if (index < 0 || !process.argv[index + 1]) throw Error("--out is required");
writeFileSync(process.argv[index + 1], JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({ countries: countries.length, cases, retries: cases * 48, passed: true })
);
