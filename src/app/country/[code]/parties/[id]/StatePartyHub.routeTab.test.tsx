/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StatePartyHub } from "./StatePartyHub";

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockParams,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));
vi.mock("@/components/party-hub/AgendaBannerWithEdit", () => ({
  AgendaBannerWithEdit: () => null,
}));
vi.mock("@/components/PartyLogo", () => ({ PartyLogo: () => null }));
vi.mock(
  "@/app/country/[code]/region/[id]/party/[partyId]/components/useStatePartyTreasuryActions",
  () => ({ useStatePartyTreasuryActions: () => ({}) })
);
vi.mock("@/app/country/[code]/region/[id]/party/[partyId]/components/useStatePartyData", () => ({
  useStatePartyData: () => ({
    user: { username: "admin", isAdmin: true, character: { id: "c1" } },
    stateParty: mockParty,
    currentTurn: 1,
    loading: false,
    loadError: false,
    fetchUser: vi.fn(),
    fetchStateParty: vi.fn(),
    taxRate: 0,
    setTaxRate: vi.fn(),
    gotvPercent: 0,
    setGotvPercent: vi.fn(),
    gotvCategory: "",
    setGotvCategory: vi.fn(),
    gotvGroup: "",
    setGotvGroup: vi.fn(),
    suppressionPercent: 0,
    setSuppressionPercent: vi.fn(),
    suppressionCategory: "",
    setSuppressionCategory: vi.fn(),
    suppressionGroup: "",
    setSuppressionGroup: vi.fn(),
    transferReserveAmount: 0,
    setTransferReserveAmount: vi.fn(),
    memberSupportReserveAmount: 0,
    setMemberSupportReserveAmount: vi.fn(),
    nppRecruitmentReserveAmount: 0,
    setNppRecruitmentReserveAmount: vi.fn(),
    treasuryPreset: "balanced",
    setTreasuryPreset: vi.fn(),
    psInvestmentBudget: 0,
    setPsInvestmentBudget: vi.fn(),
  }),
}));

let mockParams = new URLSearchParams("tab=elections");
let mockParty: Record<string, unknown> = {};

function makeParty() {
  return {
    partyId: "p1",
    partyName: "Test Party",
    partyAbbreviation: "TP",
    partyColor: "#123456",
    stateName: "Ohio",
    countryId: "US",
    stateId: "OH",
    memberCount: 3,
    organization: 10,
    treasury: 1000,
    politicalStrength: 5,
    effectivePsCap: 100,
    regimeStatus: null,
    partyLogoUrl: null,
    members: [],
  };
}

const scope = {
  kind: "state" as const,
  countryCode: "us",
  partyId: "p1",
  stateId: "OH",
  regionId: "OH",
};

function pressed(label: string) {
  return screen.getByRole("button", { name: label }).getAttribute("aria-pressed");
}

describe("StatePartyHub route tab", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 }))
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the clicked tab when the state party refetches", async () => {
    mockParams = new URLSearchParams("tab=elections");
    mockParty = makeParty();
    const { rerender } = render(<StatePartyHub scope={scope} />);
    await waitFor(() => expect(pressed("Elections")).toBe("true"));

    fireEvent.click(screen.getByRole("button", { name: "Treasury" }));
    expect(pressed("Treasury")).toBe("true");

    // A treasury save refetches the party: new object, same URL.
    mockParty = makeParty();
    rerender(<StatePartyHub scope={scope} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(pressed("Treasury")).toBe("true");
    expect(pressed("Elections")).toBe("false");
  });

  it("still follows a new tab in the URL", async () => {
    mockParams = new URLSearchParams("tab=elections");
    mockParty = makeParty();
    const { rerender } = render(<StatePartyHub scope={scope} />);
    await waitFor(() => expect(pressed("Elections")).toBe("true"));
    fireEvent.click(screen.getByRole("button", { name: "Treasury" }));

    mockParams = new URLSearchParams("tab=members");
    rerender(<StatePartyHub scope={scope} />);
    await waitFor(() => expect(pressed("Members (3)")).toBe("true"));
  });
});
