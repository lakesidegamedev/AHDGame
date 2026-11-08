import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "@/lib/mongodb";
import { YEAR_ONE_BY_ELECTION_SCHEDULE } from "@/lib/countries/uk/elections/yearOneByElections";

const rows: Array<Record<string, unknown>> = [];
const findVacancy = vi.fn();
const vacate = vi.fn();

vi.mock("@/lib/db/collections/electedOfficials", () => ({
  getElectedOfficialsCollection: async () => ({
    find: () => ({ toArray: async () => rows }),
  }),
}));
vi.mock("@/lib/db/collections/ukByElection", () => ({
  getUkCommonsVacanciesCollection: () => ({ findOne: findVacancy }),
}));
vi.mock("@/lib/countries/uk/elections/commonsVacancyShell", () => ({
  vacateCommonsSeat: (...args: unknown[]) => vacate(...args),
}));

import { processYearOneByElections } from "./yearOneByElections";

const db = {} as Db;
const NOW = new Date("2027-02-01");

function row(overrides: Record<string, unknown>) {
  return {
    _id: new ObjectId(),
    officeType: "commons",
    countryId: "UK",
    state: "ENG-NW",
    nppId: new ObjectId(),
    characterId: null,
    ...overrides,
  };
}

describe("processYearOneByElections", () => {
  const entry = YEAR_ONE_BY_ELECTION_SCHEDULE[0];

  beforeEach(() => {
    rows.length = 0;
    findVacancy.mockReset().mockResolvedValue(null);
    vacate.mockReset().mockResolvedValue(null);
    rows.push(row({}), row({}), row({}));
  });

  it("vacates one NPP-held seat on a scheduled turn of the 2027 preset", async () => {
    const done = await processYearOneByElections(db, entry.calendarTurn, NOW, {
      preset: "2027-default",
    });
    expect(done).toBe(true);
    expect(vacate).toHaveBeenCalledTimes(1);
    expect(vacate.mock.calls[0].slice(2)).toEqual([entry.reason, entry.calendarTurn, NOW]);
  });

  it("does nothing off schedule, in another preset, or when the turn already vacated", async () => {
    expect(
      await processYearOneByElections(db, entry.calendarTurn + 1, NOW, { preset: "2027-default" })
    ).toBe(false);
    expect(
      await processYearOneByElections(db, entry.calendarTurn, NOW, { preset: "2019-default" })
    ).toBe(false);
    findVacancy.mockResolvedValue({ _id: new ObjectId() });
    expect(
      await processYearOneByElections(db, entry.calendarTurn, NOW, { preset: "2027-default" })
    ).toBe(false);
    expect(vacate).not.toHaveBeenCalled();
  });

  it("never vacates a player-held seat or a multi-seat bloc", async () => {
    rows.length = 0;
    rows.push(
      row({ nppId: null, characterId: new ObjectId() }),
      row({ seatsHeld: 4 }),
      row({ state: undefined })
    );
    expect(
      await processYearOneByElections(db, entry.calendarTurn, NOW, { preset: "2027-default" })
    ).toBe(false);
    expect(vacate).not.toHaveBeenCalled();
  });

  it("counts calendar turns through a founding phase", async () => {
    const done = await processYearOneByElections(db, entry.calendarTurn + 48, NOW, {
      preset: "2027-default",
      preIterationActive: false,
      preIterationTurns: 48,
    });
    expect(done).toBe(true);
  });
});
