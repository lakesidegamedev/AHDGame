import { describe, expect, it } from "vitest";
import {
  countAccess,
  findRegressions,
  isScannedFile,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./dataAccessRatchet";

describe("data access counter", () => {
  it.each([
    'db.collection<Character>("characters").findOne({});',
    'db\n  .collection<Character>("characters")\n  .findOne({});',
    "db.collection<Character>(`characters`).findOne({});",
    '(await getDb()).collection<Character>("characters").findOne({});',
  ])("counts a typed direct call: %s", (source) => {
    expect(countAccess(source, "src/lib/x.ts")).toEqual({ characters: 1 });
  });
  it("counts an untyped call on both counters", () => {
    expect(countAccess('db.collection("npps").find({});', "src/lib/x.ts")).toEqual({
      npps: 1,
      untyped: 1,
    });
    expect(countAccess('db\n  .collection("newThing")\n  .find({});', "src/lib/x.ts")).toEqual({
      untyped: 1,
    });
  });
  it("leaves getter calls, other collections and dynamic names off the direct counter", () => {
    const source = [
      "const a = await getCharactersCollection(db);",
      'db.collection<Bond>("bonds").find({});',
      "db.collection<Doc>(name).find({});",
      '// db.collection("characters") in a comment',
    ].join("\n");
    expect(countAccess(source, "src/lib/x.ts")).toEqual({});
  });
  it("exempts the getter modules from the direct counter only", () => {
    expect(countAccess('db.collection("states");', "src/lib/db/collections/states.ts")).toEqual({
      untyped: 1,
    });
  });
  it("skips tests and fixtures", () => {
    for (const file of [
      "src/lib/a.test.ts",
      "src/lib/a.spec.tsx",
      "src/lib/__tests__/a.ts",
      "src/lib/test-utils/a.ts",
      "src/lib/fooTestDb.ts",
    ])
      expect(isScannedFile(file)).toBe(false);
    expect(isScannedFile("src/lib/turnSystem.ts")).toBe(true);
  });
});

describe("data access ratchet", () => {
  const baseline = { "a.ts": { characters: 2, untyped: 1 } };
  it("passes when counts are equal or lower", () => {
    expect(findRegressions(baseline, { "a.ts": { characters: 1, untyped: 1 } })).toEqual([]);
  });
  it("fails a new direct call, a new metric or a new file", () => {
    expect(
      findRegressions(baseline, {
        "a.ts": { characters: 3, untyped: 1, states: 1 },
        "b.ts": { untyped: 1 },
      })
    ).toEqual([
      { file: "a.ts", metric: "characters", baseline: 2, current: 3 },
      { file: "a.ts", metric: "states", baseline: 0, current: 1 },
      { file: "b.ts", metric: "untyped", baseline: 0, current: 1 },
    ]);
  });
  it("lowers counts, drops cleaned entries, never raises or adds", () => {
    expect(
      lowerBaseline(
        { ...baseline, "c.ts": { npps: 1 } },
        { "a.ts": { characters: 5, states: 4 }, "new.ts": { untyped: 9 } }
      )
    ).toEqual({ "a.ts": { characters: 2 } });
  });
});

describe("repository data access", () => {
  it("does not exceed the committed baseline", () => {
    const regressions = findRegressions(readBaseline().files, scanRepo());
    expect(
      regressions,
      regressions.map((r) => `${r.file}: ${r.metric} ${r.baseline} -> ${r.current}`).join("\n") +
        "\nUse the typed getter in src/lib/db/collections (for example getCharactersCollection(db)) and give every .collection() call a document type. Only conversions may lower the baseline: npm run data-access:lower"
    ).toEqual([]);
  }, 90_000);
});
