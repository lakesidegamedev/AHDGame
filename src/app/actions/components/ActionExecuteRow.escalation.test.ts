import { describe, expect, it } from "vitest";
import { batchEscalationNote } from "./ActionExecuteRow";

const fmt = (n: number) => `$${n}`;

describe("batchEscalationNote", () => {
  it("explains a batch that costs more than count times the first run", () => {
    const note = batchEscalationNote(5, -154_390, -798_141, fmt);
    expect(note).toContain("later runs cost more");
    expect(note).toContain("$154390");
    expect(note).toContain("$771950");
  });
  it("stays silent when the batch is exactly count times the first run", () => {
    expect(batchEscalationNote(5, -100, -500, fmt)).toBeNull();
  });
});
