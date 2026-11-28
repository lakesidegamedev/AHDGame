export function cumulativeVoteShares(
  votes: Record<string, number>,
  total?: number
): Record<string, number> {
  const denominator = total ?? Object.values(votes).reduce((sum, count) => sum + count, 0);
  return Object.fromEntries(
    Object.entries(votes).map(([id, count]) => [
      id,
      denominator > 0 ? (count / denominator) * 100 : 0,
    ])
  );
}
