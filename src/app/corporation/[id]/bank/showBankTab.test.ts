import { describe, expect, it } from "vitest";
import { shouldShowBankTab } from "./showBankTab";

describe("shouldShowBankTab", () => {
  it("shows for a financial-sector owner who is not the CEO and has no charter", () => {
    expect(shouldShowBankTab({ visible: true, charter: null, canIssueCharter: false })).toBe(true);
  });
  it("shows for a charter holder", () => {
    expect(shouldShowBankTab({ charter: { status: "active" } })).toBe(true);
  });
  it("shows when a charter can be issued", () => {
    expect(shouldShowBankTab({ canIssueCharter: true })).toBe(true);
  });
  it("hides when the console is not visible", () => {
    expect(shouldShowBankTab({ visible: false, charter: null, canIssueCharter: false })).toBe(
      false
    );
    expect(shouldShowBankTab({})).toBe(false);
  });
});
