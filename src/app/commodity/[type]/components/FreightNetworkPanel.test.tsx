/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FreightNetworkPanel from "./FreightNetworkPanel";
import type { CommodityDetail } from "../types";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/corporations.json";

describe("FreightNetworkPanel", () => {
  it("compares one-hop full-capacity estimates with observed load and all-state supply", () => {
    const data = {
      stateCountryMap: { CA: "US", NY: "US" },
      freightNetwork: {
        turn: 42,
        states: {
          CA: { fullCapacityOneHopEstimate: 250, observedLoad: 80, capacity: 100 },
          NY: { fullCapacityOneHopEstimate: null, observedLoad: 10, capacity: 200 },
        },
      },
    } as unknown as CommodityDetail;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FreightNetworkPanel data={data} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("Freight by state")).toBeTruthy();
    expect(screen.getByText(/turn 42/)).toBeTruthy();
    expect(screen.getAllByText("250 TEU/day")).toHaveLength(2);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Known-state estimate subtotal")).toBeTruthy();
    expect(screen.getByText(/Local sales use no freight; longer routes use more/)).toBeTruthy();
  });
});
