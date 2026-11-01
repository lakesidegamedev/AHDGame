/** Atomic eligibility predicate for optional corporate cash outflows. */
export function corporateDiscretionaryCashGuard() {
  const clear = (field: string) => ({
    $eq: [
      {
        $size: {
          $filter: {
            input: { $objectToArray: { $ifNull: ["$" + field, {}] } },
            as: "payable",
            cond: { $gt: ["$$payable.v", 1e-8] },
          },
        },
      },
      0,
    ],
  });
  return {
    pendingOperatingCash: { $not: { $gt: 1e-8 } },
    $expr: {
      $and: [clear("federalTaxArrearsAnchorByCountry"), clear("operatingCashArrearsByCurrency")],
    },
  };
}

/** Explain the same eligibility predicate before an action starts side effects. */
export function corporateCashEncumbered(input: {
  pendingOperatingCash?: number;
  federalTaxArrearsAnchorByCountry?: Readonly<Record<string, number>>;
  operatingCashArrearsByCurrency?: Readonly<Record<string, number>>;
}) {
  return (
    (input.pendingOperatingCash ?? 0) > 1e-8 ||
    [input.federalTaxArrearsAnchorByCountry, input.operatingCashArrearsByCurrency].some((amounts) =>
      Object.values(amounts ?? {}).some((amount) => amount > 1e-8)
    )
  );
}
