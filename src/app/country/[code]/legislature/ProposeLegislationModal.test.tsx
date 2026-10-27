/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/layout.json";
import { ProposeLegislationModal } from "./ProposeLegislationModal";
vi.mock("@/hooks/useWorldFlags", () => ({
  useWorldFlags: () => ({
    loaded: true,
    failed: false,
    resetSystemVersions: { legislation: "v2" },
    resetV2Countries: ["US", "UK", "JP"],
  }),
}));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Japan national MP and admin subsidy access", () => {
  it.each([false, true])(
    "offers grant and withdrawal in the MP composer (admin=%s)",
    async (adminOverride) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => ({
          ok: true,
          json: async () =>
            String(url).includes("reset-legislation")
              ? { families: [], taxes: [], metrics: [] }
              : [],
        }))
      );
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ProposeLegislationModal
            countryId="JP"
            adminOverride={adminOverride}
            chambers={[{ value: "sangiin", label: "House of Councillors" }]}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </NextIntlClientProvider>
      );
      const select = await screen.findByLabelText("Policy domain");
      expect(await screen.findByRole("option", { name: "Subsidies" })).toBeTruthy();
      fireEvent.change(select, { target: { value: "Subsidies" } });
      expect(screen.getByRole("button", { name: /Grant a subsidy/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /End a subsidy/ })).toBeTruthy();
    }
  );
});
