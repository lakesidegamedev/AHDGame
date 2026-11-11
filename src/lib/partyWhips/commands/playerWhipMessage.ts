import { ObjectId, type Db } from "mongodb";
import type { Bill, PlayerWhipMode } from "@/lib/db/types";
import { billsCollection } from "@/lib/db/repositories/bills";

/**
 * Build mail subject + body for a Player Whip notification based on target type.
 * Used by the character-audience branch to tell each whipped player what to do.
 */
export async function buildPlayerWhipMessage(
  db: Db,
  targetType: string,
  targetId: ObjectId | string,
  direction: "for" | "against",
  mode: PlayerWhipMode
): Promise<{ subject: string; body: string; notificationTitle: string }> {
  const dir = direction === "for" ? "AYE" : "NAY";
  const isSoft = mode === "soft";
  const notificationTitle = isSoft ? "Party vote recommendation" : "You have been whipped";
  if (targetType === "bill") {
    if (!(targetId instanceof ObjectId)) {
      return {
        subject: isSoft
          ? `Party suggestion: Vote ${dir} on a bill`
          : `Party Whip: Vote ${dir} on a bill`,
        body: isSoft
          ? `Your national party suggests that you vote ${dir} on a bill. Review the bill page if you want to follow the recommendation.`
          : `Your national party has whipped you to vote ${dir} on a bill. You may change your vote at any time by visiting the bill's voting page.`,
        notificationTitle,
      };
    }
    const bill = await billsCollection(db)
      .findOne({ _id: targetId }, { projection: { title: 1 } });
    const title = bill?.title ?? "a bill";
    return {
      subject: isSoft
        ? `Party suggestion: Vote ${dir} on "${title}"`
        : `Party Whip: Vote ${dir} on "${title}"`,
      body: isSoft
        ? `Your national party suggests that you vote ${dir} on "${title}". Review the bill page if you want to follow the recommendation.`
        : `Your national party has whipped you to vote ${dir} on "${title}". You may change your vote at any time by visiting the bill's voting page.`,
      notificationTitle,
    };
  }
  if (targetType === "pmAppointmentVote") {
    return {
      subject: isSoft
        ? `Party suggestion: Vote ${dir} on PM appointment`
        : `Party Whip: Vote ${dir} on PM appointment`,
      body: isSoft
        ? `Your national party suggests that you vote ${dir} on the PM appointment vote.`
        : `Your national party has whipped you to vote ${dir} on the PM appointment vote. You may change your vote at any time.`,
      notificationTitle,
    };
  }
  if (targetType === "noConfidenceVote") {
    return {
      subject: isSoft
        ? `Party suggestion: Vote ${dir} on no-confidence motion`
        : `Party Whip: Vote ${dir} on no-confidence motion`,
      body: isSoft
        ? `Your national party suggests that you vote ${dir} on the no-confidence motion.`
        : `Your national party has whipped you to vote ${dir} on the no-confidence motion. You may change your vote at any time.`,
      notificationTitle,
    };
  }
  if (targetType === "speakerVacateMotion") {
    // Name the action rather than the ballot value: "AYE" on a motion to vacate
    // reads as ambiguous, whereas vacating or keeping the chair does not.
    const action = direction === "for" ? "vacate the chair" : "keep the Speaker";
    return {
      subject: isSoft ? `Party suggestion: Vote to ${action}` : `Party Whip: Vote to ${action}`,
      body: isSoft
        ? `Your national party suggests that you vote to ${action} on the motion to vacate.`
        : `Your national party has whipped you to vote to ${action} on the motion to vacate. You may change your vote at any time.`,
      notificationTitle,
    };
  }
  if (targetType === "impeachmentVote") {
    // Name the outcome rather than the ballot value: AYE on an impeachment is
    // a vote to remove, which is worth saying out loud.
    const action = direction === "for" ? "remove" : "acquit";
    return {
      subject: isSoft ? `Party suggestion: Vote to ${action}` : `Party Whip: Vote to ${action}`,
      body: isSoft
        ? `Your national party suggests that you vote to ${action} on the impeachment.`
        : `Your national party has whipped you to vote to ${action} on the impeachment. You may change your vote at any time.`,
      notificationTitle,
    };
  }
  if (targetType === "scotusNomination") {
    return {
      subject:
        mode === "soft"
          ? `Party suggestion: Vote ${dir} on Supreme Court nomination`
          : `Party Whip: Vote ${dir} on Supreme Court nomination`,
      body:
        mode === "soft"
          ? `Your national party suggests that you vote ${dir} on the Supreme Court nomination.`
          : `Your national party has whipped you to vote ${dir} on the Supreme Court nomination. You may change your vote at any time.`,
      notificationTitle: `Supreme Court Whip: ${dir}`,
    };
  }

  if (targetType === "cabinetNomination") {
    return {
      subject: isSoft
        ? `Party suggestion: Vote ${dir} on cabinet nomination`
        : `Party Whip: Vote ${dir} on cabinet nomination`,
      body: isSoft
        ? `Your national party suggests that you vote ${dir} on the cabinet nomination.`
        : `Your national party has whipped you to vote ${dir} on the cabinet nomination. You may change your vote at any time.`,
      notificationTitle,
    };
  }
  return {
    subject: isSoft
      ? `Party suggestion: Support assigned candidate`
      : `Party Whip: Support assigned candidate`,
    body: isSoft
      ? `Your national party suggests that you support the assigned candidate in a leadership election.`
      : `Your national party has whipped you to vote for the assigned candidate in a leadership election. You may change your vote at any time.`,
    notificationTitle,
  };
}
