import { describe, expect, it } from "vitest";
import { POSITION_BY_ELECTION_TYPE } from "@/lib/elections/electionMethod";
import { ELECTION_TYPE_LABEL_MAP, MULTI_SEAT_TYPES } from "@/lib/utils/electionLabels";
import { ANALYTICS_ELECTION_TYPES } from "./electionTypes";

/** Seated-office keys that share MULTI_SEAT_TYPES but are never an election type. */
const OFFICE_KEYS = new Set([
  "deputy",
  "senator",
  "member",
  "procurador",
  "sovietDeputy",
  "sejmDeputy",
  "assemblyDeputy",
  "assemblyDelegate",
]);

describe("ANALYTICS_ELECTION_TYPES", () => {
  // Two hand-kept copies of this list fell behind the game's chambers, so
  // results for the Sejm, the Nationalrat and others were recorded as "unknown".
  const known = new Set([
    ...Object.keys(POSITION_BY_ELECTION_TYPE),
    ...Object.keys(ELECTION_TYPE_LABEL_MAP),
    ...[...MULTI_SEAT_TYPES].filter((type) => !OFFICE_KEYS.has(type)),
  ]);

  it.each([...known])("records %s", (type) => {
    expect(ANALYTICS_ELECTION_TYPES.has(type)).toBe(true);
  });
});
