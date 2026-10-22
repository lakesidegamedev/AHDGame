/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import CeoGovernancePanel from "./CeoGovernancePanel";
import type { CorporationDetail } from "../CorporationPageTypes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `$${n}`,
    formatFull: (n: number) => `$${n}`,
    toInternalFrom: (n: number) => n,
  }),
}));
vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) => id,
  useEnabledCountries: () => [],
}));
vi.mock("@/components/MailComposerModal", () => ({ MailComposerModal: () => null }));
vi.mock("@/components/time/LocalTime", () => ({ LocalTime: () => null }));
vi.mock("../CorporationStructureActions", () => ({ CorporationStructureActions: () => null }));
vi.mock("./CaretakerCeoCard", () => ({ CaretakerCeoCard: () => null }));
vi.mock("./SuperShareAdoptionCard", () => ({ SuperShareAdoptionCard: () => null }));
vi.mock("./TickerChangeCard", () => ({ TickerChangeCard: () => null }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const corporation = {
  _id: "c1",
  name: "Keystone",
  countryId: "US",
  type: "energy",
  isPrivate: true,
  liquidCurrencyCode: "USD",
  headquartersState: "PA",
} as unknown as CorporationDetail;

describe("CeoGovernancePanel", () => {
  it("leave or close holds resign and dissolve", () => {
    render(<CeoGovernancePanel corporation={corporation} corpId="7" onRefresh={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Leave or close" });
    expect(within(group).getByRole("button", { name: "Resign: Resign as CEO" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Dissolve: Dissolve" })).toBeTruthy();
    // Private: dissolving winds the corporation up at once.
    expect(
      within(group).getByText("Wind up the corporation and pay out shareholders. Cannot be undone.")
    ).toBeTruthy();
  });
});
