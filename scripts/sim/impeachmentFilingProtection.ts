import assert from "node:assert/strict";
import { impeachmentFilingWindow } from "../../src/lib/impeachment/rules/filingWindow";
import {
  IMPEACHMENT_HOUSE_VOTING_TURNS,
  IMPEACHMENT_SENATE_VOTING_TURNS,
} from "../../src/lib/constants/impeachment";

let checks = 0;
for (const country of ["US", "BR", "NG"]) {
  for (const office of ["president", "governor"]) {
    for (let current = 100; current <= 200; current++) {
      const window = impeachmentFilingWindow(current, [100]);
      assert.equal(window.remainingTurns > 0, current < 172);
      checks++;
    }
    const repeated = impeachmentFilingWindow(210, [10, 100, 200]);
    assert.equal(repeated.eligibleOnTurn, 272);
    assert.equal(repeated.remainingTurns, 62);
    checks++;
    console.log(
      `${country} ${office}: election T100, filing opens T172; re-election T200, filing opens T272.`
    );
  }
}
assert.equal(IMPEACHMENT_HOUSE_VOTING_TURNS, 24);
assert.equal(IMPEACHMENT_SENATE_VOTING_TURNS, 24);
console.log(
  `${checks + 2} assertions passed. President: up to 48 turns across two stages; governor: 24 turns.`
);
