import { describe, expect, it } from "vitest";
import { cleanSuggestions, parseSse } from "./askDrawerApi";

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
