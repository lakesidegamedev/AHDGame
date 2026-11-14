import { expect, it } from "vitest";
import { canadianRecalibrationAnchor, canadianShiftedTimerTurns } from "./electionTimerRepair";

const prior = {
  countryId: "CA",
  electionType: "snap_caCommons",
  endTime: new Date("2026-01-01"),
  endTurn: 60,
};

it("uses the snap's turn bound instead of a paused wall-clock estimate", () => {
  expect(canadianRecalibrationAnchor(prior, () => 999)).toBe(60);
});

it("keeps a regular shifted term but ignores imposed snaps and unshifted regular terms", () => {
  expect(
    canadianRecalibrationAnchor(
      { ...prior, electionType: "caCommons", shiftedScheduleEndTurn: 252 },
      () => 999
    )
  ).toBe(252);
  expect(canadianRecalibrationAnchor({ ...prior, imposedSnap: true }, () => 999)).toBeNull();
  expect(
    canadianRecalibrationAnchor({ ...prior, electionType: "caCommons" }, () => 999)
  ).toBeNull();
});

it("delegates foreign histories and rejects malformed current term stamps", () => {
  expect(canadianRecalibrationAnchor({ ...prior, countryId: "UK" }, () => 999)).toBeUndefined();
  for (const shiftedScheduleEndTurn of [NaN, Infinity, -1, 1.5]) {
    expect(
      canadianShiftedTimerTurns({
        countryId: "CA",
        electionType: "caCommons",
        cycle: 2,
        shiftedScheduleEndTurn,
      })
    ).toBeNull();
  }
});
