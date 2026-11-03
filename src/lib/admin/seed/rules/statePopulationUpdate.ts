/** Reference top-ups preserve a world's live population; explicit resets replace it. */
export function statePopulationUpdate<T extends { population: number }>(state: T, reset: boolean) {
  const { population, ...reference } = state;
  return reset ? { $set: state } : { $set: reference, $setOnInsert: { population } };
}
