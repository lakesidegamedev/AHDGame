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
  parseUsernameMode,
  normalizeFeedUsername,
  formerUsername,
  loginIdentifierFilter,
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

describe("parseUsernameMode", () => {
  it("is off unless exactly central", () => {
    expect(parseUsernameMode(undefined)).toBe("off");
    expect(parseUsernameMode("")).toBe("off");
    expect(parseUsernameMode("on")).toBe("off");
    expect(parseUsernameMode(" Central ")).toBe("central");
  });
});

describe("normalizeFeedUsername", () => {
  it("keeps display case and builds a lowercase key", () => {
    expect(normalizeFeedUsername(" MixedCase ")).toEqual({
      display: "MixedCase",
      key: "mixedcase",
    });
  });
  it("accepts 2 and 22 character names", () => {
    expect(normalizeFeedUsername("Jo")?.key).toBe("jo");
    expect(normalizeFeedUsername("a".repeat(22))?.display).toHaveLength(22);
  });
  it("refuses empty, spaced and non-string values", () => {
    expect(normalizeFeedUsername("")).toBeNull();
    expect(normalizeFeedUsername("a b")).toBeNull();
    expect(normalizeFeedUsername(5)).toBeNull();
  });
});

describe("formerUsername", () => {
  const now = new Date("2030-02-01T00:00:00Z");
  const entry = (username: string, at: string) => ({
    username,
    changedAt: new Date(at),
    source: "central" as const,
  });
  it("shows the newest name inside 30 days", () => {
    const history = [
      entry("Older", "2030-01-10T00:00:00Z"),
      entry("Recent", "2030-01-25T00:00:00Z"),
    ];
    expect(formerUsername(history, now)).toBe("Recent");
  });
  it("shows nothing after 30 days or with no history", () => {
    expect(formerUsername([entry("Old", "2029-12-25T00:00:00Z")], now)).toBeNull();
    expect(formerUsername(undefined, now)).toBeNull();
    expect(formerUsername([], now)).toBeNull();
  });
});

describe("loginIdentifierFilter", () => {
  type Row = { email: string; username: string };
  const find = (rows: Row[], identifier: string) => {
    const [byEmail, byName] = loginIdentifierFilter(identifier).$or;
    return rows.find((r) => r.email === byEmail.email || r.username === byName.username);
  };

  it("matches case-insensitively and ignores surrounding spaces", () => {
    const rows = [{ email: "a@example.invalid", username: "newname" }];
    expect(find(rows, " NewName ")?.username).toBe("newname");
    expect(find(rows, "A@Example.invalid")?.username).toBe("newname");
  });

  it("matches the new name after a rename and not the old one", () => {
    const row = { email: "a@example.invalid", username: "oldname" };
    expect(find([row], "OldName")).toBe(row);
    row.username = "newname";
    expect(find([row], "NewName")).toBe(row);
    expect(find([row], "OldName")).toBeUndefined();
  });

  it("matches 2 and 22 character names", () => {
    const long = "a".repeat(22);
    const rows = [
      { email: "b@example.invalid", username: "jo" },
      { email: "c@example.invalid", username: long },
    ];
    expect(find(rows, "JO")?.username).toBe("jo");
    expect(find(rows, long.toUpperCase())?.username).toBe(long);
  });
});
