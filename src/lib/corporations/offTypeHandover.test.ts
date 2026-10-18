import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import {
  isOffType,
  isSameType,
  isStandaloneAiCompany,
  pickHandoverSector,
  runOffTypeHandover,
} from "./offTypeHandover";

describe("offTypeHandover helpers", () => {
  it("treats primary and secondary type plants as on-type", () => {
    expect(isOffType({ type: "manufacturing" }, "manufacturing")).toBe(false);
    expect(isOffType({ type: "manufacturing", secondaryType: "energy" }, "energy")).toBe(false);
    expect(isOffType({ type: "manufacturing" }, "energy")).toBe(true);
    expect(isOffType({}, "energy")).toBe(false);
  });

  it("buyers must hold the plant's type as their primary type", () => {
    expect(isSameType({ type: "energy" }, "energy")).toBe(true);
    expect(isSameType({ type: "manufacturing", secondaryType: "energy" }, "energy")).toBe(false);
  });

  it("only standalone AI companies qualify", () => {
    const base = { _id: new ObjectId(), ceoType: "npp" } as unknown as Corporation;
    expect(isStandaloneAiCompany(base)).toBe(true);
    expect(isStandaloneAiCompany({ ...base, ceoType: "character" } as Corporation)).toBe(false);
    expect(isStandaloneAiCompany({ ...base, caretakerCeo: { userId: "x" } } as never)).toBe(false);
    expect(isStandaloneAiCompany({ ...base, countryOwnerId: "US" } as never)).toBe(false);
  });

  it("picks the lowest-margin plant first", () => {
    const a = { _id: new ObjectId(), plantsPnl: { revenue: 100, profit: 10 } };
    const b = { _id: new ObjectId(), plantsPnl: { revenue: 100, profit: -30 } };
    const c = { _id: new ObjectId(), plantsPnl: null };
    expect(pickHandoverSector([a, b, c])).toBe(b);
    expect(pickHandoverSector([])).toBeNull();
  });

  it("does nothing below stage 5 and never touches the database", async () => {
    const db = new Proxy(
      {},
      {
        get: () => {
          throw new Error("db touched");
        },
      }
    ) as never;
    for (const stage of [0, 1, 4, null, undefined]) {
      await expect(
        runOffTypeHandover(db, { turn: 1, year: 1991, eraUnitScale: 1, stage })
      ).resolves.toEqual({ moved: 0, deferred: 0 });
    }
  });
});
