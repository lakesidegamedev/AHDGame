// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WireTransferCard } from "./WireTransferCard";

vi.mock("@/contexts/CurrencyContext", () => ({ useCurrency: () => ({ formatAmount: String }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/observability/actionBreadcrumb", () => ({ trackAction: vi.fn() }));
vi.mock("@/components/PlayerSelector", () => ({
  PlayerSelector: ({
    onSelect,
  }: {
    onSelect: (recipient: { id: string; name: string }) => void;
  }) => (
    <button onClick={() => onSelect({ id: "recipient", name: "Synthetic recipient" })}>
      Select recipient
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["-5", "1.5", "1e6", "9007199254740992"])(
  "does not submit a rewritten wire amount %s",
  async (raw) => {
    const request = vi.spyOn(globalThis, "fetch");
    render(
      <WireTransferCard
        cashOnHand={10000}
        myCharacterId="sender"
        countryId="US"
        onSuccess={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Select recipient"));
    const input = screen.getByPlaceholderText("0");
    fireEvent.change(input, { target: { value: raw } });
    fireEvent.click(screen.getByRole("button", { name: "Send wire" }));
    expect(input).toHaveProperty("value", raw);
    expect(screen.getByText("Enter a whole-number amount greater than zero.")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  }
);
