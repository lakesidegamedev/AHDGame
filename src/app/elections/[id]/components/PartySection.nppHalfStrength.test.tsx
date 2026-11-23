/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartySection } from "./ElectionDetailComponents";
import type { CandidateDetail, PartyGroup } from "./ElectionDetailTypes";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/Avatar", () => ({ Avatar: () => <span /> }));
vi.mock("@/components/PartyLogo", () => ({ PartyLogo: () => <span /> }));
vi.mock("@/components/elections/NppAbbr", () => ({ NppAbbr: () => <span>NPP</span> }));
vi.mock("@/components/elections/admin/RemoveCandidateButton", () => ({
  RemoveCandidateButton: () => null,
}));
vi.mock("@/components/elections/EndorsementBadges", () => ({ EndorsementBadges: () => null }));
vi.mock("./ElectionDetailCharts", () => ({ PrimaryLineGraph: () => null }));

function candidate(over: Partial<CandidateDetail>): CandidateDetail {
  return {
    id: "c",
    characterId: "ch",
    characterName: "Name",
    party: "p",
    partyName: "Party",
    partyColor: "#123456",
    partyEcon: 0,
    partySocial: 0,
    isNPP: false,
    nppId: null,
    economicPosition: 0,
    socialPosition: 0,
    favorability: 50,
    politicalInfluence: 10,
    nationalInfluence: 10,
    primaryScore: 50,
    sharePct: 50,
    enteredAt: "2026-01-01",
    endorsements: [],
    isYou: false,
    ...over,
  } as CandidateDetail;
}

function group(candidates: CandidateDetail[]): PartyGroup {
  return {
    partyId: "p",
    partyName: "Party",
    partyColor: "#123456",
    countryId: "US",
    partyEcon: 0,
    partySocial: 0,
    hasCompetitivePrimary: true,
    candidates,
    primaryShareBasis: "estimate",
  } as PartyGroup;
}

describe("PartySection non-player half strength", () => {
  it("explains the halved score on the NPP row when a player is in the primary", () => {
    render(
      <PartySection
        group={group([
          candidate({ id: "a", characterName: "Daniel", sharePct: 93.9 }),
          candidate({ id: "b", characterName: "Charles Friedman", isNPP: true, nppId: "n", sharePct: 6.1 }),
        ])}
        inPrimary
        snapshots={[]}
      />
    );
    expect(screen.getAllByText(/Non-player candidate: half strength against a player/)).toHaveLength(1);
  });

  it("stays quiet when every candidate is a non-player", () => {
    render(
      <PartySection
        group={group([
          candidate({ id: "a", isNPP: true, nppId: "n1" }),
          candidate({ id: "b", isNPP: true, nppId: "n2" }),
        ])}
        inPrimary
        snapshots={[]}
      />
    );
    expect(screen.queryByText(/half strength against a player/)).toBeNull();
  });
});
