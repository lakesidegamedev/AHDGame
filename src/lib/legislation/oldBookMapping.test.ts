import { describe, expect, it } from "vitest";
import { getProjectedPoliticalLegislationTypes } from "@/lib/admin/seed/seedPoliticalLegislation";
import {
  mapOldOption,
  migratePrioritySelection,
  PROGRAM_LAW_MAPPING,
  TAX_LAW_MAPPING,
  levelForOldOption,
} from "./oldBookMapping";

const projected = new Map(getProjectedPoliticalLegislationTypes().map((t) => [t._id, t]));

describe("old law book mapping", () => {
  it("names only laws that exist in the one law book", () => {
    for (const [oldId, row] of Object.entries(PROGRAM_LAW_MAPPING)) {
      expect(projected.get(row.law)?.policyOptions, `${oldId} -> ${row.law}`).toHaveLength(5);
    }
    for (const [oldId, row] of Object.entries(TAX_LAW_MAPPING)) {
      const slider = projected.get(row.law)?.taxSlider;
      expect(slider, `${oldId} -> ${row.law}`).toBeDefined();
      const waypoints = new Set(slider!.waypoints.map((w) => w.rate));
      for (const rate of Object.values(row.rates)) {
        expect(waypoints.has(rate), `${oldId} rate ${rate}`).toBe(true);
      }
    }
  });

  it("turns the old ladder into levels in the stated direction", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => levelForOldOption(i, "leftHigh"))).toEqual([
      4, 4, 3, 2, 1, 0, 0,
    ]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => levelForOldOption(i, "leftLow"))).toEqual([
      0, 0, 1, 2, 3, 4, 4,
    ]);
    expect(mapOldOption("us_state_housing", "state_housing_opt_1")).toMatchObject({
      lawTypeId: "us.infrastructure.publicHousing.primary",
      policyOptionId: "l4",
    });
    expect(mapOldOption("us_state_income_tax_rate", "state_income_tax_rate_opt_4")).toMatchObject({
      lawTypeId: "us.tax.stateIncomeTax",
      policyOptionId: "rate_9",
    });
    expect(mapOldOption("jp_pension", "jp_pension_opt_2")).toBeNull();
  });
});

describe("migratePrioritySelection", () => {
  const ref = (lawTypeId: string, policyOptionId: string) => ({ lawTypeId, policyOptionId });
  const old = {
    primary: ref("us_state_housing", "state_housing_opt_2"),
    secondary: [
      ref("us_social_security", "social_security_opt_2"),
      ref("us_medicaid", "medicaid_opt_2"),
      ref("us_state_education_funding", "state_education_funding_opt_2"),
    ] as [ReturnType<typeof ref>, ReturnType<typeof ref>, ReturnType<typeof ref>],
  };

  it("re-points every reference and is stable on a second pass", () => {
    const first = migratePrioritySelection(old);
    expect(first.kind).toBe("migrated");
    if (first.kind !== "migrated") return;
    expect(first.selection.primary).toEqual(ref("us.infrastructure.publicHousing.primary", "l3"));
    expect(migratePrioritySelection(first.selection).kind).toBe("unchanged");
  });

  it("drops a selection with an unmapped law or two references to one law", () => {
    expect(migratePrioritySelection({ ...old, primary: ref("us_not_a_law", "x_opt_1") }).kind).toBe(
      "unusable"
    );
    expect(
      migratePrioritySelection({
        ...old,
        secondary: [
          old.secondary[0],
          ref("us_state_housing", "state_housing_opt_1"),
          old.secondary[2],
        ],
      }).kind
    ).toBe("unusable");
  });
});
