import { describe, expect, it } from "vitest";
import { openingRebaseUpdate, planOpeningRebase } from "./openingRebase";

const observation = (metricId: string, value: number, extra = {}) =>
  ({
    metricId,
    path: "p",
    value,
    status: "proxy",
    source: "s",
    owner: "o",
    note: "n",
    ...extra,
  }) as never;

describe("opening rebase", () => {
  const board = {
    openingValues: { "31": 1300, "35": 86, "01": 6.2, "51": 62 },
    observations: {
      "31": observation("31", 1449.2),
      "35": observation("35", 73.4),
      "01": observation("01", 3.6),
      "51": observation("51", 59.5),
    },
    priorValues: { "31": 1451.5 },
    history: {
      "31": [
        { turn: 1, value: 1300 },
        { turn: 157, value: 1451.5 },
      ],
      "35": [{ turn: 1, value: 86 }],
    },
  };
  const corrected = { "31": 293.9, "35": 67, "01": 5, "51": 69 };

  it("keeps movement since the opening and leaves measured metrics alone", () => {
    const plan = planOpeningRebase(board, corrected);
    expect(plan.map((row) => row.metricId)).toEqual(["31", "35"]);
    const crime = plan.find((row) => row.metricId === "31")!;
    expect(crime.mode).toBe("proportional");
    expect(crime.newCurrent).toBeCloseTo((1449.2 * 293.9) / 1300, 4);
    const air = plan.find((row) => row.metricId === "35")!;
    expect(air.mode).toBe("additive");
    expect(air.newCurrent).toBeCloseTo(54.4, 6);
  });

  it("moves history and prior values with the opening", () => {
    const set = openingRebaseUpdate(board, planOpeningRebase(board, corrected));
    expect(set["openingValues.31"]).toBe(293.9);
    expect(set["history.31"]).toEqual([
      { turn: 1, value: 293.9 },
      { turn: 157, value: expect.closeTo((1451.5 * 293.9) / 1300, 4) },
    ]);
    expect(set["priorValues.31"]).toBeCloseTo((1451.5 * 293.9) / 1300, 4);
    expect(set["history.35"]).toEqual([{ turn: 1, value: 67 }]);
  });

  it("is idempotent once the opening matches", () => {
    const rebased = { ...board, openingValues: { ...board.openingValues, "31": 293.9, "35": 67 } };
    expect(planOpeningRebase(rebased, corrected)).toEqual([]);
  });
});
