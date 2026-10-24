// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpinOffModal } from "./SpinOffModal";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `$${Math.round(n)}` }),
}));
vi.mock("@/components/PlayerSelector", () => ({
  PlayerSelector: () => <div data-testid="player-selector" />,
}));

const sectorOptions = [{ type: "energy", count: 2 }];

function renderModal(cooldownTurnsRemaining?: number) {
  return render(
    <SpinOffModal
      corporationId="c1"
      sectorOptions={sectorOptions}
      cooldownTurnsRemaining={cooldownTurnsRemaining}
      onClose={vi.fn()}
      onSpunOff={vi.fn()}
    />
  );
}

describe("SpinOffModal cooldown", () => {
  it("warns that a spin-off starts a 168 turn cooldown before the player commits", () => {
    renderModal();
    expect(screen.getByText(/168 turn cooldown, about a week/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Spin off" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); // no name yet, but not because of a cooldown
  });

  it("shows the remaining cooldown and blocks the action", () => {
    renderModal(42);
    expect(screen.getByText("Spin-off is on cooldown for 42 more turns.")).toBeTruthy();
    expect(screen.queryByText(/168 turn cooldown/)).toBeNull();
    const button = screen.getByRole("button", { name: "Cooldown: 42 turns" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("says turn, not turns, on the last turn of the cooldown", () => {
    renderModal(1);
    expect(screen.getByText("Spin-off is on cooldown for 1 more turn.")).toBeTruthy();
  });
});
