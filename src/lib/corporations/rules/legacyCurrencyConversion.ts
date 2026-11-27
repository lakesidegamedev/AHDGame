function requireRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid currency conversion rate");
}

/** Currency conversion preserves the sign of every monetary adjustment. */
export function legacyHistoryMoneyUpdate(
  fields: readonly string[],
  rate: number
): Record<string, unknown> {
  requireRate(rate);
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        $cond: [{ $isNumber: `$${field}` }, { $multiply: [`$${field}`, rate] }, `$${field}`],
      },
    ])
  );
}

export function legacyHistoryMoneyMapUpdate(
  fields: readonly string[],
  rate: number
): Record<string, unknown> {
  requireRate(rate);
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        $cond: [
          { $eq: [{ $type: `$${field}` }, "object"] },
          {
            $arrayToObject: {
              $map: {
                input: { $objectToArray: `$${field}` },
                as: "kv",
                in: {
                  k: "$$kv.k",
                  v: {
                    $cond: [{ $isNumber: "$$kv.v" }, { $multiply: ["$$kv.v", rate] }, "$$kv.v"],
                  },
                },
              },
            },
          },
          `$${field}`,
        ],
      },
    ])
  );
}
