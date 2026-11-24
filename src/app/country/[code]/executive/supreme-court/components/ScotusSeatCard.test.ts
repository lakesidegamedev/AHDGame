import { describe, expect, it } from "vitest";
import { vacancyNotice, type SeatCardData } from "./ScotusSeatCard";

const seat = (over: Partial<SeatCardData>): SeatCardData => ({
  seatNumber: 2,
  vacant: true,
  justiceName: null,
  justiceParty: null,
  justiceMode: null,
  economicLean: null,
  socialLean: null,
  isDivergent: false,
  originalRoster: false,
  deathChance: null,
  ...over,
});

describe("vacancyNotice", () => {
  it("states since when, until when, and who fills the seat after", () => {
    const text = vacancyNotice(seat({ vacantSinceTurn: 70, nominationDeadlineTurn: 166 }));
    expect(text).toBe(
      "Seat 2 vacant since turn 70. The President can nominate until turn 166, after which the Administration files a nominee from the President's party."
    );
  });

  it("says the President can nominate now while the clock has not started", () => {
    expect(vacancyNotice(seat({}))).toContain("can nominate a Justice now");
  });
});
