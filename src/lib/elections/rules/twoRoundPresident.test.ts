import { describe, expect, it } from "vitest";
import { decideTwoRoundPresident, usesTwoRoundSpecialPresident } from "./twoRoundPresident";

describe("usesTwoRoundSpecialPresident", () => {
  it("covers France, Romania and Russia only", () => {
    expect(["FR", "RO", "RU"].every((c) => usesTwoRoundSpecialPresident(c))).toBe(true);
    expect(usesTwoRoundSpecialPresident("YU")).toBe(false);
    expect(usesTwoRoundSpecialPresident(undefined)).toBe(false);
  });
});

describe("decideTwoRoundPresident", () => {
  it("elects a first round candidate with more than half the votes", () => {
    expect(decideTwoRoundPresident({ a: 51, b: 30, c: 19 }, 1)).toEqual({
      outcome: "won",
      winnerId: "a",
    });
  });

  it("sends the top two to a runoff when nobody passes half", () => {
    expect(decideTwoRoundPresident({ a: 40, b: 35, c: 25 }, 1)).toEqual({
      outcome: "runoff",
      finalistIds: ["a", "b"],
    });
  });

  it("treats exactly half as no majority", () => {
    expect(decideTwoRoundPresident({ a: 50, b: 50 }, 1)).toEqual({
      outcome: "runoff",
      finalistIds: ["a", "b"],
    });
  });

  it("breaks ties for a finalist place by id", () => {
    expect(decideTwoRoundPresident({ c: 30, b: 30, a: 40 }, 1)).toEqual({
      outcome: "runoff",
      finalistIds: ["a", "b"],
    });
  });

  it("decides the runoff by plurality", () => {
    expect(decideTwoRoundPresident({ a: 49, b: 51 }, 2)).toEqual({
      outcome: "won",
      winnerId: "b",
    });
  });

  it("elects a lone candidate in either round", () => {
    expect(decideTwoRoundPresident({ a: 3, b: 0 }, 1)).toEqual({ outcome: "won", winnerId: "a" });
  });

  it("reports no votes when nothing was cast", () => {
    expect(decideTwoRoundPresident({ a: 0, b: 0 }, 1)).toEqual({ outcome: "no_votes" });
  });
});
