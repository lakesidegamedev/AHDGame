import { describe, expect, it } from "vitest";
import { defaultInboxSegment, unreadBadgeLabel } from "./badgeLabel";

describe("unreadBadgeLabel", () => {
  it("shows the true count up to 99", () => {
    expect(unreadBadgeLabel(9)).toBe("9");
    expect(unreadBadgeLabel(21)).toBe("21");
    expect(unreadBadgeLabel(97)).toBe("97");
    expect(unreadBadgeLabel(99)).toBe("99");
  });
  it("caps above 99", () => {
    expect(unreadBadgeLabel(100)).toBe("99+");
  });
});

describe("defaultInboxSegment", () => {
  it("opens on unread items when nothing needs action", () => {
    expect(defaultInboxSegment({ action: 0, all: 21 })).toBe("all");
  });
  it("keeps Needs action when something needs it", () => {
    expect(defaultInboxSegment({ action: 2, all: 21 })).toBe("action");
  });
  it("keeps Needs action when fully caught up", () => {
    expect(defaultInboxSegment({ action: 0, all: 0 })).toBe("action");
  });
});
