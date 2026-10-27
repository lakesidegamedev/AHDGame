import { describe, expect, it } from "vitest";
import { parseSse } from "./askDrawerApi";

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
});
