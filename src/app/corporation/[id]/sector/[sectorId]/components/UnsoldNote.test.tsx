/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import type { UnsoldReading } from "@/lib/corporations/rules/unsoldReason";
import UnsoldNote from "./UnsoldNote";

afterEach(cleanup);

function note(unsold: UnsoldReading): string {
  const { container } = render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <UnsoldNote unsold={unsold} label="Electricity" share="60%" money={(v) => `${v} JPY`} />
    </NextIntlClientProvider>
  );
  return container.querySelector("[data-unsold-reason]")?.textContent ?? "";
}

describe("UnsoldNote (#5450)", () => {
  it("names the share and the good, then the reason", () => {
    const text = note({
      reason: "ask_above_market",
      unsoldShare: 0.6,
      askUnitPrice: 12,
      marketUnitPrice: 10,
    });
    expect(text).toContain("60% of your Electricity went unsold last turn.");
    expect(text).toContain("You asked 12 JPY, but buyers in this market paid 10 JPY");
  });

  it("never turns an ask above market into the no-buyers sentence", () => {
    const text = note({
      reason: "ask_above_market",
      unsoldShare: 0.6,
      askUnitPrice: 12,
      marketUnitPrice: null,
    });
    expect(text).toContain("above what buyers in this market paid");
    expect(text).not.toContain("Nobody bought");
  });

  it("explains equal-price sharing", () => {
    expect(
      note({ reason: "shared_at_market", unsoldShare: 0.5, askUnitPrice: 10, marketUnitPrice: 10 })
    ).toContain("shared between every seller asking it");
  });

  it("explains exhausted buyers", () => {
    expect(
      note({ reason: "buyers_exhausted", unsoldShare: 0.3, askUnitPrice: 8, marketUnitPrice: 10 })
    ).toContain("already supplied");
  });

  it("says nobody bought, naming the good", () => {
    expect(
      note({ reason: "no_buyers", unsoldShare: 1, askUnitPrice: 10, marketUnitPrice: null })
    ).toContain("Nobody bought Electricity");
  });

  it("uses no em or en dashes in any sentence", () => {
    for (const reason of [
      "ask_above_market",
      "shared_at_market",
      "buyers_exhausted",
      "no_buyers",
    ] as const)
      expect(note({ reason, unsoldShare: 0.5, askUnitPrice: 12, marketUnitPrice: 10 })).not.toMatch(
        /[–—]/
      );
  });
});
