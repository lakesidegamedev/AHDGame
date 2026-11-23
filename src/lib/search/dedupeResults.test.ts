import { describe, expect, it } from "vitest";
import { dedupeByLabel } from "./dedupeResults";

describe("dedupeByLabel", () => {
  it("collapses results that read identically and keeps different ones", () => {
    const rows = [
      { id: "1", title: "Acme Bond", subtitle: "5 years · 1.0K" },
      { id: "2", title: "Acme Bond", subtitle: "5 years · 1.0K" },
      { id: "3", title: "Acme Bond", subtitle: "10 years · 1.0K" },
    ];
    expect(dedupeByLabel(rows).map((r) => r.id)).toEqual(["1", "3"]);
  });
});
