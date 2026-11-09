// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en/corporations.json";
import InternalSupplyPanel from "./InternalSupplyPanel";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const view = {
  policy: { priority: "market", discount: 0 },
  effectivePolicy: { priority: "market", discount: 0 },
  inherited: false,
  parentId: null,
  available: true,
  lastTurn: 12,
  received: { iron: 30 },
  reserved: {},
  discountCostAnchor: -20,
};
const fetcher = vi.fn();
beforeEach(() => {
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValue({ ok: true, json: async () => view });
});
function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InternalSupplyPanel corpId="12" />
    </NextIntlClientProvider>
  );
}
it("saves funded market pricing and its selected discount even under market priority", async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ ...view, fundedMarket: true }) });
  show();
  await screen.findByLabelText("Internal transfer price");
  expect(screen.getByLabelText("Internal transfer price")).toHaveProperty("value", "free");
  fireEvent.change(screen.getByLabelText("Internal transfer price"), {
    target: { value: "market" },
  });
  fireEvent.change(screen.getByLabelText("Internal discount"), { target: { value: "0.15" } });
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      policy: { priority: "market", discount: 0.15, transferPricing: "market" },
    }),
  });
  fireEvent.click(screen.getByText("Save policy"));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/corporations/12/internal-supply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ priority: "market", discount: 0.15, transferPricing: "market" }),
      })
    )
  );
});
it("loads the saved policy, explains physical limits quietly and displays actual delivery", async () => {
  show();
  await screen.findByText("Reserved supply, turn 12");
  expect(screen.getByLabelText("Supply priority")).toHaveProperty("value", "market");
  expect(screen.getByText("iron")).toBeTruthy();
  expect(screen.getByText("Net internal discount credit: ₳20 per day.")).toBeTruthy();
  expect(screen.getByText("How priority and pricing work").closest("details")?.open).toBe(false);
  expect(screen.getByText("Save policy")).toHaveProperty("disabled", true);
});
it("labels the discount as a reduction from market price", async () => {
  show();
  await screen.findByText("Reserved supply, turn 12");
  expect(screen.getByRole("option", { name: "15% below market" })).toHaveProperty("value", "0.15");
  expect(screen.getByRole("option", { name: "0% below market" })).toHaveProperty("value", "0");
});
it("sends the selected priority and discount then confirms next-turn timing", async () => {
  show();
  await screen.findByText("Reserved supply, turn 12");
  fireEvent.change(screen.getByLabelText("Supply priority"), { target: { value: "group" } });
  fireEvent.change(screen.getByLabelText("Internal discount"), { target: { value: "0.1" } });
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ policy: { priority: "group", discount: 0.1 } }),
  });
  fireEvent.click(screen.getByText("Save policy"));
  await screen.findByText("Policy saved. New reservations and discounts apply next turn.");
  expect(fetcher.mock.calls[1]?.[1].body).toBe(
    JSON.stringify({ priority: "group", discount: 0.1 })
  );
  expect(screen.getByText("Save policy")).toHaveProperty("disabled", true);
});
it("preserves the draft after an unsuccessful save and never claims success", async () => {
  show();
  await screen.findByText("Reserved supply, turn 12");
  fireEvent.change(screen.getByLabelText("Supply priority"), { target: { value: "own" } });
  fetcher.mockRejectedValueOnce(new Error("Connection lost"));
  fireEvent.click(screen.getByText("Save policy"));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Supply priority")).toHaveProperty("value", "own");
  expect(
    screen.queryByText("Policy saved. New reservations and discounts apply next turn.")
  ).toBeNull();
});
it("reloads persisted selection on remount", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({ ...view, policy: { priority: "own", discount: 0.1 } }),
  });
  const first = show();
  await screen.findByText("Reserved supply, turn 12");
  first.unmount();
  show();
  await screen.findByText("Reserved supply, turn 12");
  expect(screen.getByLabelText("Supply priority")).toHaveProperty("value", "own");
  expect(screen.getByLabelText("Internal discount")).toHaveProperty("value", "0.1");
});
it("makes the inherited group policy read-only and links to its parent", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...view,
      inherited: true,
      parentId: "parent",
      effectivePolicy: { priority: "group", discount: 0.15 },
    }),
  });
  show();
  await screen.findByText("Open parent operations");
  expect(screen.getByLabelText("Supply priority")).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("Internal discount")).toHaveProperty("value", "0.15");
});
it("can retry a failed load", async () => {
  fetcher.mockRejectedValueOnce(new Error("Offline"));
  show();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Retry"));
  await waitFor(() => expect(screen.getByText("Reserved supply, turn 12")).toBeTruthy());
});

