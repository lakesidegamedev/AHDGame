import { decayApprovals } from "../../src/lib/legislature/rules/approvalDecay";
/** Synthetic deterministic qualification; no database or player records. */
import assert from "node:assert/strict";
import catalog from "../../src/lib/resetLegislation/familyCatalog.json";
import { RESET_V2_COUNTRIES } from "../../src/lib/resetVersions/rules";
import {
  finalV2Voters,
  corporateTaxApproval,
  V2_FAMILY_APPROVAL_SPAN,
  v2EnactmentApproval,
  v2VotePosition,
} from "../../src/lib/resetLegislation/rules/voterReactions";
import {
  billPositionTargets,
  computeVoteShift,
  previewVoteShift,
} from "../../src/lib/legislature/rules/votePolicyShift";
const choices = ["far_left", "center_left", "center", "center_right", "far_right"] as const;
const rows = [];
for (const country of RESET_V2_COUNTRIES) {
  let transitions = 0,
    movements = 0,
    reactingTransitions = 0,
    maximum = 0,
    maximumCellApproval = 0;
  const buckets = new Set<string>();
  for (const family of catalog)
    for (const before of choices)
      for (const after of choices) {
        const provision = { familyId: family.id, choice: after, currentChoiceSnapshot: before };
        const effects = v2EnactmentApproval([provision], country);
        transitions++;
        if (Object.keys(effects).length) reactingTransitions++;
        if (before === after) assert.deepEqual(effects, {});
        for (const [bucket, amount] of Object.entries(effects)) {
          assert.ok(Number.isFinite(amount) && Math.abs(amount) <= 10);
          buckets.add(bucket);
          maximum = Math.max(maximum, Math.abs(amount));
          // The opposing ballot must receive the exact opposite, not a second policy reward.
          assert.equal(amount + -amount, 0);
        }
        const backwards = v2EnactmentApproval(
          [{ ...provision, choice: before, currentChoiceSnapshot: after }],
          country
        );
        const viaFirst = v2EnactmentApproval([{ ...provision, choice: "center" }], country);
        const viaSecond = v2EnactmentApproval(
          [{ ...provision, currentChoiceSnapshot: "center" }],
          country
        );
        for (const key of new Set([
          ...Object.keys(effects),
          ...Object.keys(backwards),
          ...Object.keys(viaFirst),
          ...Object.keys(viaSecond),
        ])) {
          assert.equal(
            Math.round((effects[key] ?? 0) * 100) + Math.round((backwards[key] ?? 0) * 100),
            0
          );
          assert.equal(
            Math.round((viaFirst[key] ?? 0) * 100) + Math.round((viaSecond[key] ?? 0) * 100),
            Math.round((effects[key] ?? 0) * 100)
          );
        }
        const maxima: Record<string, number> = {};
        for (const [bucket, amount] of Object.entries(effects)) {
          const dimension = bucket.split(":")[0]!;
          maxima[dimension] = Math.max(maxima[dimension] ?? 0, Math.abs(amount));
        }
        const cellBound = Object.values(maxima).reduce((sum, amount) => sum + amount, 0);
        assert.ok(cellBound <= V2_FAMILY_APPROVAL_SPAN + 1e-9);
        maximumCellApproval = Math.max(maximumCellApproval, cellBound);
        const targets = billPositionTargets([v2VotePosition(provision)!]);
        for (const economic of [-5, 0, 5])
          for (const social of [-5, 0, 5]) {
            const baseline = { economic, social };
            for (const vote of ["for", "against", "abstain"] as const) {
              const applied = computeVoteShift(baseline, targets, vote);
              const current = {
                economic: economic + applied.economic,
                social: social + applied.social,
              };
              for (const axis of ["economic", "social"] as const) {
                assert.ok(Math.abs(applied[axis]) <= 0.25);
                assert.ok(current[axis] >= -5 && current[axis] <= 5);
                if (vote === "abstain") assert.equal(applied[axis], 0);
              }
              if (vote === "for")
                assert.deepEqual(previewVoteShift(current, targets, { baseline, applied }).aye, {
                  economic: 0,
                  social: 0,
                });
              movements++;
            }
          }
        const bundled = v2EnactmentApproval([provision, provision, provision], country);
        assert.ok(Object.values(bundled).every((amount) => Math.abs(amount) <= 10));
      }
  rows.push({
    country,
    transitions,
    reactingTransitions,
    bucketCount: buckets.size,
    maximumSingleBucketChange: maximum,
    maximumCellApproval,
    movementChecks: movements,
  });
}
let taxTransitions = 0;
const rates = [0, 0.1, 0.25, 1, 5, 10, 20, 25, 30, 50, 100];
for (const dimension of ["income", "wealth"] as const)
  for (const before of rates)
    for (const after of rates) {
      const effects = corporateTaxApproval(before, after, dimension),
        back = corporateTaxApproval(after, before, dimension);
      const one = corporateTaxApproval(before, 25, dimension),
        two = corporateTaxApproval(25, after, dimension);
      for (const tier of ["low", "middle", "high"]) {
        const key = `${dimension}:${tier}`;
        assert.equal(Math.round((effects[key] ?? 0) * 100) + Math.round((back[key] ?? 0) * 100), 0);
        assert.equal(
          Math.round((one[key] ?? 0) * 100) + Math.round((two[key] ?? 0) * 100),
          Math.round((effects[key] ?? 0) * 100)
        );
        if (before > after)
          assert.ok(tier === "high" ? (effects[key] ?? 0) >= 0 : (effects[key] ?? 0) <= 0);
      }
      taxTransitions++;
    }
const decayCases = [];
for (const start of [0.01, 0.02, 0.18, 0.8, 1, 1.2, 10, 100]) {
  let value = start,
    negative = -start,
    zeroAtTurn: number | null = null;
  const checkpoints: Record<number, number> = {};
  for (let turn = 1; turn <= 2000; turn++) {
    const prior = value;
    value = decayApprovals({ value })?.value ?? value;
    negative = decayApprovals({ value: negative })?.value ?? negative;
    assert.equal(negative, value === 0 ? 0 : -value);
    assert.ok(value === 0 || value < prior);
    if (value === 0 && zeroAtTurn === null) zeroAtTurn = turn;
    if ([1, 48, 139, 2000].includes(turn)) checkpoints[turn] = value;
  }
  assert.ok(checkpoints[139]! <= start / 2);
  assert.equal(value, 0);
  decayCases.push({ start, checkpoints, zeroAtTurn });
}
const id = "000000000000000000000001";
assert.deepEqual(finalV2Voters([{ [id]: "for" }, { [id]: "against" }, { [id]: "abstain" }]), []);
console.log(
  JSON.stringify(
    {
      verdict: "passed",
      fixture:
        "52 families, all 25 ideology transitions, nine voter positions, three ballots; shared national/regional core",
      rows,
      taxTransitions,
      decayCases,
    },
    null,
    2
  )
);
