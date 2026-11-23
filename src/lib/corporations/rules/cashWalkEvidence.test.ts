import { describe, expect, it } from "vitest";
import { cashWalkEvidence, reportingCashFlows } from "./cashWalkEvidence";

describe("cash snapshot evidence", () => {
  const previous = new Date("2030-01-01T10:00:00Z");
  const latest = new Date("2030-01-01T11:00:00Z");
  it("uses actual close boundaries regardless of how long the phase ran", () => {
    const closed = new Date("2030-01-01T11:12:00Z");
    expect(
      cashWalkEvidence(
        { turn: 10, createdAt: latest, cashSnapshotAt: closed },
        { createdAt: previous, cashSnapshotAt: previous }
      )
    ).toEqual({ boundary: "recorded", filter: { createdAt: { $gt: previous, $lte: closed } } });
  });
  it("labels older and incomplete boundaries as estimates", () => {
    expect(cashWalkEvidence({ turn: 10, createdAt: latest }, { createdAt: previous })).toEqual({
      boundary: "estimated",
      filter: { createdAt: { $gt: previous, $lte: latest } },
    });
    expect(cashWalkEvidence({ turn: 10 }, null)).toEqual({
      boundary: "turn",
      filter: { turn: 10 },
    });
  });
  it("tracks unconvertible movements and converts foreign groups at frozen FX", () => {
    const group = {
      _id: { type: "corp_capacity_build", currencyCode: "CAD" },
      amount: -1000,
      anchorAmount: -800,
      count: 700,
      missingAnchor: 0,
    };
    expect(reportingCashFlows([group], "USD", 0.5)).toEqual({
      flows: [{ type: "corp_capacity_build", amount: -400 }],
      unconvertedMovements: 0,
    });
    expect(reportingCashFlows([{ ...group, missingAnchor: 1 }], "USD", 0.5)).toEqual({
      flows: [],
      unconvertedMovements: 700,
    });
    expect(reportingCashFlows([group], "USD", 0)).toEqual({ flows: [], unconvertedMovements: 700 });
    expect(reportingCashFlows([group], "CAD")).toEqual({
      flows: [{ type: "corp_capacity_build", amount: -1000 }],
      unconvertedMovements: 0,
    });
  });
});
