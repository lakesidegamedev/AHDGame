import { expect, it } from "vitest";
import { electionNavLabel } from "./electionNavLabel";

it.each([
  ["Premier", "governor", "CA_NT", "Premier · NT"],
  ["Commons", "caCommons", "CA_ON", "Commons · ON"],
  ["Governor", "governor", "CA", "Governor · CA"],
  ["President", "president", "US", "President · National"],
  ["First Minister", "governor", "SCO", "First Minister · SCO"],
])("formats %s navigation without exposing storage prefixes", (label, type, state, expected) => {
  expect(electionNavLabel(label, { electionType: type, state })).toBe(expected);
});
