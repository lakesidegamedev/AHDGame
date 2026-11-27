/** Recalculate quantity and weighted cost from the document Mongo actually updates. */
export function weightedPositionCredit(input: {
  array: string;
  identityField: string;
  identity: unknown;
  shares: number;
  price: number;
  costField: string;
  valueField?: string;
  increments?: Record<string, number>;
  set?: Record<string, unknown>;
}): Record<string, unknown>[] {
  if (
    !Number.isFinite(input.shares) ||
    input.shares <= 0 ||
    !Number.isFinite(input.price) ||
    input.price < 0
  )
    throw new Error("Invalid position credit");
  const identity = { $literal: input.identity };
  const matches = { $eq: [`$$position.${input.identityField}`, identity] };
  const shares = { $add: ["$$position.shares", input.shares] };
  const cost = {
    $divide: [
      {
        $add: [
          {
            $multiply: [
              "$$position.shares",
              { $ifNull: [`$$position.${input.costField}`, input.price] },
            ],
          },
          input.shares * input.price,
        ],
      },
      shares,
    ],
  };
  const position = {
    [input.identityField]: input.identity,
    shares: input.shares,
    [input.costField]: input.price,
    ...(input.valueField ? { [input.valueField]: input.shares * input.price } : {}),
  };
  const array = { $ifNull: [`$${input.array}`, []] };
  return [
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(input.increments ?? {}).map(([key, value]) => [
            key,
            { $add: [{ $ifNull: [`$${key}`, 0] }, value] },
          ])
        ),
        ...Object.fromEntries(
          Object.entries(input.set ?? {}).map(([key, value]) => [key, { $literal: value }])
        ),
        [input.array]: {
          $cond: [
            { $gt: [{ $size: { $filter: { input: array, as: "position", cond: matches } } }, 0] },
            {
              $map: {
                input: array,
                as: "position",
                in: {
                  $cond: [
                    matches,
                    {
                      $mergeObjects: [
                        "$$position",
                        {
                          shares,
                          [input.costField]: cost,
                          ...(input.valueField
                            ? { [input.valueField]: { $multiply: [shares, input.price] } }
                            : {}),
                        },
                      ],
                    },
                    "$$position",
                  ],
                },
              },
            },
            { $concatArrays: [array, { $literal: [position] }] },
          ],
        },
      },
    },
  ];
}
