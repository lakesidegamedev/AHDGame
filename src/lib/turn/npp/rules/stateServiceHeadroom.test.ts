import { describe, expect, it } from "vitest";
import {
  isStateServiceSupplyMix,
  stateServiceHeadroomOn,
  stateServiceHeadroomUnits,
} from "./stateServiceHeadroom";

describe("stateServiceHeadroomOn", () => {
  it("is off when absent or 0", () => {
    expect(stateServiceHeadroomOn(undefined)).toBe(false);
    expect(stateServiceHeadroomOn(null)).toBe(false);
    expect(stateServiceHeadroomOn(0)).toBe(false);
    expect(stateServiceHeadroomOn(1)).toBe(true);
  });
});

describe("isStateServiceSupplyMix", () => {
  it("accepts a mix of state-scoped services only", () => {
    expect(isStateServiceSupplyMix({ healthcare_services: 0.5 })).toBe(true);
    expect(isStateServiceSupplyMix({ construction_services: 0.45 })).toBe(true);
  });
  it("rejects a mix with a reachable leg", () => {
    expect(isStateServiceSupplyMix({ freight: 0.45, consulting_services: 0.25 })).toBe(false);
    expect(isStateServiceSupplyMix({ steel: 0.3 })).toBe(false);
  });
  it("rejects an empty mix", () => {
    expect(isStateServiceSupplyMix({})).toBe(false);
    expect(isStateServiceSupplyMix({ healthcare_services: 0 })).toBe(false);
  });
});

describe("stateServiceHeadroomUnits", () => {
  it("opens a zero pool to the state's unmet demand", () => {
    // Live turn 663, US CA healthcare: pool 0, state book 13,486 units short.
    expect(stateServiceHeadroomUnits({ poolUnits: 0, unmetUnits: 13_486, inFlightUnits: 0 })).toBe(
      13_486
    );
  });
  it("nets out capacity already in flight", () => {
    expect(
      stateServiceHeadroomUnits({ poolUnits: 0, unmetUnits: 13_486, inFlightUnits: 5_195 })
    ).toBe(8_291);
    expect(stateServiceHeadroomUnits({ poolUnits: 0, unmetUnits: 100, inFlightUnits: 500 })).toBe(
      0
    );
  });
  it("never lowers the pool", () => {
    expect(
      stateServiceHeadroomUnits({ poolUnits: 3_051, unmetUnits: 1_000, inFlightUnits: 0 })
    ).toBe(3_051);
  });
  it("keeps the pool when the book is unreadable", () => {
    expect(stateServiceHeadroomUnits({ poolUnits: 40, unmetUnits: null, inFlightUnits: 0 })).toBe(
      40
    );
    expect(stateServiceHeadroomUnits({ poolUnits: 40, unmetUnits: NaN, inFlightUnits: 0 })).toBe(
      40
    );
  });
});
