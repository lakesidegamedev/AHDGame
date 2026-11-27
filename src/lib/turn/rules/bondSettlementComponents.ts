/** Only linked maturity reversals need to share an atomic default decision. */
export function bondSettlementComponents(
  issuers: readonly string[],
  flows: readonly { issuer: string; holders: readonly string[] }[]
): string[][] {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    while (id !== current) {
      const next = parent.get(id)!;
      parent.set(id, current);
      id = next;
    }
    return current;
  };
  for (const id of issuers) parent.set(id, id);
  for (const { issuer, holders } of flows) {
    if (!parent.has(issuer)) parent.set(issuer, issuer);
    for (const holder of holders) {
      if (!parent.has(holder)) parent.set(holder, holder);
      const a = root(issuer),
        b = root(holder);
      if (a !== b) parent.set(a, b);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const key = root(id),
      list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
  }
  return [...groups.values()].map((group) => group.sort()).sort((a, b) => a[0].localeCompare(b[0]));
}

/** Pack independent components without splitting a connected reversal graph. */
export function packBondSettlementComponents(
  groups: readonly string[][],
  targetSize = 100
): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  for (const group of groups) {
    if (batch.length && batch.length + group.length > targetSize) {
      batches.push(batch);
      batch = [];
    }
    batch.push(...group);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
