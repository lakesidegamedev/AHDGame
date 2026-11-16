import { describe, expect, it } from "vitest";
import { buildSectionTree, groupIdForPath } from "@/lib/wiki/rules/sectionTree";

const categories = [
  { id: "elections", name: "Elections" },
  { id: "economy", name: "Economy" },
  { id: "empty", name: "Empty" },
];

describe("buildSectionTree", () => {
  it("keeps category order, sorts pages and drops empty categories", () => {
    const groups = buildSectionTree(categories, [
      { slug: "b", title: "Bravo", category: "economy" },
      { slug: "a", title: "Alpha", category: "economy" },
      { slug: "c", title: "Charlie", category: "elections" },
    ]);
    expect(groups.map((g) => g.id)).toEqual(["elections", "economy"]);
    expect(groups[1]?.pages.map((p) => p.href)).toEqual(["/wiki/a", "/wiki/b"]);
  });

  it("finds the group for a page or overview path", () => {
    const groups = buildSectionTree(categories, [{ slug: "a", title: "A", category: "economy" }]);
    expect(groupIdForPath(groups, "/wiki/a")).toBe("economy");
    expect(groupIdForPath(groups, "/wiki/category/economy")).toBe("economy");
    expect(groupIdForPath(groups, "/wiki/zzz")).toBeNull();
  });
});
