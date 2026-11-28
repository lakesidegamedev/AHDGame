import { describe, expect, it } from "vitest";
import { referendumLeadMargin } from "./leadMargin";

describe("referendum lead", () => {
  it.each([
    [60, 20],
    [40, 20],
    [50, 0],
    [0, 100],
    [100, 100],
    [49.9, 0.2],
  ])("%s percent yes gives a %s-point lead", (yes, lead) =>
    expect(referendumLeadMargin(yes)).toBeCloseTo(lead)
  );
});
