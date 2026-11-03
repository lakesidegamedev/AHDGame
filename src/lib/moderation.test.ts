import { describe, expect, it } from "vitest";
import { containsBlockedName, containsModerateProfanity, containsSlur } from "./moderation";

describe("containsSlur", () => {
  it("blocks slurs and common obfuscations", () => {
    expect(containsSlur("faggot")).toBe(true);
    expect(containsSlur("n1gg3r")).toBe(true);
  });

  it("allows ordinary words", () => {
    expect(containsSlur("Dick")).toBe(false);
    expect(containsSlur("ass")).toBe(false);
  });

  it("allows country, people and place names that share letters with a slur", () => {
    for (const text of [
      "Niger",
      "Trade talks with Niger stall",
      "NIGER signs the treaty",
      "Niger's uranium exports",
      "Nigeria and Nigerians vote today",
      "A Nigerien delegation arrives",
      "Floods along the Niger River",
      "Guinea",
      "Guinea-Bissau joins the bloc",
      "Equatorial Guinea oil output",
      "Papua New Guinea elects a prime minister",
      "Guinean ministers resign",
      "Mail from Niger, Nigeria and Papua New Guinea",
    ]) {
      expect(containsSlur(text), text).toBe(false);
    }
  });

  it("still blocks the slur next to or near an allowed place name", () => {
    expect(containsSlur("nigger")).toBe(true);
    expect(containsSlur("n1ger")).toBe(true);
    expect(containsSlur("niggers from Niger")).toBe(true);
    expect(containsSlur("Niger is full of n1ggas")).toBe(true);
    expect(containsSlur("Nigerr")).toBe(true);
  });
});

describe("containsModerateProfanity", () => {
  it("blocks stronger profanity in names", () => {
    expect(containsModerateProfanity("fuck")).toBe(true);
    expect(containsModerateProfanity("rape me")).toBe(true);
    expect(containsModerateProfanity("bitch")).toBe(true);
  });

  it("does not block mild words or unrelated names", () => {
    expect(containsModerateProfanity("ass")).toBe(false);
    expect(containsModerateProfanity("Dick")).toBe(false);
  });
});

describe("containsBlockedName", () => {
  it("blocks either slurs or moderate profanity", () => {
    expect(containsBlockedName("faggot")).toBe(true);
    expect(containsBlockedName("fuck")).toBe(true);
  });

  it("allows clean names", () => {
    expect(containsBlockedName("Niger Uranium Corporation")).toBe(false);
    expect(containsBlockedName("Papua New Guinea Party")).toBe(false);
    expect(containsBlockedName("Alice")).toBe(false);
    expect(containsBlockedName("Dick")).toBe(false);
    expect(containsBlockedName("ass")).toBe(false);
  });
});
