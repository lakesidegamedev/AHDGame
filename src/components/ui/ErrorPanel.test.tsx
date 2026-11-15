/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReportedError } from "@/lib/errors/useReportedError";

let mockUser: Record<string, unknown> | null = null;
vi.mock("@/contexts/AuthDataContext", () => ({
  useOptionalAuthMe: () => ({ user: mockUser }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { ErrorPanel } from "./ErrorPanel";

const reported: ReportedError = {
  code: "CLIENT_ERROR",
  message: "x",
  eventId: "0123456789abcdef0123456789abcdef",
  route: "/actions",
  time: "2026-01-01T00:00:00.000Z",
  build: "abc1234",
};
const error = Object.assign(new Error("boom"), { name: "TypeError" });

describe("ErrorPanel", () => {
  it("shows plain copy, report action and the full event id to players, with no staff details", () => {
    mockUser = { isAdmin: false, isModerator: false };
    render(<ErrorPanel error={error} reported={reported} onRetry={() => {}} />);
    expect(screen.getByText("This page hit a problem")).toBeTruthy();
    expect(screen.getByText("Report this problem")).toBeTruthy();
    expect(screen.getByTestId("error-ref").textContent).toBe(reported.eventId);
    expect(screen.queryByText("Staff details")).toBeNull();
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("shows staff details to staff only", () => {
    mockUser = { isAdmin: false, isModerator: true };
    render(<ErrorPanel error={error} reported={reported} onRetry={() => {}} />);
    expect(screen.getByText("Staff details")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("keeps the boundary's own description and links", () => {
    mockUser = null;
    render(
      <ErrorPanel
        error={error}
        reported={reported}
        onRetry={() => {}}
        description="The actions page couldn't load."
        links={[{ href: "/actions", label: "Back to Actions" }]}
      />
    );
    expect(screen.getByText("The actions page couldn't load.")).toBeTruthy();
    expect(screen.getByText("Back to Actions")).toBeTruthy();
  });
});
