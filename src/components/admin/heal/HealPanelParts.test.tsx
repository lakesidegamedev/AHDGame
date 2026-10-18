// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

afterEach(cleanup);

describe("HealPanelActions", () => {
  it("calls each action and disables both buttons while busy", () => {
    const onDiagnose = vi.fn().mockResolvedValue(undefined);
    const onHeal = vi.fn().mockResolvedValue(undefined);
    const props = { onDiagnose, onHeal };
    const { rerender } = render(<HealPanelActions {...props} loading={false} />);
    fireEvent.click(screen.getByText("Diagnose"));
    fireEvent.click(screen.getByText("Heal all"));
    expect(onDiagnose).toHaveBeenCalledOnce();
    expect(onHeal).toHaveBeenCalledOnce();
    rerender(<HealPanelActions {...props} loading />);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(onDiagnose).toHaveBeenCalledOnce();
    expect(onHeal).toHaveBeenCalledOnce();
    expect(screen.getByText("Running...")).toBeTruthy();
    expect(screen.getByText("Healing...")).toBeTruthy();
  });

  it("keeps panel-specific action labels and warning styling", () => {
    const props = {
      onDiagnose: vi.fn(),
      onHeal: vi.fn(),
      diagnosePendingLabel: "Loading...",
      healPendingLabel: "Fixing...",
      healLabel: "Withdraw invalid candidates",
      healTone: "warning" as const,
    };
    const { rerender } = render(<HealPanelActions {...props} loading={false} />);
    expect(screen.getByText("Withdraw invalid candidates").className).toContain("text-warning");
    rerender(<HealPanelActions {...props} loading />);
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.getByText("Fixing...")).toBeTruthy();
  });
});

describe("HealPanelMessage", () => {
  it("renders only the existing result text and severity", () => {
    const { container, rerender } = render(<HealPanelMessage result={null} />);
    expect(container.innerHTML).toBe("");
    rerender(<HealPanelMessage result={{ ok: true, message: "Repaired" }} />);
    expect(screen.getByText("Repaired").className).toBe("text-xs font-medium text-success");
    rerender(<HealPanelMessage result={{ ok: false, message: "Refused" }} />);
    expect(screen.getByText("Refused").className).toBe("text-xs font-medium text-error");
  });
});
