// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en/corporations.json";
import { SupplyOfferBoard } from "./SupplyOfferBoard";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("hands a selected public offer to negotiation without taking it", async () => {
  const listing = {
    id: "other:0",
    corporationId: "other",
    corporationName: "Other Co",
    slot: 0,
    own: false,
    side: "sell",
    commodity: "energy",
    volumeCap: 123,
    pricePremium: 0.05,
    expiresAtTurn: 200,
  };
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ listings: [listing], ownListings: [], hasMore: false }),
  });
  vi.stubGlobal("fetch", fetcher);
  const respond = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SupplyOfferBoard corpId="self" onRespond={respond} />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(screen.getByText("Negotiate")).toBeTruthy());
  fireEvent.click(screen.getByText("Negotiate"));
  expect(respond).toHaveBeenCalledWith(listing);
  expect(fetcher.mock.calls.every((call) => call[1]?.method !== "POST")).toBe(true);
});
it("publishes an offer in an unused slot and exposes failures", async () => {
  const fetcher = vi.fn().mockImplementation(async (_url, options) =>
    options?.method === "POST"
      ? { ok: false, json: async () => ({ error: "Offer rejected" }) }
      : {
          ok: true,
          json: async () => ({
            listings: [],
            ownListings: [{ id: "self:0", slot: 0, side: "sell", commodity: "energy" }],
            hasMore: false,
          }),
        }
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SupplyOfferBoard corpId="self" onRespond={vi.fn()} />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(screen.queryByText("Loading offers...")).toBeNull());
  fireEvent.click(screen.getByText("Post an offer"));
  fireEvent.change(screen.getByLabelText(/Quantity per day/), { target: { value: "50" } });
  fireEvent.click(screen.getByText("Publish offer"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Offer rejected"));
  const call = fetcher.mock.calls.find((call) => call[1]?.method === "POST");
  expect(JSON.parse(call![1].body)).toMatchObject({ action: "publish", slot: 1, volumeCap: 50 });
});
it("takes a listed offer for a chosen quantity", async () => {
  const listing = {
    id: "other:0",
    corporationId: "other",
    corporationName: "Other Co",
    corporationCountryId: "US",
    creditRating: "AA",
    slot: 0,
    own: false,
    side: "sell",
    commodity: "energy",
    volumeCap: 100,
    pricePremium: 0.05,
    expiresAtTurn: 200,
  };
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url, options) =>
      options?.method === "POST"
        ? { ok: true, json: async () => ({ success: true }) }
        : { ok: true, json: async () => ({ listings: [listing], ownListings: [], hasMore: false }) }
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SupplyOfferBoard corpId="self" onRespond={vi.fn()} />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(screen.getByText("US · rating AA")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Quantity to take"), { target: { value: "40" } });
  fireEvent.click(screen.getByText("Take offer"));
  expect(fetcher.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
  expect(screen.getByText(/binding agreement to buy 40 MWh per day from Other Co/)).toBeTruthy();
  fireEvent.click(screen.getByText("Confirm agreement"));
  await waitFor(() =>
    expect(screen.getByText("Agreement started. It is active now.")).toBeTruthy()
  );
  const call = fetcher.mock.calls.find((c) => c[1]?.method === "POST");
  expect(call![0]).toBe("/api/corporations/self/supply-listings/take");
  expect(JSON.parse(call![1].body)).toEqual({ listingId: "other:0", volume: 40 });
});
it("explains an offer this corporation could never receive and hides its take controls", async () => {
  const reason =
    "Real estate services only reaches plants in the same state. Your corporation has no active plant in DC that uses it, so this contract could never deliver.";
  const listing = {
    id: "other:0",
    corporationId: "other",
    corporationName: "Other Co",
    slot: 0,
    own: false,
    side: "sell",
    commodity: "real_estate_services",
    stateId: "DC",
    volumeCap: 30,
    pricePremium: 0,
    expiresAtTurn: 200,
    unreachableReason: reason,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ listings: [listing], ownListings: [], hasMore: false }),
    })
  );
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SupplyOfferBoard corpId="self" onRespond={vi.fn()} />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(screen.getByText(reason)).toBeTruthy());
  expect(screen.queryByText("Take offer")).toBeNull();
  expect(screen.queryByText("Negotiate")).toBeNull();
});

it("lists usable offers first, groups unusable ones in a collapsed section and sizes oversize buys", async () => {
  const base = { corporationId: "other", slot: 0, own: false, side: "sell", pricePremium: 0 };
  const unusable = {
    ...base,
    id: "a:0",
    corporationName: "Unusable Co",
    commodity: "software_it_services",
    volumeCap: 10,
    expiresAtTurn: 200,
    unreachableReason:
      "You could not receive Software & IT Services, none of your active plants use it.",
  };
  const big = {
    ...base,
    id: "b:0",
    corporationName: "Big Co",
    commodity: "energy",
    volumeCap: 405,
    expiresAtTurn: 200,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith("/commodities")
          ? { commodities: [{ commodity: "energy", consumptionUnits: 84 }] }
          : { listings: [unusable, big], ownListings: [], hasMore: false },
    }))
  );
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SupplyOfferBoard corpId="self" onRespond={vi.fn()} />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(screen.getByText(/About 4.8x your daily use/)).toBeTruthy());
  const group = container.querySelector("details")!;
  expect(group.open).toBe(false);
  expect(group.textContent).toContain("Offers you cannot use (1)");
  expect(group.textContent).toContain("none of your active plants use it");
  expect(group.textContent).not.toContain("Big Co");
  expect(container.textContent!.indexOf("Big Co")).toBeLessThan(
    container.textContent!.indexOf("Unusable Co")
  );
});
