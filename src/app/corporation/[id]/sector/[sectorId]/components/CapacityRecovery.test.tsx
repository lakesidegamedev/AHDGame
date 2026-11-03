// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import CapacityRecovery from "./CapacityRecovery";
import type { PlantsData } from "../types";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `$${n.toFixed(2)}` }),
}));
afterEach(cleanup);

describe("capacity recovery choice", () => {
  it("previews parked upkeep and sends the selected active share only on apply", () => {
    const onResize = vi.fn();
    const plants = {
      capacityUnits: 1000,
      plantCount: 40,
      mothballed: false,
      activeCapacityPercent: 100,
      capacityRecovery: { coldUpkeepFraction: 0.05, coldUpkeepDailyAnchor: 240 },
    } as PlantsData;
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <CapacityRecovery
          plants={plants}
          sizing={{ sectorType: "manufacturing" }}
          busy={false}
          onResize={onResize}
        />
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByRole("slider", { name: /Keep 100%/ }), {
      target: { value: "25" },
    });
    // Counted in plants; the units stay on hover.
    const active = screen.getByText("About 10 of 40 plants running");
    expect(active.getAttribute("title")).toBe("250 units/day at full run");
    expect(screen.getByText(/Parked capacity upkeep: \$7.50\/turn/)).toBeTruthy();
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply capacity setting" }));
    expect(onResize).toHaveBeenCalledWith(25);
  });
});
