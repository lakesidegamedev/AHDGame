/**
 * Player-facing copy for a National Committee vote to remove a party office
 * holder. Labels arrive already resolved for the party's country and titles.
 */

export type RemovableOfficeRole =
  "chair" | "viceChair" | "treasurer" | "committeeMember" | "campaigner";

export interface OfficeRemovalNotice {
  title: string;
  message: string;
}

export interface RemovalVoteOpenedInput {
  partyName: string;
  roleLabel: string;
  committeeLabel: string;
  yesNeeded: number;
  eligibleVoters: number;
  expiresAtTurn: number;
}

export function removalVoteOpenedNotice(input: RemovalVoteOpenedInput): OfficeRemovalNotice {
  const { partyName, roleLabel, committeeLabel, yesNeeded, eligibleVoters, expiresAtTurn } = input;
  return {
    title: `Vote to remove you as ${roleLabel}`,
    message:
      `The ${partyName} ${committeeLabel} has opened a vote to remove you as ${roleLabel}. ` +
      `It passes with ${yesNeeded} yes ${yesNeeded === 1 ? "vote" : "votes"} from ` +
      `${eligibleVoters} eligible ${eligibleVoters === 1 ? "voter" : "voters"} and closes at turn ` +
      `${expiresAtTurn}. You cannot vote on your own removal. Ask members of the committee ` +
      `to vote no on the party page.`,
  };
}

export interface RemovedByCommitteeInput {
  partyName: string;
  role: RemovableOfficeRole;
  roleLabel: string;
  committeeLabel: string;
}

function whatHappensNext(role: RemovableOfficeRole, committeeLabel: string): string {
  if (role === "committeeMember") {
    return `You can stand again at the next ${committeeLabel} election.`;
  }
  if (role === "campaigner") return "The chair can nominate you again.";
  return "The seat stays empty until the next leadership election, where you can stand again.";
}

export function removedByCommitteeNotice(input: RemovedByCommitteeInput): OfficeRemovalNotice {
  const { partyName, role, roleLabel, committeeLabel } = input;
  const removedFrom = role === "committeeMember" ? `from the ${committeeLabel}` : `as ${roleLabel}`;
  return {
    title: `Removed ${removedFrom} by committee vote`,
    message:
      `The ${partyName} ${committeeLabel} voted to remove you ${removedFrom}. ` +
      whatHappensNext(role, committeeLabel),
  };
}

export interface ActingChairInput {
  partyName: string;
  chairLabel: string;
  viceChairLabel: string;
  committeeLabel: string;
}

export function actingChairNotice(input: ActingChairInput): OfficeRemovalNotice {
  const { partyName, chairLabel, viceChairLabel, committeeLabel } = input;
  return {
    title: `You are now acting ${chairLabel}`,
    message:
      `The ${partyName} ${committeeLabel} voted to remove the ${chairLabel}. As ` +
      `${viceChairLabel} you hold the chair's powers until a new ${chairLabel} is elected.`,
  };
}
