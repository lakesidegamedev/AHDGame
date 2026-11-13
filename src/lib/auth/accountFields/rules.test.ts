import { describe, expect, it } from "vitest";
import {
  ACCOUNT_URL,
  FREEZE_MESSAGE,
  accountFieldsMessage,
  centralActionLabel,
  decideSupersededLogin,
  normalizeFeedEmail,
  parseAccountChangesPage,
  parseAccountFieldsMode,
} from "./rules";

describe("parseAccountFieldsMode", () => {
  it("defaults to off for unset, empty and unknown values", () => {
    expect(parseAccountFieldsMode(undefined)).toBe("off");
    expect(parseAccountFieldsMode("")).toBe("off");
    expect(parseAccountFieldsMode("on")).toBe("off");
    expect(parseAccountFieldsMode("centrl")).toBe("off");
  });
  it("accepts freeze and central, trimmed and case-insensitive", () => {
    expect(parseAccountFieldsMode("freeze")).toBe("freeze");
    expect(parseAccountFieldsMode(" Central ")).toBe("central");
    expect(parseAccountFieldsMode("OFF")).toBe("off");
  });
});

describe("messages", () => {
  it("uses the freeze wording for every kind", () => {
    expect(accountFieldsMessage("freeze", "email")).toBe(FREEZE_MESSAGE);
    expect(accountFieldsMessage("freeze", "reset")).toBe(FREEZE_MESSAGE);
  });
  it("names the account address in central mode", () => {
    expect(accountFieldsMessage("central", "password")).toBe(
      `Change your password at your Lakeside account: ${ACCOUNT_URL}`
    );
    expect(centralActionLabel("reset")).toBe("Reset your password at your Lakeside account");
    expect(centralActionLabel("email")).toBe("Change your email at your Lakeside account");
  });
  it("has no em or en dashes", () => {
    for (const kind of ["email", "password", "reset"] as const) {
      expect(accountFieldsMessage("central", kind)).not.toMatch(/[–—]/);
    }
    expect(FREEZE_MESSAGE).not.toMatch(/[–—]/);
  });
});

describe("normalizeFeedEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeFeedEmail("  Player@Example.INVALID ")).toBe("player@example.invalid");
  });
  it("rejects non-strings and malformed values", () => {
    expect(normalizeFeedEmail(undefined)).toBeNull();
    expect(normalizeFeedEmail("no-at-sign")).toBeNull();
    expect(normalizeFeedEmail("a b@c")).toBeNull();
  });
});

describe("parseAccountChangesPage", () => {
  const id = "0123456789abcdef01234567";
  it("sorts by seq and drops malformed entries", () => {
    const page = parseAccountChangesPage({
      changes: [
        { seq: 3, ahdUserId: id, kind: "password", at: 1 },
        { seq: 2, ahdUserId: id.toUpperCase(), kind: "email", email: "a@b.c", at: 2 },
        { seq: 4, ahdUserId: "short", kind: "email", at: 3 },
        { seq: "5", ahdUserId: id, kind: "email", at: 3 },
        null,
      ],
      next: 3,
    });
    expect(page?.changes.map((c) => c.seq)).toEqual([2, 3]);
    expect(page?.changes[0].ahdUserId).toBe(id);
    expect(page?.next).toBe(3);
  });
  it("rejects a malformed page", () => {
    expect(parseAccountChangesPage(null)).toBeNull();
    expect(parseAccountChangesPage({ changes: "x", next: 1 })).toBeNull();
    expect(parseAccountChangesPage({ changes: [], next: -1 })).toBeNull();
  });
});

describe("decideSupersededLogin", () => {
  it("only a definite central answer decides", () => {
    expect(decideSupersededLogin("ok")).toBe("accept");
    expect(decideSupersededLogin("wrong")).toBe("reject");
    expect(decideSupersededLogin("disabled")).toBe("reject");
  });
  it("an outage or unknown account refuses instead of using a local copy", () => {
    expect(decideSupersededLogin("error")).toBe("unavailable");
    expect(decideSupersededLogin("timeout")).toBe("unavailable");
    expect(decideSupersededLogin("unknown")).toBe("unavailable");
  });
});
