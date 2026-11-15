/** Allocate compressed opening House delegations to modeled district holders. */
export function openingDistrictHolderPlan(input: {
  /** Authored occupied seats plus declared vacancies, never inferred from live officials. */
  sourceCapacity?: Readonly<Record<string, number>>;
  districts: readonly {
    id: string;
    state: string;
    lean: number;
    occupied: boolean;
    openingParty?: string;
    vacant?: boolean;
  }[];
  officials: readonly {
    id: string;
    state: string;
    seats: number;
    party: string;
    position: number;
  }[];
}) {
  const assignments: { districtId: string; officialId: string; party: string }[] = [];
  const unsupportedStates: { state: string; reason: string }[] = [];
  for (const state of [...new Set(input.districts.map((d) => d.state))]) {
    const districts = input.districts.filter((d) => d.state === state);
    // A targeted seed must never replace holders once play has begun.
    if (districts.some((d) => d.occupied)) continue;
    const officials = input.officials.filter((o) => o.state === state);
    if (!officials.length) continue; // Vacant/founding opening.
    const sourceCapacity = input.sourceCapacity?.[state];
    if (sourceCapacity !== undefined && sourceCapacity !== districts.length) {
      unsupportedStates.push({
        state,
        reason: `Opening House holders unmapped in ${state}: historical roster requires ${sourceCapacity} districts, configured map has ${districts.length}. Delegation retained; no district incumbents inferred.`,
      });
      continue;
    }
    const available = districts.filter((d) => !d.vacant);
    if (
      officials.some((o) => !Number.isSafeInteger(o.seats) || o.seats <= 0) ||
      officials.reduce((sum, o) => sum + o.seats, 0) !== available.length
    )
      throw new Error(`Opening House capacity does not match districts in ${state}`);
    const ordered = [...available].sort((a, b) => a.lean - b.lean || a.id.localeCompare(b.id));
    if (districts.some((d) => d.openingParty !== undefined)) {
      if (available.some((d) => !d.openingParty))
        throw new Error(`Incomplete opening district results in ${state}`);
      const remaining = new Map(officials.map((o) => [o.id, o.seats]));
      for (const district of available) {
        const holder = officials.find(
          (o) => o.party === district.openingParty && remaining.get(o.id)! > 0
        );
        if (!holder)
          throw new Error(`Opening district results disagree with delegation in ${state}`);
        remaining.set(holder.id, remaining.get(holder.id)! - 1);
        assignments.push({ districtId: district.id, officialId: holder.id, party: holder.party });
      }
      continue;
    }
    const holders = [...officials].sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id)
    );
    let index = 0;
    for (const official of holders)
      for (let n = 0; n < official.seats; n++)
        assignments.push({
          districtId: ordered[index++].id,
          officialId: official.id,
          party: official.party,
        });
  }
  return { assignments, unsupportedStates };
}

export function openingDistrictHolders(input: Parameters<typeof openingDistrictHolderPlan>[0]) {
  const plan = openingDistrictHolderPlan(input);
  if (plan.unsupportedStates.length) throw new Error(plan.unsupportedStates[0].reason);
  return plan.assignments;
}
