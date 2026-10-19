// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { CurrencyProvider, useCurrency } from "@/contexts/CurrencyContext";
import { useCorpMoney } from "./DenseKit";

const state = vi.hoisted(() => ({ forexEnabled: false }));
vi.mock("@/contexts/AuthDataContext", () => ({
  useAuthMe: () => ({
    user: {
      forexEnabled: state.forexEnabled,
      character: { countryId: "US", displayCurrencyPreference: "local" },
    },
  }),
}));
vi.mock("@/hooks/useWorldFlags", () => ({
  useWorldFlags: () => ({ preset: "1991-default", eurozoneEnabled: false }),
}));
vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: () => {} }));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { USD: 1, GBP: 0.6 }, baseRates: {} }),
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <CurrencyProvider>{children}</CurrencyProvider>
);

function renderMoney() {
  return renderHook(() => ({ money: useCorpMoney("GBP"), currency: useCurrency() }), { wrapper });
}

describe("useCorpMoney share price", () => {
  it("shows a pound price at face value before exchange rates load", () => {
    state.forexEnabled = false;
    const { result } = renderMoney();
    expect(result.current.currency.forexRates).toBeNull();
    expect(result.current.money.fmtPrice(59.56)).toBe("£59.56");
  });

  it("shows the same pound price once exchange rates are loaded", async () => {
    state.forexEnabled = true;
    const { result } = renderMoney();
    await waitFor(() => expect(result.current.currency.forexRates).not.toBeNull());
    expect(result.current.money.fmtPrice(59.56)).toBe("£59.56");
  });
});
