/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enNav from "../../messages/en/nav.json";
import { NavbarNotificationPanel } from "./NavbarNotificationPanel";
import type { NotificationPreview } from "@/components/navbar/useNavbarState";

const preview = (over: Partial<NotificationPreview>): NotificationPreview =>
  ({
    _id: "abc123",
    type: "system",
    title: "Budget passed",
    message: "The budget passed",
    read: false,
    ...over,
  }) as NotificationPreview;

function renderPanel(previews: NotificationPreview[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={enNav}>
      <NavbarNotificationPanel
        previews={previews}
        onMarkRead={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    </NextIntlClientProvider>
  );
}

describe("NavbarNotificationPanel", () => {
  it("links each row to the inbox with that notification id", () => {
    renderPanel([preview({ _id: "abc123" }), preview({ _id: "def456", title: "Other" })]);
    expect(screen.getByText("Budget passed").closest("a")?.getAttribute("href")).toBe(
      "/notifications?id=abc123"
    );
    expect(screen.getByText("Other").closest("a")?.getAttribute("href")).toBe(
      "/notifications?id=def456"
    );
  });

  it("only hides row actions behind hover on devices that can hover", () => {
    renderPanel([preview({})]);
    const del = screen.getByTitle(enNav.nav.notifications.delete);
    const group = del.parentElement as HTMLElement;
    expect(group.className).not.toMatch(/(^|\s)opacity-0/);
    expect(group.className).toContain("[@media(hover:hover)]:opacity-0");
    expect(group.className).toContain("[@media(hover:hover)]:group-hover:opacity-100");
  });
});
