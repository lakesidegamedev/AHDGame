export interface ClosedNominationInput {
  positionId: string;
  nomineeCharacterName: string;
  status: string;
  votesFor: number;
  votesAgainst: number;
  votingEndsOnTurn?: number | null;
  proposedAt: Date;
}

export interface LastNominationOutcome {
  nomineeName: string;
  status: "rejected" | "withdrawn";
  votesFor: number;
  votesAgainst: number;
  /** Turn voting closed on, when the nomination reached a vote. */
  turn: number | null;
  /** Earlier nominations for the same seat that were withdrawn. */
  earlierWithdrawn: number;
}

/**
 * Most recent closed nomination for each seat, with a count of the earlier
 * withdrawn ones, so a vacant seat can say why it is still vacant.
 */
export function lastNominationOutcomes(
  closed: readonly ClosedNominationInput[]
): Map<string, LastNominationOutcome> {
  const byPosition = new Map<string, ClosedNominationInput[]>();
  for (const nomination of closed) {
    if (nomination.status !== "rejected" && nomination.status !== "withdrawn") continue;
    const list = byPosition.get(nomination.positionId) ?? [];
    list.push(nomination);
    byPosition.set(nomination.positionId, list);
  }
  const result = new Map<string, LastNominationOutcome>();
  for (const [positionId, list] of byPosition) {
    list.sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime());
    const [latest, ...earlier] = list;
    result.set(positionId, {
      nomineeName: latest.nomineeCharacterName,
      status: latest.status as "rejected" | "withdrawn",
      votesFor: latest.votesFor,
      votesAgainst: latest.votesAgainst,
      turn: latest.votingEndsOnTurn ?? null,
      earlierWithdrawn: earlier.filter((n) => n.status === "withdrawn").length,
    });
  }
  return result;
}

export function describeLastNomination(outcome: LastNominationOutcome): string {
  const earlier =
    outcome.earlierWithdrawn > 0
      ? ` ${outcome.earlierWithdrawn} earlier nomination${outcome.earlierWithdrawn === 1 ? " was" : "s were"} withdrawn when a new one was filed.`
      : "";
  if (outcome.status === "withdrawn") {
    return `Last nominee ${outcome.nomineeName} was withdrawn.${earlier}`;
  }
  const turn = outcome.turn != null ? `, turn ${outcome.turn}` : "";
  return `Last nominee ${outcome.nomineeName} rejected by the Senate ${outcome.votesFor} to ${outcome.votesAgainst}${turn}.${earlier}`;
}
