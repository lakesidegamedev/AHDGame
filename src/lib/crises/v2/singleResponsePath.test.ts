import { describe, expect, it } from "vitest";
import { decisionAnsweredByLever } from "@/lib/crises/interactionEngine";
import { ALL_CRISIS_TEMPLATES } from "@/lib/crises/templates";
import { allLivingConflictDefs } from "@/lib/livingConflict/registry";
import { campaignRuleRefs, convertLivingConflictDef } from "@/lib/livingConflict/rules/crisisV2";
import type { CrisisTemplate } from "@/lib/db/types/crisis";
import {
  convertLegacyTemplate,
  leversFromDecisionTree,
  optionAnsweredByLever,
} from "./legacyConvert";

const templates = Object.entries(ALL_CRISIS_TEMPLATES).filter(
  ([, template]) => template.interactionDefinition
) as [string, CrisisTemplate][];

describe("a converted crisis has one response path per option", () => {
  it("answers each lever's option through the lever and nowhere else", () => {
    let covered = 0;
    for (const [key, template] of templates) {
      const tree = template.interactionDefinition!.decisionTree;
      const levers = leversFromDecisionTree(tree);
      for (const node of tree) {
        for (const option of node.options ?? []) {
          const answered = optionAnsweredByLever(tree, node.nodeId, option.optionId);
          const hasLever = levers.some(
            (lever) =>
              lever.id === `${node.nodeId}.${option.optionId}` ||
              lever.id.startsWith(`${node.nodeId}.${option.optionId}@`) ||
              lever.id === `pool.${node.nodeId}.${option.optionId}`
          );
          expect(answered, `${key}:${node.nodeId}.${option.optionId}`).toBe(hasLever);
          if (answered) covered += 1;
        }
      }
    }
    expect(covered).toBeGreaterThan(0);
  });

  it("answers aid pledges and collective contributions through pooled levers only", () => {
    let pooled = 0;
    for (const [key, template] of templates) {
      const tree = template.interactionDefinition!.decisionTree;
      const levers = leversFromDecisionTree(tree);
      for (const node of tree.filter((n) => n.type === "aid" || n.type === "collective")) {
        const v2 = { definitionId: `legacy:${key}` } as never;
        const own = levers.filter((l) => l.legacy?.nodeId === node.nodeId);
        if (node.type === "aid") {
          expect(
            own.map((l) => l.legacy?.kind),
            key
          ).toEqual(["aid"]);
          expect(decisionAnsweredByLever({ v2 }, tree, node), `${key}:${node.nodeId}`).toBe(true);
          const decline = node.options?.[0];
          if (decline) {
            expect(decisionAnsweredByLever({ v2 }, tree, node, decline.optionId)).toBe(false);
          }
        } else {
          expect(
            own.every((l) => l.legacy?.kind === "collective"),
            key
          ).toBe(true);
          expect(decisionAnsweredByLever({ v2 }, tree, node), `${key}:${node.nodeId}`).toBe(
            own.length > 0
          );
        }
        pooled += own.length;
      }
    }
    expect(pooled).toBeGreaterThan(0);
  });

  it("blocks a covered decision only on converted crises", () => {
    const [key, template] = templates.find(
      ([, t]) => leversFromDecisionTree(t.interactionDefinition!.decisionTree).length > 0
    )!;
    const tree = template.interactionDefinition!.decisionTree;
    const node = tree.find((n) =>
      (n.options ?? []).some((o) => optionAnsweredByLever(tree, n.nodeId, o.optionId))
    )!;
    const option = node.options!.find((o) => optionAnsweredByLever(tree, node.nodeId, o.optionId))!;
    const converted = { v2: { definitionId: `legacy:${key}` } } as never;
    expect(decisionAnsweredByLever(converted, tree, node, option.optionId)).toBe(true);
    expect(decisionAnsweredByLever({ v2: undefined }, tree, node, option.optionId)).toBe(false);
    expect(
      decisionAnsweredByLever({ v2: { definitionId: "lc.pandemic" } } as never, tree, node)
    ).toBe(false);
  });

  it("defines converted levers from the same tree the decision path reads", () => {
    for (const [key, template] of templates) {
      const def = convertLegacyTemplate({ key, template, durationTurns: 6 });
      expect(def.levers.map((l) => l.id)).toEqual(
        leversFromDecisionTree(template.interactionDefinition!.decisionTree).map((l) => l.id)
      );
    }
  });
});

describe("campaign rules apply once", () => {
  it("leaves outcome rules to the response resolver, not the mirror crisis", () => {
    let authored = 0;
    for (const def of allLivingConflictDefs()) {
      authored += campaignRuleRefs(def).length;
      expect(convertLivingConflictDef(def).effectModules, def.key).toEqual([]);
    }
    expect(authored).toBeGreaterThan(0);
  });
});
