/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./ProposeBillModal", () => ({
  ProposeBillModal: (props: { hasActiveBill?: boolean }) => (
    <div data-testid="propose-modal" data-active-bill={String(Boolean(props.hasActiveBill))} />
  ),
}));
vi.mock("./NominationCard", () => ({
  NominationCard: ({ nom }: { nom: { positionName: string } }) => <div>{nom.positionName}</div>,
}));

import { CongressBillsTab } from "./CongressBillsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CongressBillsTab proposal browsing", () => {
  it("opens directly to cabinet confirmations with other nominations filtered out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("cabinet-nominations")
            ? { nominations: [{ id: "1", positionName: "Secretary of State" }] }
            : url.includes("scotus-nominations")
              ? { nominations: [{ id: "2", positionName: "Supreme Court nominee" }] }
              : { bills: [] },
      }))
    );
    render(
      <CongressBillsTab
        activeTab="senate"
        canPropose={false}
        countryId="US"
        initialStatusFilter="confirmations"
      />
    );
    expect(await screen.findByText("Secretary of State")).toBeTruthy();
    expect(screen.queryByText("Supreme Court nominee")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Supreme Court nominee")).toBeTruthy();
  });

  it("lets a seated member open the proposal modal while an active bill blocks submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ bills: [], blockedProvisions: [], proposalWarnings: {} }),
      }))
    );

    render(
      <CongressBillsTab
        activeTab="house"
        canPropose={false}
        myChamber="house"
        hasActiveBill
        countryId="US"
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Propose" }));
    await waitFor(() =>
      expect(screen.getByTestId("propose-modal").dataset.activeBill).toBe("true")
    );
  });

  it("keeps the proposal menu unavailable to an ineligible player without an active bill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ bills: [], blockedProvisions: [], proposalWarnings: {} }),
      }))
    );

    render(<CongressBillsTab activeTab="house" canPropose={false} countryId="US" />);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Propose" })).toBeNull());
    expect(screen.queryByTestId("propose-modal")).toBeNull();
  });
});
