import { describe, expect, it } from "vitest";
import { getTrustStatus, isStampOlderThan, parseTrustStamp, shortVersion } from "./trustStamp";

describe("parseTrustStamp", () => {
  it("reads the stamp at the end of a page", () => {
    expect(parseTrustStamp("Body text.\n\nLast checked 2026-10-29, version 1.18.0.")).toEqual({
      date: "2026-10-29",
      version: "1.18.0",
    });
  });

  it("reads a stamp in the middle of a line", () => {
    expect(
      parseTrustStamp(
        "Live in every world. Last checked 2026-11-10, version 1.20.0. Exact rules: x"
      )
    ).toEqual({ date: "2026-11-10", version: "1.20.0" });
  });

  it("uses the last stamp when several appear", () => {
    const text =
      "Last checked 2026-01-01, version 1.1.0.\nLast checked 2026-11-10, version 1.20.0.";
    expect(parseTrustStamp(text)?.version).toBe("1.20.0");
  });

  it("returns null without a stamp", () => {
    expect(parseTrustStamp("Nothing here. Last checked recently.")).toBeNull();
  });
});

describe("isStampOlderThan", () => {
  it("compares major and minor, ignoring patch", () => {
    expect(isStampOlderThan("1.18.0", "1.20.0")).toBe(true);
    expect(isStampOlderThan("1.20.0", "1.20.3")).toBe(false);
    expect(isStampOlderThan("1.20.0", "1.20.0")).toBe(false);
    expect(isStampOlderThan("0.9.0", "1.0.0")).toBe(true);
  });

  it("never flags a newer or unparseable stamp", () => {
    expect(isStampOlderThan("1.21.0", "1.20.0")).toBe(false);
    expect(isStampOlderThan("x", "1.20.0")).toBe(false);
  });
});

describe("getTrustStatus", () => {
  it("marks old pages stale", () => {
    expect(getTrustStatus("Last checked 2026-10-29, version 1.18.0.", "1.20.0")).toEqual({
      date: "2026-10-29",
      version: "1.18.0",
      stale: true,
    });
  });

  it("returns null for pages without a stamp", () => {
    expect(getTrustStatus("plain", "1.20.0")).toBeNull();
  });

  it("shortens versions", () => {
    expect(shortVersion("1.18.0")).toBe("1.18");
  });
});
