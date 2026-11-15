import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORPORATION_TYPES,
  OPERATING_SECTOR_TYPES,
  SPECIALIZED_OPERATING_LANES,
  operatingSectorIdentity,
  operatingSectorTypeFor,
} from "./corporations";

/**
 * Automobiles is manufacturing with the vehicles model and entertainment is
 * media with the entertainment discriminator, in every era. Neither may come
 * back as a corporation or sector type anywhere in src. The only code that may
 * name the retired types is the one-off migration that re-keys stored rows.
 */
const SRC_ROOT = join(__dirname, "..", "..");
const RETIRED_A = ["auto", "mobiles"].join("");
const RETIRED_E = ["entertain", "ment"].join("");

const ALLOWLIST = new Set([
  "lib/constants/retiredCorporationTypes.guard.test.ts",
  "lib/migrations/entries/2026-10-05-fold-automobile-entertainment-types.ts",
  "lib/migrations/entries/2026-10-05-fold-automobile-entertainment-types.test.ts",
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const directory = entry.isDirectory() || (!entry.isFile() && statSync(path).isDirectory());
    if (directory) sourceFiles(path, out);
    else if (/\.(ts|tsx|json)$/.test(name)) out.push(path);
  }
  return out;
}

/** The word as a whole quoted value, or as the head of a quoted key ("x.ev", "x-1950-3"). */
const quoted = (word: string) => new RegExp(`["'\`]${word}(?:["'\`]|[.\\-:/])`);
const asKey = (word: string) => new RegExp(`(?<![\\w"'])${word}\\??\\s*:(?!:)`);
/**
 * "entertainment" stays canonical as the media discriminator value, so it only
 * offends where it is used as a type: a key, a lane-key prefix, a type field,
 * or listed beside media as a sibling sector.
 */
const typeField = (word: string) =>
  new RegExp(
    `\\b(?:type|sectorType|secondaryType|primaryType|targetSectorType|operatingSectorType|operatingType|recipeType|primary|secondary)\\s*(?::|===|!==|=)\\s*["'\`]${word}["'\`]`
  );
const besideMedia = (word: string) =>
  new RegExp(
    `["'\`]media["'\`]\\s*,\\s*["'\`]${word}["'\`]|["'\`]${word}["'\`]\\s*,\\s*["'\`]media["'\`]`
  );
const lanePrefix = (word: string) => new RegExp(`["'\`]${word}[.\\-]`);

const retiredAutomobileValue = quoted(RETIRED_A);
const retiredAutomobileKey = asKey(RETIRED_A);
const retiredEntertainmentKey = asKey(RETIRED_E);
const retiredEntertainmentType = typeField(RETIRED_E);
const retiredEntertainmentSibling = besideMedia(RETIRED_E);
const retiredEntertainmentLane = lanePrefix(RETIRED_E);

/** Lines that name a retired type as a type, key, or quoted value. */
function offences(file: string, text: string): string[] {
  if (!text.includes(RETIRED_A) && !text.includes(RETIRED_E)) return [];
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (!line.includes(RETIRED_A) && !line.includes(RETIRED_E)) return;
    if (retiredAutomobileValue.test(line) || retiredAutomobileKey.test(line)) {
      found.push(`${file}:${index + 1}: ${line.trim()}`);
      return;
    }
    if (
      retiredEntertainmentKey.test(line) ||
      retiredEntertainmentType.test(line) ||
      retiredEntertainmentSibling.test(line) ||
      retiredEntertainmentLane.test(line)
    ) {
      found.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
  return found;
}

describe("retired corporation types", () => {
  it.each([
    [`type: "${RETIRED_A}"`, 1],
    [`"${RETIRED_A}.ev": true`, 1],
    [`${RETIRED_A}?: string`, 1],
    [`sectorType: "${RETIRED_E}"`, 1],
    [`["media", "${RETIRED_E}"]`, 1],
    [`"${RETIRED_E}-legacy": true`, 1],
    [`mediaDiscriminator: "${RETIRED_E}"`, 0],
    ['sectorType: "financial"', 0],
  ])("preserves retired-type detection for %s", (source, expected) => {
    expect(offences("fixture.ts", source as string)).toHaveLength(expected as number);
  });

  it("are not corporation types or operating lanes", () => {
    for (const retired of [RETIRED_A, RETIRED_E]) {
      expect(CORPORATION_TYPES as readonly string[]).not.toContain(retired);
      expect(OPERATING_SECTOR_TYPES as readonly string[]).not.toContain(retired);
    }
  });

  it("fold into manufacturing vehicles and media entertainment", () => {
    expect(operatingSectorIdentity("manufacturing_vehicles")).toEqual({
      sectorType: "manufacturing",
      industryModel: "vehicles",
      mediaDiscriminator: null,
    });
    expect(operatingSectorIdentity("media_entertainment")).toEqual({
      sectorType: "media",
      industryModel: null,
      mediaDiscriminator: "entertainment",
    });
    expect(operatingSectorTypeFor("manufacturing", "vehicles")).toBe("manufacturing_vehicles");
    expect(operatingSectorTypeFor("media", null, "entertainment")).toBe("media_entertainment");
  });

  it("keeps every lane exactly once: the corporation types plus the specialized lanes", () => {
    expect([...OPERATING_SECTOR_TYPES].sort()).toEqual(
      [...CORPORATION_TYPES, ...SPECIALIZED_OPERATING_LANES].sort()
    );
  });

  it("do not reappear anywhere in src outside the migration", () => {
    const found = sourceFiles(SRC_ROOT).flatMap((path) => {
      const file = relative(SRC_ROOT, path).split("\\").join("/");
      if (ALLOWLIST.has(file)) return [];
      return offences(file, readFileSync(path, "utf8"));
    });
    expect(found).toEqual([]);
    // Walks and reads every file under src; on a loaded CI shard this can exceed the
    // default 15s, so give the scan its own budget.
  }, 60_000);
});