it("explains why internal priority is disabled during Group coordination", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({ ...view, available: false, groupCoordinationActive: true }),
  });
  show();
  await screen.findByText(/Subsidiary Group coordination is active/);
  expect(screen.getByLabelText("Supply priority")).toHaveProperty("disabled", true);
});

it("saves the cross-state opt-in and shows freight separately from discounts", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...view,
      policy: { priority: "own", discount: 0.1 },
      ownHaulTurn: 13,
      ownHauls: [
        {
          commodity: "coal",
          originStateId: "IL",
          destStateId: "CA",
          units: 20,
          freightPerUnitAnchor: 5,
        },
      ],
    }),
  });
  show();
  await screen.findByText("Own cross-state hauls, turn 13");
  expect(
    screen.getByText("coal: IL to CA, 20 units; freight ₳5 per unit (anchor currency).")
  ).toBeTruthy();
  const toggle = screen.getByLabelText(
    "Ship eligible surplus to out-of-state plants before local market buyers"
  );
  expect(toggle).toHaveProperty("checked", false);
  fireEvent.click(toggle);
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ policy: { priority: "own", discount: 0.1, ownFirstAcrossStates: true } }),
  });
  fireEvent.click(screen.getByText("Save policy"));
  await screen.findByText("Policy saved. New reservations and discounts apply next turn.");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).ownFirstAcrossStates).toBe(true);
});
it("hides the discount controls and explains the free transfer on funded worlds", async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ ...view, fundedMarket: true }) });
  show();
  // Funded worlds report what own sites were sent, not the legacy reservation.
  await screen.findByText("Sent to your own sites, turn 12");
  expect(screen.queryByLabelText("Internal discount")).toBeNull();
  expect(screen.queryByText("Net internal discount credit: ₳20 per day.")).toBeNull();
  expect(
    screen.getByText(
      "Output sent to your own plants is a free transfer: your plants get it at no cost and this plant books no revenue for it."
    )
  ).toBeTruthy();
  expect(screen.getByLabelText("Supply priority")).toBeTruthy();
});
it("keeps the discount controls and no free-transfer note on legacy worlds", async () => {
  show();
  await screen.findByText("Reserved supply, turn 12");
  expect(screen.getByLabelText("Internal discount")).toBeTruthy();
  expect(screen.queryByText(/free transfer/)).toBeNull();
});
it("in a funded world shows what own sites were sent and describes the real priority", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...view,
      policy: { priority: "own", discount: 0 },
      effectivePolicy: { priority: "own", discount: 0 },
      fundedMarket: true,
      lastTurn: 20,
      received: {},
      ownSites: {
        turn: 20,
        rows: [
          { commodity: "energy", madeUnits: 240, ownSiteUnits: 200, soldUnits: 40, valueAnchor: 9 },
        ],
      },
    }),
  });
  show();
  await screen.findByText("Sent to your own sites, turn 20");
  expect(screen.getByLabelText("Supply priority")).toHaveProperty("value", "own");
  expect(screen.getByRole("option", { name: "Own sites first (default)" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Open market first" })).toBeTruthy();
  expect(screen.getByText("energy")).toBeTruthy();
  expect(screen.getByText("200")).toBeTruthy();
  expect(screen.queryByText(/No internal units were reserved/)).toBeNull();
  expect(screen.queryByText(/Ship eligible surplus/)).toBeNull();
  expect(screen.getByText(/outside buyers get your output first/)).toBeTruthy();
});
it("in a funded world says plainly when nothing went to own sites", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...view,
      fundedMarket: true,
      lastTurn: 20,
      ownSites: { turn: 20, rows: [] },
    }),
  });
  show();
  await screen.findByText(/None of your output went to your own sites last turn/);
});

it("exposes the section anchor the CEO Office nav links to", async () => {
  const { container } = show();
  await screen.findByText("Reserved supply, turn 12");
  expect(container.querySelector("#ceo-internal-supply")).toBeTruthy();
});
