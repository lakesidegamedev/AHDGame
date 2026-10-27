/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/layout.json";
import { NationalPartyBillActionClient } from "./NationalPartyBillActionClient";
const mocks = vi.hoisted(() => ({ composer: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: vi.fn() }));
vi.mock("next/dynamic", () => ({
  default: () => (props: unknown) => {
    mocks.composer(props);
    return <div>National composer</div>;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("National party chair proposal action", () => {
  function show(blocked = false) {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NationalPartyBillActionClient countryId="US" initialChamber="house" blocked={blocked} />
      </NextIntlClientProvider>
    );
  }
  it("opens an automatic national party-NPP proposal without chamber selection", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Propose through party legislator" }));
    expect(mocks.composer).toHaveBeenCalledWith(
      expect.objectContaining({
        proposeViaPartyNpp: true,
        chambers: [],
        defaultChamber: "house",
        countryId: "US",
      })
    );
  });
  it("disables a second proposal when the party has an in-flight NPP bill", () => {
    show(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Propose through party legislator",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(mocks.composer).not.toHaveBeenCalled();
  });
});
