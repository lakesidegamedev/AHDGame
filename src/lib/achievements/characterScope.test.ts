import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

import { filterAchievementRowsForCharacter } from "./index";

describe("filterAchievementRowsForCharacter", () => {
  const mine = new ObjectId();
  const other = new ObjectId();
  const rows = [
    { id: "mine", characterId: mine },
    { id: "other", characterId: other },
    { id: "legacy" },
  ];

  it("keeps own rows and untagged legacy rows for the account's first character", () => {
    const ids = filterAchievementRowsForCharacter(rows, {
      characterId: mine,
      includeUntagged: true,
    }).map((r) => r.id);
    expect(ids).toEqual(["mine", "legacy"]);
  });

  it("shows an added character only what it earned", () => {
    const ids = filterAchievementRowsForCharacter(rows, {
      characterId: mine,
      includeUntagged: false,
    }).map((r) => r.id);
    expect(ids).toEqual(["mine"]);
  });
});
