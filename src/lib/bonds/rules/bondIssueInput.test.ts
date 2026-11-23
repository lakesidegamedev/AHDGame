import { describe, expect, it } from "vitest";
import { MIN_BOND_ISSUANCE } from "@/lib/constants/bonds";
import { issueBondSchema } from "@/lib/api/schemas/bonds";
import { bondIssueInputProblem, bondIssueMinimum, bondIssueRefusalText } from "./bondIssueInput";

describe("bondIssueRefusalText", () => {
  it("drops the field path and error code from a validation refusal", () => {
    const body = { error: "faceValue: Minimum bond issuance is ₳100,000", code: "BAD_REQUEST" };
    expect(bondIssueRefusalText(body, "Failed")).toBe("Minimum bond issuance is ₳100,000");
  });

  it("drops a trailing code inside the message", () => {
    expect(bondIssueRefusalText({ error: "faceValue: Too small (BAD_REQUEST)" }, "Failed")).toBe(
      "Too small"
    );
  });

  it("keeps ordinary refusals and falls back when empty", () => {
    expect(bondIssueRefusalText({ error: "Cooldown: 3 turns remaining" }, "x")).toBe(
      "Cooldown: 3 turns remaining"
    );
    expect(bondIssueRefusalText({}, "Failed to issue bond")).toBe("Failed to issue bond");
  });
});

describe("bondIssueMinimum", () => {
  it("never goes below the schema minimum", () => {
    expect(bondIssueMinimum(undefined)).toBe(MIN_BOND_ISSUANCE);
    expect(bondIssueMinimum(40_000)).toBe(MIN_BOND_ISSUANCE);
    expect(bondIssueMinimum(250_000)).toBe(250_000);
  });

  it("matches what the request schema accepts", () => {
    const ok = (faceValue: number) =>
      issueBondSchema.safeParse({ faceValue, maturityTurns: 96 }).success;
    expect(ok(bondIssueMinimum(undefined))).toBe(true);
    expect(ok(bondIssueMinimum(undefined) - 1)).toBe(false);
  });
});

describe("bondIssueInputProblem", () => {
  const window = { minimum: 100_000, maximum: 1_000_000 };
  it("flags zero, under-minimum, over-maximum and empty windows", () => {
    expect(bondIssueInputProblem({ faceValue: 0, ...window })).toBe("belowMinimum");
    expect(bondIssueInputProblem({ faceValue: 99_999, ...window })).toBe("belowMinimum");
    expect(bondIssueInputProblem({ faceValue: 1_000_001, ...window })).toBe("aboveMaximum");
    expect(bondIssueInputProblem({ faceValue: 500_000, minimum: 100_000, maximum: 50_000 })).toBe(
      "unavailable"
    );
    expect(bondIssueInputProblem({ faceValue: 100_000, ...window })).toBeNull();
    expect(bondIssueInputProblem({ faceValue: 1_000_000, ...window })).toBeNull();
  });
});
