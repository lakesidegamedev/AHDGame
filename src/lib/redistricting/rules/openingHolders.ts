/** Allocate compressed opening House delegations to modeled district holders. */
export function openingDistrictHolders(input: {
  districts: readonly {
    id: string;
    state: string;
    lean: number;
    occupied: boolean;
    openingParty?: string;
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
  for (const state of [...new Set(input.districts.map((d) => d.state))]) {
    const districts = input.districts.filter((d) => d.state === state);
    // A targeted seed must never replace holders once play has begun.
    if (districts.some((d) => d.occupied)) continue;
    const officials = input.officials.filter((o) => o.state === state);
    if (!officials.length) continue; // Vacant/founding opening.
    if (
      officials.some((o) => !Number.isSafeInteger(o.seats) || o.seats <= 0) ||
      officials.reduce((sum, o) => sum + o.seats, 0) !== districts.length
    )
      throw new Error(`Opening House capacity does not match districts in ${state}`);
    const ordered = [...districts].sort((a, b) => a.lean - b.lean || a.id.localeCompare(b.id));
    if (districts.some((d) => d.openingParty !== undefined)) {
      if (districts.some((d) => !d.openingParty))
        throw new Error(`Incomplete opening district results in ${state}`);
      const remaining = new Map(officials.map((o) => [o.id, o.seats]));
      for (const district of districts) {
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
  return assignments;
}
