import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "./catalog";
import {
  buildReportDraft,
  errorCopyFor,
  firstStackFrames,
  formatErrorRef,
  isStaffUser,
} from "./presentation";

describe("presentation", () => {
  it("has copy for every catalog code, without dashes", () => {
    for (const code of Object.keys(ERROR_CATALOG)) {
      const c = errorCopyFor(code);
      expect(c.title.length).toBeGreaterThan(0);
      expect(JSON.stringify(c)).not.toMatch(/[–—]/);
    }
  });
  it("formats a ref with the full event id and builds a draft", () => {
    const f = { code: "CLIENT_ERROR", route: "/a", eventId: "e".repeat(32), time: "t", build: "b" };
    expect(formatErrorRef(f)).toContain(`event=${"e".repeat(32)}`);
    expect(buildReportDraft(f, "T").description).toContain("Build: b");
  });
  it("trims stack frames and detects staff", () => {
    expect(firstStackFrames("Error: x\n  at a (f.js:1)\n  at b (f.js:2)", 1)).toEqual([
      "at a (f.js:1)",
    ]);
    expect(isStaffUser({ isModerator: true })).toBe(true);
    expect(isStaffUser({})).toBe(false);
  });
});
