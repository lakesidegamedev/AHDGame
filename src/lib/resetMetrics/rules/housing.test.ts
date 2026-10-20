import { describe, expect, it } from "vitest";
import {
  advanceHousing,
  housingPaymentBurden,
  type HousingState,
  type HousingTurnInput,
} from "./housing";

export const openingHousing = (): HousingState => ({
  worldId: "test-world",
  countryId: "UK",
  regionId: "a",
  asOfTurn: 1,
  usableDwellings: 100,
  occupiedDwellings: 95,
  unhousedPeople: 10,
  constructionCash: 0,
  pipeline: [{ id: "old", dwellings: 10, earliestCompletionTurn: 2 }],
});
export const housingFlow = (turn = 2): HousingTurnInput => ({
  turn,
  population: 400,
  constructionCashReceived: 100,
  costPerCompletedDwelling: 10,
  materialCapacity: 10,
  laborCapacity: 10,
  financeCapacity: 10,
  planningCapacity: 10,
  newProjects: [],
  dwellingsLost: 0,
  occupiedDwellingsLost: 0,
  displacedPeople: 0,
  vacatedDwellings: 0,
  otherNewOccupancies: 0,
  newlyUnhousedPeople: 0,
  rehousingHouseholds: 5,
  peoplePerRehousing: 2,
});

describe("housing stocks and delivered capacity", () => {
  it("conserves dwelling stock, construction cash and unhoused flows", () => {
    const state = openingHousing();
    const flow = housingFlow();
    const next = advanceHousing(state, flow);
    expect(next.usableDwellings).toBe(110);
    expect(next.constructionCash).toBe(0);
    expect(next.lastFlow!.spent).toBe(100);
    expect(next.unhousedPeople).toBe(0);
    expect(next.occupiedDwellings).toBe(100);
    expect(state.usableDwellings).toBe(100);
    expect(state.pipeline[0]!.dwellings).toBe(10);
    expect(advanceHousing(next, flow)).toBe(next);
    expect(() => advanceHousing(next, { ...flow, constructionCashReceived: 101 })).toThrow(
      "changed"
    );
  });
  it.each(["materialCapacity", "laborCapacity", "financeCapacity", "planningCapacity"] as const)(
    "honors %s",
    (key) => {
      const next = advanceHousing(openingHousing(), { ...housingFlow(), [key]: 2 });
      expect(next.lastFlow!.completed).toBe(2);
      expect(next.constructionCash).toBe(80);
      expect(next.pipeline[0]!.dwellings).toBe(8);
    }
  );
  it("retains previously funded cash and completed homes after new funding stops", () => {
    const first = advanceHousing(openingHousing(), { ...housingFlow(), laborCapacity: 2 });
    const second = advanceHousing(first, { ...housingFlow(3), constructionCashReceived: 0 });
    expect(second.lastFlow!.completed).toBe(8);
    expect(second.usableDwellings).toBe(110);
    expect(second.constructionCash).toBe(0);
  });
  it("does not turn starts or unready projects into completed homes", () => {
    const flow = {
      ...housingFlow(),
      newProjects: [{ id: "new", dwellings: 100, earliestCompletionTurn: 4 }],
    };
    const next = advanceHousing({ ...openingHousing(), pipeline: [] }, flow);
    expect(next.usableDwellings).toBe(100);
    expect(next.pipeline[0]!.dwellings).toBe(100);
    expect(() =>
      advanceHousing(openingHousing(), {
        ...flow,
        newProjects: [{ ...flow.newProjects[0]!, earliestCompletionTurn: 2 }],
      })
    ).toThrow("future");
  });
  it("cannot rehouse people without available dwellings", () => {
    const next = advanceHousing(
      { ...openingHousing(), occupiedDwellings: 100 },
      { ...housingFlow(), constructionCashReceived: 0 }
    );
    expect(next.unhousedPeople).toBe(10);
    expect(next.lastFlow!.rehousedPeople).toBe(0);
  });
  it("subtracts lost dwellings and never reports negative vacancies", () => {
    const next = advanceHousing(openingHousing(), {
      ...housingFlow(),
      constructionCashReceived: 0,
      dwellingsLost: 20,
      occupiedDwellingsLost: 15,
      displacedPeople: 30,
    });
    expect(next.usableDwellings).toBe(80);
    expect(next.occupiedDwellings).toBe(80);
    expect(next.unhousedPeople).toBe(40);
  });
  it("requires consecutive turns and rejects invalid money and overlarge losses", () => {
    expect(() => advanceHousing(openingHousing(), housingFlow(4))).toThrow("one turn");
    expect(() =>
      advanceHousing(openingHousing(), { ...housingFlow(), constructionCashReceived: -1 })
    ).toThrow();
    expect(() =>
      advanceHousing(openingHousing(), { ...housingFlow(), dwellingsLost: 101 })
    ).toThrow();
  });
  it("computes housing costs from net payments and disposable resources without capping hardship", () => {
    const result = housingPaymentBurden([
      {
        id: "renter",
        households: 10,
        annualDisposableIncome: 100,
        annualHousingPayments: 150,
        annualLandlordAssistance: 20,
      },
    ]);
    expect(result.paymentBurden).toBe(130);
    expect(result.burdenedShare).toBe(100);
    expect(
      housingPaymentBurden([
        {
          id: "none",
          households: 1,
          annualDisposableIncome: 0,
          annualHousingPayments: 10,
          annualLandlordAssistance: 0,
        },
      ]).paymentBurden
    ).toBeNull();
  });
});
