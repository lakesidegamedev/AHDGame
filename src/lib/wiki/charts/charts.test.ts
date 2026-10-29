import { describe, expect, it } from "vitest";
import { buildWikiChart, WIKI_CHARTS } from "./index";
import { expectValidChart } from "./chartTestUtils";

describe("wiki chart registry", () => {
  it("has charts registered", () => {
    expect(Object.keys(WIKI_CHARTS).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(WIKI_CHARTS))("%s builds a valid spec", (id) => {
    const spec = buildWikiChart(id);
    expect(spec).not.toBeNull();
    expectValidChart(id, spec!);
  });

  it("returns null for unknown ids, including prototype keys", () => {
    expect(buildWikiChart("no-such-chart")).toBeNull();
    expect(buildWikiChart("constructor")).toBeNull();
  });
});
