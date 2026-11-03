/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProposalCard } from "./ProposalCard";
import { requiredYesVotes } from "@/lib/parties/proposalConstants";
import type { ProposalView } from "@/lib/parties/dto/partyView";

afterEach(cleanup);

const proposal: ProposalView = {
  id: "rename-1",
  type: "rename",
  status: "open",
  proposedBy: "chair",
  proposedByName: "Chair",
  createdAtTurn: 1,
  expiresAtTurn: 25,
  rename: { newName: "New", newAbbreviation: "N" },
  proposingVoteSummary: { yes: 3, no: 1, notVoted: 1, yesNeeded: 3 },
};

describe("committee proposal pass threshold", () => {
  it("rounds 60% of filled seats up", () => {
    expect([1, 2, 3, 5, 6, 10].map(requiredYesVotes)).toEqual([1, 2, 2, 3, 4, 6]);
  });

  it("tells voters how many yes votes are needed and that non-voters count as no", () => {
    render(
      <ProposalCard
        proposal={proposal}
        country="UK"
        partyId="1"
        canVote={false}
        votingSide={null}
        onVoted={() => {}}
      />
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("3 yes votes needed to pass (60% of 5 seats)");
    expect(text).toContain("count as no");
    expect(text).toContain("AI-held seats never vote");
  });
});
