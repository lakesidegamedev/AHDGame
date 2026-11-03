/** Deterministic separation-desire sensitivity across all three devolved UK regions. */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  computeIndependenceDesireDriftSnapshot as step,
  regionalApprovalDrift,
} from "../../src/lib/governorOffice/devolution/rules";
import type { DevolutionPolicy } from "../../src/lib/db/types/governorOfficeState";

const stances = ["anti", "pro", "independence"] as const;
const approvals = [0, 25, 29.2, 49.9, 50, 50.1, 70, 75, 100];
const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export function simulateWestminsterApproval() {
  const cases = [];
  for (const [region, start] of [
    ["SCO", 60],
    ["WAL", 36.13],
    ["NIR", 45],
  ] as const) {
    for (const policy of stances) {
      for (const westminsterPolicy of stances) {
        for (const nationalApproval of approvals) {
          const inputs = {
            policy,
            westminsterPolicy,
            regionalApproval: 33.9,
            nationalApproval,
            inflationPercent: 6,
          };
          const run = (legacy: boolean) => {
            let previous: number = start;
            let after48 = start as number;
            for (let turn = 1; turn <= 480; turn++) {
              const result = step({ ...inputs, previous });
              if (legacy) {
                // Freeze the former Westminster mandate calculation for the paired control.
                const otherDrivers = Object.entries(result.drivers).reduce(
                  (sum, [key, value]) => (key === "nationalApproval" ? sum : sum + value),
                  0
                );
                const oldApproval =
                  regionalApprovalDrift(nationalApproval, westminsterPolicy as DevolutionPolicy) *
                  0.5;
                previous = round(Math.max(0, Math.min(100, previous + otherDrivers + oldApproval)));
              } else {
                previous = result.next;
              }
              if (previous < 0 || previous > 100) throw new Error("Desire escaped its bounds");
              if (turn === 48) after48 = previous;
            }
            return { after48, after480: previous };
          };
          const first = step({ ...inputs, previous: start });
          const before = run(true);
          const after = run(false);
          if (
            (nationalApproval === 50 || westminsterPolicy === "anti") &&
            JSON.stringify(before) !== JSON.stringify(after)
          ) {
            throw new Error("Unchanged control diverged");
          }
          const expected = Math.max(-0.025, Math.min(0.025, (50 - nationalApproval) * 0.001));
          if (Math.abs(first.drivers.nationalApproval - expected) > 1e-10)
            throw new Error("Approval depends on stance");
          cases.push({
            region,
            start,
            policy,
            westminsterPolicy,
            nationalApproval,
            approvalDriver: round(first.drivers.nationalApproval),
            firstDelta: first.delta,
            before,
            after,
          });
        }
      }
    }
  }
  return {
    basis:
      "Synthetic fixed-input sensitivity, not a live-world forecast. Regional approval 33.9%, inflation 6%; no events or changing policy/economy inputs.",
    horizonTurns: 480,
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = simulateWestminsterApproval();
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        cases: report.cases.length,
        regions: ["SCO", "WAL", "NIR"],
        illustration: report.cases.filter(
          (c) => c.region === "WAL" && c.policy === "independence" && c.nationalApproval === 29.2
        ),
      },
      null,
      2
    )
  );
}
