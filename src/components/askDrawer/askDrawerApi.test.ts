import { describe, expect, it } from "vitest";
import { askEnergy, chargeLine, cleanSuggestions, energySpent, parseSse } from "./askDrawerApi";

describe("parseSse", () => {
  it("returns complete events and keeps the unfinished tail", () => {
    const { events, rest } = parseSse(
      'event: meta\ndata: {"convId":"abc123"}\n\nevent: delta\ndata: "Hel"\n\nevent: delta\ndata: "lo'
    );
    expect(events).toEqual([
      { event: "meta", data: { convId: "abc123" } },
      { event: "delta", data: "Hel" },
    ]);
    expect(rest).toBe('event: delta\ndata: "lo');
  });

  it("skips malformed blocks", () => {
    expect(parseSse("event: delta\ndata: {nope\n\n").events).toEqual([]);
  });

  it("reads the instant ack and phased research steps", () => {
    const { events } = parseSse(
      'event: ack\ndata: {"text":"I\'ll look into how to build union support for you."}\n\n' +
        'event: status\ndata: {"label":"Reading the union code","phase":"read"}\n\n'
    );
    expect(events).toEqual([
      { event: "ack", data: { text: "I'll look into how to build union support for you." } },
      { event: "status", data: { label: "Reading the union code", phase: "read" } },
    ]);
  });
});

describe("cleanSuggestions", () => {
  it("keeps up to five distinct, sensible questions", () => {
    expect(
      cleanSuggestions([
        " How do I build union support in my state? ",
        "How do I build union support in my state?",
        "hi",
        42,
        "What raises my approval here?",
        "Why did this bill fail?",
        "Who can vote on this?",
        "What does this cost me per turn?",
        "One too many questions?",
      ])
    ).toEqual([
      "How do I build union support in my state?",
      "What raises my approval here?",
      "Why did this bill fail?",
      "Who can vote on this?",
      "What does this cost me per turn?",
    ]);
  });

  it("is empty for anything that is not a list", () => {
    expect(cleanSuggestions(undefined)).toEqual([]);
    expect(cleanSuggestions("nope")).toEqual([]);
  });
});

describe("askEnergy", () => {
  it("reads the energy payload and caps the estimate by the week", () => {
    expect(
      askEnergy({
        used: 4,
        limit: 20,
        remaining: 16,
        resetAt: 1,
        energy: {
          daily: { used: 4, limit: 20, remaining: 16, percentLeft: 80, resetAt: 1 },
          weekly: { used: 97.5, limit: 100, remaining: 2.5, resetAt: 2 },
        },
      })
    ).toEqual({
      daily: { percentLeft: 80, resetAt: 1, limit: 20 },
      weekly: { percentLeft: 3, resetAt: 2 },
      typicalLeft: 2,
    });
  });

  it("falls back to the old daily fields", () => {
    expect(askEnergy({ used: 3, limit: 5, remaining: 2, resetAt: 9 })).toEqual({
      daily: { percentLeft: 40, resetAt: 9, limit: 5 },
      weekly: null,
      typicalLeft: 2,
    });
  });
});

describe("energySpent", () => {
  it("is spent when either today or this week is empty", () => {
    const daily = { used: 1, limit: 20, remaining: 19, resetAt: 0 };
    expect(energySpent({ ...daily, energy: { daily } })).toBe(false);
    expect(
      energySpent({
        ...daily,
        energy: { daily, weekly: { used: 100, limit: 100, remaining: 0, resetAt: 0 } },
      })
    ).toBe(true);
    expect(energySpent({ used: 5, limit: 5, remaining: 0, resetAt: 0 })).toBe(true);
  });
});

describe("chargeLine", () => {
  it("names the share of today's energy and why", () => {
    expect(chargeLine({ cost: 0.6, percentOfDaily: 3, reasons: ["live data", "chart"] })).toBe(
      "Used 3% of today's energy (live data, chart)"
    );
    expect(chargeLine({ cost: 0.25, percentOfDaily: 0.2 })).toBe("Used under 1% of today's energy");
  });

  it("works the share out from the daily limit when the server leaves it out", () => {
    expect(chargeLine({ cost: 2 }, 40)).toBe("Used 5% of today's energy");
  });

  it("says nothing for a free answer", () => {
    expect(chargeLine({ cost: 0, percentOfDaily: 0 })).toBeNull();
    expect(chargeLine(null)).toBeNull();
    expect(chargeLine({ cost: 1 })).toBeNull();
  });
});
