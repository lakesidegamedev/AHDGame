import { describe, expect, it } from "vitest";
import type { CrisisDecisionNode } from "@/lib/db/types/crisis";
import { leversFromDecisionTree } from "./legacyConvert";

function collective(requiredRoles: string[]): CrisisDecisionNode {
  return {
    nodeId: "appeal",
    type: "collective",
    title: "Relief appeal",
    description: "",
    requiredRoles,
    options: [
      {
        optionId: "give",
        label: "Contribute",
        description: "",
        collectiveContribution: 1_000_000,
        effects: [],
      },
    ],
  } as unknown as CrisisDecisionNode;
}

describe("leversFromDecisionTree pooled levers", () => {
  it("leaves open public appeals on the decision path", () => {
    expect(leversFromDecisionTree([collective(["any"])])).toEqual([]);
  });

  it("gives an office-bound collective node a pooled lever", () => {
    const levers = leversFromDecisionTree([collective(["headOfState"])]);
    expect(levers.map((l) => l.id)).toEqual(["pool.appeal.give"]);
  });
});
