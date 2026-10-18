/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  OrganizationLegislation,
  ProposalVote,
} from "@/lib/db/types/internationalOrganization";
import type { OrgSummary } from "./orgTypes";
import { ProposalBallotCard } from "./ProposalBallotCard";

vi.mock("./useEntityName", () => ({ useEntityName: () => (id: string) => id }));
vi.mock("@/components/CountryFlag", () => ({ CountryFlag: () => null }));
afterEach(cleanup);

const member = (countryId: string, hasVote: boolean, hasPolicyVote: boolean) => ({
  countryId,
  hasVote,
  hasPolicyVote,
});
const members = [
  member("US", true, true),
  member("UK", true, true),
  member("FR", false, true),
  member("PL", false, false),
];
const vote = (countryId: string, vote: ProposalVote, castOnTurn: number) => ({
  countryId,
  vote,
  castOnTurn,
  castAt: new Date(castOnTurn * 1000),
  characterName: countryId,
});
const legislation = {
  _id: "resolution-id",
  type: "set_dues",
  votes: [
    vote("US", "yes", 1),
    vote("US", "no", 2),
    vote("UK", "yes", 1),
    vote("FR", "yes", 1),
    vote("PL", "yes", 1),
    vote("DE", "yes", 1),
  ],
} as unknown as OrganizationLegislation;

function show({
  type = "set_dues",
  viewerCountry = "US" as string | null,
  roll = members,
  onVote = vi.fn().mockResolvedValue(undefined),
}: {
  type?: OrganizationLegislation["type"];
  viewerCountry?: string | null;
  roll?: typeof members;
  onVote?: (id: string, vote: ProposalVote) => Promise<void>;
} = {}) {
  return render(
    <ProposalBallotCard
      org={{ members: roll } as unknown as OrgSummary}
      legislation={{ ...legislation, type }}
      viewerCountry={viewerCountry}
      electorate={type === "join_conflict" || type === "declare_war" ? "hasVote" : "hasPolicyVote"}
      turnsLeft={1}
      votingWindowTurns={24}
      onVote={onVote}
      progressClassName={
        type === "sanctions" ? "bg-error" : type === "aid_package" ? "bg-success" : "bg-primary"
      }
    >
      <h5>Panel-specific title</h5>
      <p>Panel-specific description</p>
    </ProposalBallotCard>
  );
}

describe("proposal ballot card", () => {
  it.each([
    "fund_agency",
    "aid_package",
    "directive",
    "set_dues",
    "joint_statement",
    "set_posture",
    "sanctions",
  ] as const)("counts the deduplicated policy electorate for %s", (type) => {
    const { container } = show({ type });
    expect(screen.getByText("2 / 3 members in favour, 2 needed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vote no" }).className).toContain("bg-error");
    expect(container.querySelector('[style="width: 100%;"]')).toBeTruthy();
    expect(screen.queryByText("PL")).toBeNull();
    expect(screen.queryByText("DE")).toBeNull();
    expect(screen.getAllByText("FR")[0]).toBeTruthy();
    expect(screen.getByText("23/24 turns")).toBeTruthy();
    expect(screen.getByText("Panel-specific description")).toBeTruthy();
  });

  it.each(["join_conflict", "declare_war"] as const)(
    "retains the smaller war electorate for %s",
    (type) => {
      const { container } = show({ type });
      expect(
        screen.getByText(
          type === "declare_war"
            ? "1 / 2 player nations in favour, unanimous player consent required"
            : "1 / 2 members in favour, unanimous consent required"
        )
      ).toBeTruthy();
      expect(container.querySelector('[style="width: 50%;"]')).toBeTruthy();
      expect(screen.queryByText("FR")).toBeNull();
    }
  );

  it.each([
    [null, "Only foreign ministers of member states may vote."],
    ["DE", "Only foreign ministers of member states may vote."],
    ["PL", "Your country holds no vote in this organization."],
  ])("disables votes for %s with the existing reason", (viewerCountry, reason) => {
    show({ viewerCountry });
    expect(screen.getByText(reason!)).toBeTruthy();
    for (const name of ["Vote yes", "Vote no", "Abstain"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it.each(["set_dues", "join_conflict", "declare_war"] as const)(
    "handles an empty electorate for %s",
    (type) => {
      const { container } = show({ type, roll: [] });
      expect(
        screen.getByText(
          type === "declare_war"
            ? "0 / 0 player nations in favour, no player nations hold a vote"
            : "0 / 0 members in favour, no members hold a vote"
        )
      ).toBeTruthy();
      expect(container.querySelector('[style="width: 0%;"]')).toBeTruthy();
    }
  );

  it.each([
    ["sanctions", "bg-error"],
    ["aid_package", "bg-success"],
  ] as const)("keeps the progress color for %s", (type, color) => {
    const { container } = show({ type });
    expect(container.querySelector("[style]")?.className).toContain(color);
  });

  it("forwards the resolution id and vote, displays a failure and allows retry", async () => {
    const onVote = vi
      .fn()
      .mockRejectedValueOnce(new Error("Vote refused"))
      .mockResolvedValueOnce(undefined);
    show({ onVote });
    fireEvent.click(screen.getByRole("button", { name: "Abstain" }));
    await waitFor(() => expect(screen.getByText(/Vote refused/)).toBeTruthy());
    expect(onVote).toHaveBeenCalledWith("resolution-id", "abstain");
    fireEvent.click(screen.getByRole("button", { name: "Vote yes" }));
    await waitFor(() => expect(onVote).toHaveBeenLastCalledWith("resolution-id", "yes"));
    await waitFor(() => expect(screen.queryByText(/Vote refused/)).toBeNull());
  });
});
