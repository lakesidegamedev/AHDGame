/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoteDocket } from "./VoteDocket";
import { OwnershipRing } from "./OwnershipRing";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("VoteDocket", () => {
  it("vote docket counts turns left", () => {
    render(
      <VoteDocket
        currentTurn={741}
        votes={[
          { _id: "a", type: "relocation", deadlineAtTurn: 742 },
          { _id: "b", type: "share_issuance", deadlineAtTurn: 745 },
          { _id: "c", type: "mystery_vote" },
        ]}
      />
    );
    expect(screen.getByText("Relocation")).toBeTruthy();
    expect(screen.getByText("T742")).toBeTruthy();
    expect(screen.getByText("in 1 turn")).toBeTruthy();
    expect(screen.getByText("in 4 turns")).toBeTruthy();
    // Unknown types fall back to their id; no deadline reads as open, once.
    expect(screen.getByText("mystery_vote")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.queryByText("open")).toBeNull();
  });

  it("says closing when the deadline is this turn or past", () => {
    render(
      <VoteDocket
        currentTurn={745}
        votes={[{ _id: "a", type: "relocation", deadlineAtTurn: 745 }]}
      />
    );
    expect(screen.getByText("closing")).toBeTruthy();
  });
});

describe("OwnershipRing", () => {
  it("ownership ring lists share counts and the holder count", () => {
    render(
      <OwnershipRing
        holderCount={36}
        slices={[
          {
            key: "a",
            label: "Avery Lane",
            shares: 4_214_000,
            pct: 14,
            color: "var(--x)",
            href: "/character/1",
            isYou: false,
          },
          {
            key: "b",
            label: "Other holders",
            shares: 25_886_000,
            pct: 86,
            color: "var(--y)",
            href: null,
            isYou: false,
          },
        ]}
      />
    );
    expect(screen.getByText("4,214,000")).toBeTruthy();
    expect(screen.getByText("36")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Avery Lane" }).getAttribute("href")).toBe(
      "/character/1"
    );
  });
});
