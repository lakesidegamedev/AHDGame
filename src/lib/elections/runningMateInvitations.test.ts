import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";

const createNotifications = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotifications: (...args: unknown[]) => createNotifications(...args),
}));

import { inviteRunningMate, respondToRunningMateInvitation } from "./runningMateInvitations";

function makeDb(candidates: {
  findOne?: ReturnType<typeof vi.fn>;
  updateOne?: ReturnType<typeof vi.fn>;
  updateMany?: ReturnType<typeof vi.fn>;
}) {
  const coll = {
    findOne: candidates.findOne ?? vi.fn().mockResolvedValue(null),
    updateOne: candidates.updateOne ?? vi.fn().mockResolvedValue({ matchedCount: 1 }),
    updateMany: candidates.updateMany ?? vi.fn().mockResolvedValue({ matchedCount: 0 }),
  };
  const characters = {
    findOne: vi.fn().mockResolvedValue({ userId: new ObjectId() }),
  };
  return {
    coll,
    db: {
      collection: (name: string) => (name === "characters" ? characters : coll),
    } as never,
  };
}

describe("running mate invitations (ticket 1889)", () => {
  const electionId = new ObjectId();
  const nomineeRowId = new ObjectId();
  const invitee = { _id: new ObjectId(), userId: new ObjectId(), name: "Invited Player" };

  beforeEach(() => createNotifications.mockReset());

  it("records an invitation without putting the player on the ticket", async () => {
    const { db, coll } = makeDb({});
    const ok = await inviteRunningMate(db, {
      electionId,
      nomineeCandidateId: nomineeRowId,
      nomineeName: "Nominee",
      invitee,
    });
    expect(ok).toBe(true);
    const [, update] = coll.updateOne.mock.calls[0];
    expect(update.$set.pendingRunningMateId).toEqual(invitee._id);
    expect(update.$set).not.toHaveProperty("runningMateId");
    expect(createNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ userId: invitee.userId, type: "running_mate_invite" }),
    ]);
  });

  it("does not notify when the guarded write matched nothing", async () => {
    const { db } = makeDb({ updateOne: vi.fn().mockResolvedValue({ matchedCount: 0 }) });
    const ok = await inviteRunningMate(db, {
      electionId,
      nomineeCandidateId: nomineeRowId,
      nomineeName: "Nominee",
      invitee,
      guard: { russianTicketLocked: { $ne: true } },
    });
    expect(ok).toBe(false);
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("accepting moves the invitation onto runningMateId", async () => {
    const nominee = {
      _id: nomineeRowId,
      electionId,
      characterId: new ObjectId(),
      characterName: "Nominee",
      status: "active",
      pendingRunningMateId: invitee._id,
    };
    const findOne = vi.fn().mockResolvedValueOnce(nominee).mockResolvedValueOnce(null);
    const { db, coll } = makeDb({ findOne });
    const result = await respondToRunningMateInvitation(db, {
      electionId,
      nomineeCandidateId: nomineeRowId,
      invitee,
      accept: true,
    });
    expect(result).toEqual({ ok: true, accepted: true, nomineeName: "Nominee" });
    const [filter, update] = coll.updateOne.mock.calls[0];
    expect(filter.pendingRunningMateId).toEqual(invitee._id);
    expect(update.$set.runningMateId).toEqual(invitee._id);
    expect(update.$unset).toHaveProperty("pendingRunningMateId");
    // Other open invitations in the race are closed.
    expect(coll.updateMany).toHaveBeenCalledWith(
      { electionId, pendingRunningMateId: invitee._id },
      expect.anything()
    );
  });

  it("declining clears the invitation and never sets runningMateId", async () => {
    const nominee = {
      _id: nomineeRowId,
      electionId,
      characterId: new ObjectId(),
      characterName: "Nominee",
      status: "active",
      pendingRunningMateId: invitee._id,
    };
    const { db, coll } = makeDb({ findOne: vi.fn().mockResolvedValueOnce(nominee) });
    const result = await respondToRunningMateInvitation(db, {
      electionId,
      nomineeCandidateId: nomineeRowId,
      invitee,
      accept: false,
    });
    expect(result).toEqual({ ok: true, accepted: false, nomineeName: "Nominee" });
    const [, update] = coll.updateOne.mock.calls[0];
    expect(update.$set).not.toHaveProperty("runningMateId");
    expect(update.$unset).toHaveProperty("pendingRunningMateId");
  });

  it("refuses to accept a second ticket in the same race", async () => {
    const nominee = {
      _id: nomineeRowId,
      electionId,
      characterId: new ObjectId(),
      characterName: "Nominee",
      status: "active",
      pendingRunningMateId: invitee._id,
    };
    const findOne = vi
      .fn()
      .mockResolvedValueOnce(nominee)
      .mockResolvedValueOnce({ _id: new ObjectId(), runningMateId: invitee._id });
    const { db, coll } = makeDb({ findOne });
    const result = await respondToRunningMateInvitation(db, {
      electionId,
      nomineeCandidateId: nomineeRowId,
      invitee,
      accept: true,
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(coll.updateOne).not.toHaveBeenCalled();
  });

  it("reports a closed invitation when none is open for this player", async () => {
    const { db } = makeDb({});
    const result = await respondToRunningMateInvitation(db, {
      electionId,
      nomineeCandidateId: nomineeRowId,
      invitee,
      accept: true,
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});
