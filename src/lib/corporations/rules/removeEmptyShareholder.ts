/** Remove only an empty matching position from the current shareholder list. */
export function removeEmptyShareholder(
  identityField: string,
  identity: unknown
): Record<string, unknown>[] {
  return [
    {
      $set: {
        shareholders: {
          $filter: {
            input: { $ifNull: ["$shareholders", []] },
            as: "position",
            cond: {
              $not: [
                {
                  $and: [
                    { $eq: [`$$position.${identityField}`, { $literal: identity }] },
                    { $lte: ["$$position.shares", 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  ];
}
