/** Read a history candidate from a captured command; storage behavior is checked on MongoDB. */
export function historyAppendInfo<T>(expression: unknown): { point: T; cap: number } {
  const conditional = expression as {
    $cond: [
      unknown,
      unknown,
      { $slice: [{ $concatArrays: [unknown, { $literal: [T] }] }, number] },
    ];
  };
  const slice = conditional.$cond[2].$slice;
  return { point: slice[0].$concatArrays[1].$literal[0], cap: -slice[1] };
}
