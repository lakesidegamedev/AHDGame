import { ObjectId, type Db } from "mongodb";
import type { Character, Election, ElectionVoteTally } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { officeKeyForElectionType } from "@/lib/utils/electionLabels";
import { impeachmentFilingWindow } from "./rules/filingWindow";
import { electionsCollection } from "@/lib/db/repositories/elections";

/** Career entries identify actual wins, including each consecutive term, not candidacies. */
export async function loadImpeachmentFilingWindow(
  db: Db,
  target: Pick<Character, "careerHistory">,
  countryId: CountryId,
  office: "president" | "governor",
  state: string | undefined,
  currentTurn: number
) {
  const ids = [
    ...new Set(
      (target.careerHistory ?? [])
        .filter(
          (event) =>
            event.type === "elected" &&
            event.office?.type === office &&
            event.electionId &&
            ObjectId.isValid(event.electionId)
        )
        .map((event) => event.electionId!)
    ),
  ].map((id) => new ObjectId(id));
  if (!ids.length) return impeachmentFilingWindow(currentTurn, []);
  const elections = await electionsCollection(db)
    .find(
      {
        _id: { $in: ids },
        countryId,
        status: { $in: ["completed", "resolved"] },
        ...(office === "governor" ? { state } : {}),
      },
      { projection: { _id: 1, electionType: 1, endTurn: 1 } }
    )
    .toArray();
  const relevant = elections.filter(
    (election) => officeKeyForElectionType(election.electionType, countryId) === office
  );
  if (!relevant.length) return impeachmentFilingWindow(currentTurn, []);
  const tallies = await db
    .collection<ElectionVoteTally>("electionVoteTallies")
    .find(
      { electionId: { $in: relevant.map((election) => election._id) } },
      { projection: { electionId: 1, resolvedAtTurn: 1 } }
    )
    .toArray();
  const resolved = new Map(
    tallies.map((tally) => [tally.electionId.toString(), tally.resolvedAtTurn])
  );
  return impeachmentFilingWindow(
    currentTurn,
    relevant.flatMap((election) => {
      const turn = resolved.get(election._id.toString()) ?? election.endTurn;
      return typeof turn === "number" ? [turn] : [];
    })
  );
}
