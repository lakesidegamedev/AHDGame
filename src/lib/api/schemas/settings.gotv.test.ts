import { describe, expect, it } from "vitest";
import { gotvBudgetSchema, suppressionBudgetSchema } from "./settings";
import { getAllTurnoutTargetOptions } from "@/lib/demographics/turnoutTargets";

describe("gotv/suppression target category enum", () => {
  const LEGACY_CATEGORIES = [
    "uk_voterGroups",
    "jp_voterGroups",
    "de_voterGroups",
    "ie_voterGroups",
    "cn_voterGroups",
    "br_voterGroups",
    "ideology",
  ];
  const US_DIMENSIONS = ["race", "age", "education", "wealth"];
  const INTERNATIONAL_DIMENSIONS = ["ethnicity", "income", "religion", "urbanization"];

  it("rejects legacy voter-group categories", () => {
    for (const category of LEGACY_CATEGORIES) {
      expect(
        gotvBudgetSchema.safeParse({ gotvBudgetPercent: 10, gotvTargetCategory: category }).success,
        `gotv accepted "${category}"`
      ).toBe(false);
      expect(
        suppressionBudgetSchema.safeParse({
          suppressionBudgetPercent: 10,
          suppressionTargetCategory: category,
        }).success,
        `suppression accepted "${category}"`
      ).toBe(false);
    }
  });

  it("accepts US Layer-1 dimensions as a GOTV target", () => {
    for (const category of US_DIMENSIONS) {
      const r = gotvBudgetSchema.safeParse({ gotvBudgetPercent: 10, gotvTargetCategory: category });
      expect(r.success, `gotv rejected "${category}"`).toBe(true);
    }
  });

  it("accepts the additional Layer-1 dimensions shown outside the US", () => {
    for (const category of INTERNATIONAL_DIMENSIONS) {
      const r = gotvBudgetSchema.safeParse({ gotvBudgetPercent: 10, gotvTargetCategory: category });
      expect(r.success, `gotv rejected "${category}"`).toBe(true);
    }
  });

  it("keeps the schema allowlist in sync with every modeled target dimension", () => {
    const modeledDimensions = new Set(getAllTurnoutTargetOptions().map((target) => target.dim));
    for (const category of modeledDimensions) {
      expect(
        gotvBudgetSchema.safeParse({ gotvBudgetPercent: 10, gotvTargetCategory: category }).success,
        `gotv rejected modeled dimension "${category}"`
      ).toBe(true);
      expect(
        suppressionBudgetSchema.safeParse({
          suppressionBudgetPercent: 10,
          suppressionTargetCategory: category,
        }).success,
        `suppression rejected modeled dimension "${category}"`
      ).toBe(true);
    }
  });

  it("rejects an unknown category", () => {
    expect(
      gotvBudgetSchema.safeParse({ gotvBudgetPercent: 10, gotvTargetCategory: "not_a_category" })
        .success
    ).toBe(false);
  });
});
