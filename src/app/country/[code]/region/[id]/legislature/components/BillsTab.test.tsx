/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/layout.json";
import { BillsTab } from "./BillsTab";
const mocks = vi.hoisted(() => ({ modal: vi.fn() }));
vi.mock("next/dynamic", () => ({
  default: () => (props: unknown) => {
    mocks.modal(props);
    return <div>Regional proposal composer</div>;
  },
}));
vi.mock("@/contexts/useGameClock", () => ({ useGameClock: () => ({ currentTurn: 100 }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Party chair regional proposal action", () => {
  const props = {
    bills: [],
    canPropose: false,
    canVote: false,
    stateId: "SCO",
    countryId: "UK",
    legislationVersion: "v2" as const,
    canProposeViaPartyNpp: true,
    onRefresh: vi.fn(),
    totalSeats: 129,
    billChamber: "stateSenate" as const,
  };
  function show(overrides = {}) {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BillsTab {...props} {...overrides} />
      </NextIntlClientProvider>
    );
  }
  it("lets an eligible chair open the composer without holding a human seat", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Propose through party legislator" }));
    expect(mocks.modal).toHaveBeenCalledWith(
      expect.objectContaining({
        proposeViaPartyNpp: true,
        adminOverride: false,
        legislationVersion: "v2",
      })
    );
  });
  it("does not turn a chair action into an admin override", () => {
    show({ adminOverride: true });
    fireEvent.click(screen.getByRole("button", { name: "Propose through party legislator" }));
    expect(mocks.modal).toHaveBeenCalledWith(
      expect.objectContaining({ proposeViaPartyNpp: true, adminOverride: false })
    );
  });
  it("keeps a seated player's direct proposal separate", () => {
    show({ canPropose: true });
    fireEvent.click(screen.getByRole("button", { name: /^Propose$/ }));
    expect(mocks.modal).toHaveBeenCalledWith(
      expect.objectContaining({ proposeViaPartyNpp: false, adminOverride: false })
    );
  });
  it("does not offer chair proposals without server eligibility", () => {
    show({ canProposeViaPartyNpp: false });
    expect(screen.queryByRole("button", { name: "Propose through party legislator" })).toBeNull();
  });
});
