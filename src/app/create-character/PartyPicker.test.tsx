// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/parties.json";
import { PartyPicker } from "./PartyPicker";
import type { PartyOption } from "../register/components/registerTypes";

vi.mock("@/components/PartyLogo", () => ({ PartyLogo: () => null }));
afterEach(cleanup);

const party: PartyOption = {
  id: "7",
  name: "Test Party",
  abbreviation: "TP",
  color: "#123456",
  memberCount: 3,
  playerCount: 2,
  isDefault: true,
  organizationByRegion: { MB: 42.75, ON: 18.2 },
};

function picker(homeState: string, option = party) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <PartyPicker
        countryId="ca"
        homeState={homeState}
        value="7"
        onChange={() => {}}
        majorParties={[option]}
        communityParties={[{ ...option, id: "8", name: "Community Party" }]}
        position={{ economic: 0, social: 0 }}
      />
    </NextIntlClientProvider>
  );
}

describe("PartyPicker regional organization", () => {
  it("updates both party groups when the selected province changes and shows zero for absent rows", () => {
    const { rerender } = render(picker("MB"));
    expect(screen.getAllByText("Current Org: 42.8%")).toHaveLength(2);
    rerender(picker("ON"));
    expect(screen.getAllByText("Current Org: 18.2%")).toHaveLength(2);
    expect(screen.queryByText("Current Org: 42.8%")).toBeNull();
    rerender(picker("QC"));
    expect(screen.getAllByText("Current Org: 0.0%")).toHaveLength(2);
  });

  it("hides regional organization until a province is selected", () => {
    render(picker(""));
    expect(screen.queryByText(/Current Org:/)).toBeNull();
  });

  it("distinguishes unavailable organization data from a known zero", () => {
    render(picker("MB", { ...party, organizationByRegion: undefined }));
    expect(screen.getAllByText("Current Org: unavailable")).toHaveLength(2);
    expect(screen.queryByText("Current Org: 0.0%")).toBeNull();
  });
});
