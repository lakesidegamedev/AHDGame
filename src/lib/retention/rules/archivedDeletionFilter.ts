/** Delete only unchanged identities that the verified archive actually contains. */
export function archivedDeletionFilter(
  base: Record<string, unknown>,
  snapshots: readonly Record<string, unknown>[]
): Record<string, unknown> {
  return {
    $and: [
      ...(Array.isArray(base.$and) ? base.$and : [base]),
      {
        $or: snapshots.map((snapshot) => ({
          _id: snapshot._id,
          $expr: { $eq: ["$$ROOT", { $literal: snapshot }] },
        })),
      },
    ],
  };
}
