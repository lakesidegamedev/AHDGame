/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ElectionHeader } from "./ElectionHeader";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const base = {
  electionYear: 2030,
  localInPrimary: true,
  localIsEnded: false,
  localIsUpcoming: false,
  canEnter: false,
  canWithdraw: false,
  actionLoading: false,
  onEnter: vi.fn(),
  onWithdraw: vi.fn(),
};

describe("ElectionHeader incumbent note", () => {
  it("says why the sitting officeholder is absent from the race", () => {
    const election = {
      electionType: "governor",
      state: "Texas",
      incumbent: {
        name: "Hansen",
        party: "Republican",
        running: false,
        notRunningReason: "Term limited",
      },
    };
    render(<ElectionHeader {...base} election={election as never} />);
    expect(screen.getByTestId("incumbent-not-running").textContent).toContain(
      "Hansen (Republican) is not on the ballot: Term limited."
    );
  });

  it("stays quiet when the incumbent is running", () => {
    const election = {
      electionType: "governor",
      state: "Texas",
      incumbent: { name: "Hansen", party: "Republican", running: true },
    };
    render(<ElectionHeader {...base} election={election as never} />);
    expect(screen.queryByTestId("incumbent-not-running")).toBeNull();
  });
});
