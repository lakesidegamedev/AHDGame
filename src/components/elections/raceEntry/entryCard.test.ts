import { describe, expect, it } from "vitest";
import { buildEntryCardMessage } from "./entryCard";

describe("buildEntryCardMessage", () => {
  const base = {
    schedule: { currentTurn: 10, primaryEndTurn: 15, endTurn: 40 },
    candidates: [{ party: "1", partyName: "Blue" }],
    incumbent: { name: "A. Person", party: "Blue" },
  };

  it("covers cost, eligibility, field, schedule and withdraw terms", () => {
    const text = buildEntryCardMessage({
      ...base,
      checks: [
        { id: "a", label: "Lives in this region", status: "pass" },
        { id: "b", label: "Within term limits", status: "fail", reason: "Maxed out." },
        { id: "c", label: "Country-specific filing rules", status: "later" },
      ],
    });
    expect(text).toContain("Filing is free.");
    expect(text).toContain("spends actions and campaign funds");
    expect(text).toContain("Yes: Lives in this region");
    expect(text).toContain("No: Within term limits. Maxed out.");
    expect(text).toContain("Later: Country-specific filing rules");
    expect(text).toContain("1 candidate has filed (Blue).");
    expect(text).toContain("Incumbent: A. Person (Blue).");
    expect(text).toContain("turn 15 (about 5 hours)");
    expect(text).toContain("In the primary: You cannot re-enter this election after withdrawing.");
    expect(text).toContain("permanently REMOVED");
  });

  it("falls back to checked-at-filing when the preview is missing", () => {
    expect(buildEntryCardMessage({ ...base, checks: null })).toContain(
      "Eligibility is checked when you file."
    );
  });
});
