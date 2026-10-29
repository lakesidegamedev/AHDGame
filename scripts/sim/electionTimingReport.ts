/**
 * Election timing replay: check 10 recurring cycles for each changed race.
 * Runs only portable scheduling math and never connects to a world database.
 */
import assert from "node:assert/strict";
import { canonicalTurnsForCycle } from "../../src/lib/elections/canonicalCycle";
import { DEFAULT_DURATIONS } from "../../src/lib/constants/electionDurations";

const totals = {
  house: 96,
  senate: 288,
  governor: 192,
  stateSenate: 192,
  president: 192,
  shugiin: 192,
  sangiin: 144,
};
const races = Object.entries(totals).map(([electionType, total]) => {
  assert.equal(DEFAULT_DURATIONS[electionType].durationHours, total);
  const cycles = Array.from({ length: 10 }, (_, i) => {
    const cycle = i + 2;
    const bounds = canonicalTurnsForCycle({
      electionType,
      cycle,
      senateClass: 1,
      chamberClass: 1,
    });
    assert.ok(bounds, electionType);
    assert.equal(bounds.endTurn - bounds.primaryEndTurn, 24);
    assert.equal(bounds.endTurn - bounds.startTurn, total);
    return { cycle, ...bounds };
  });
  return { electionType, total, cycles };
});
console.log(JSON.stringify({ verdict: "passed", cyclesChecked: 70, races }, null, 2));
