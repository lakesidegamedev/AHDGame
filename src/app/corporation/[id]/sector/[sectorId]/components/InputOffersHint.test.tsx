/**
 * @vitest-environment happy-dom
 */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import InputOffersHint from "./InputOffersHint";
import type { CommodityFlow } from "../types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flow = { commodity: "energy", label: "Energy" } as CommodityFlow;
const respond = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

it("links to the offers view with the number of other corporations selling", async () => {
  respond({
    enabled: true,
    offers: [
      { side: "sell", own: false },
      { side: "sell", own: false },
      { side: "sell", own: true },
      { side: "buy", own: false },
    ],
  });
  render(<InputOffersHint flow={flow} />);
  const link = await waitFor(() => screen.getByText("2 sellers offering"));
  expect(link.getAttribute("href")).toBe("/commodity/energy/offers");
});

it("renders nothing when nobody is selling or the feature is off", async () => {
  respond({ enabled: false, offers: [] });
  const { container } = render(<InputOffersHint flow={flow} />);
  await Promise.resolve();
  expect(container.textContent).toBe("");
});

it("says so when a short input has no offers in the sector's state", async () => {
  respond({
    enabled: true,
    offers: [
      { side: "sell", own: false, stateId: "TX" },
      { side: "sell", own: false, stateId: "OH" },
    ],
  });
  render(
    <InputOffersHint
      flow={{ commodity: "freight", label: "Freight" } as CommodityFlow}
      variant="short"
      stateId="CT"
      stateName="Connecticut"
    />
  );
  await waitFor(() => screen.getByText(/No offers for Freight in Connecticut/));
  expect(screen.getByText("2 elsewhere on the market")).toBeTruthy();
});

it("keeps the seller link when a short input has offers in its state", async () => {
  respond({ enabled: true, offers: [{ side: "sell", own: false, stateId: "CT" }] });
  render(
    <InputOffersHint
      flow={{ commodity: "freight", label: "Freight" } as CommodityFlow}
      variant="short"
      stateId="CT"
      stateName="Connecticut"
    />
  );
  await waitFor(() => screen.getByText("1 seller offering"));
});
