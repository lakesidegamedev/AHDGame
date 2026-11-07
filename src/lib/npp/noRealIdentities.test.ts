/**
 * Owner rule: no new world seats a real politician or claims a real person's
 * identity. The portrait pool may supply generic faces, but never paired with
 * the person a photograph depicts.
 *
 * This guard covers every authored identity a reset can write: the seat
 * roster overlays, the Supreme Court Original Rosters and the era intro text
 * a new player reads. It checks a sample of well-known names, so it catches a
 * real-name overlay coming back rather than proving no real name exists.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { RESET_PRESETS } from "@/lib/constants/historicalSeats";
import { getScotusPresetSeed } from "@/lib/scotus/presetData";
import { getJusticePortrait } from "@/lib/scotus/justiceImages";
import { PRESET_CHARACTER_CREATION_FLAVOR } from "@/app/api/game/countries/route";
import { REAL_POLITICIAN_NAME_SAMPLE } from "@/lib/test-utils/realPoliticianNames";
import { isRosteredPreset, type RosterMap } from "./historicalRosters";

const REAL = new Set(REAL_POLITICIAN_NAME_SAMPLE.map((n) => n.toLowerCase()));

/** Surnames of the sample, for free text that names a person by surname alone. */
const REAL_SURNAMES = [
  ...new Set(
    REAL_POLITICIAN_NAME_SAMPLE.map((n) => n.split(" ").pop()!).filter((s) => s.length > 3)
  ),
];

async function allRosterEntries(): Promise<Array<[string, RosterMap[string]]>> {
  const dir = path.join(process.cwd(), "src", "lib", "npp", "rosters");
  const entries: Array<[string, RosterMap[string]]> = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const mod = (await import(`./rosters/${file.replace(/\.ts$/, "")}.ts`)) as Record<
      string,
      RosterMap
    >;
    for (const map of Object.values(mod)) {
      for (const [key, entry] of Object.entries(map)) entries.push([`${file}:${key}`, entry]);
    }
  }
  return entries;
}

describe("no real identities in new worlds", () => {
  it("only the 2027 preset carries authored seat identities", () => {
    const rostered = RESET_PRESETS.map((p) => p.id).filter(isRosteredPreset);
    expect(rostered).toEqual(["2027-default"]);
  });

  it("no authored seat identity is a real politician or pins a portrait", async () => {
    const entries = await allRosterEntries();
    expect(entries.length).toBeGreaterThan(0);
    const problems = entries.flatMap(([key, entry]) => [
      ...(REAL.has(entry.name.toLowerCase()) ? [`${key}: real name ${entry.name}`] : []),
      ...("portraitId" in entry ? [`${key}: pins a portrait`] : []),
    ]);
    expect(problems).toEqual([]);
  });

  it("no Supreme Court Original Roster names a real justice or shows a real portrait", () => {
    const problems: string[] = [];
    for (const preset of RESET_PRESETS) {
      const seed = getScotusPresetSeed(preset.id);
      for (const seat of seed?.seats ?? []) {
        for (const occupant of seat.historicalOccupants) {
          if (REAL.has(occupant.name.toLowerCase())) {
            problems.push(`${preset.id} seat ${seat.seatNumber}: ${occupant.name}`);
          }
          if (getJusticePortrait(occupant.name) !== null) {
            problems.push(`${preset.id} seat ${seat.seatNumber}: portrait for ${occupant.name}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("era intros describe the setting without naming real politicians", () => {
    const problems: string[] = [];
    for (const [preset, text] of Object.entries(PRESET_CHARACTER_CREATION_FLAVOR)) {
      for (const surname of REAL_SURNAMES) {
        if (new RegExp(`\\b${surname}\\b`).test(text)) problems.push(`${preset}: ${surname}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
