/** Keep called district parties; fill uncalled seats to the canonical delegation. */
export function openingHouseParties2027(input: {
  districts: readonly { district: string; party: string }[];
  delegations: readonly { state: string; party: string; seatsHeld?: number }[];
  uncalled: readonly string[];
}) {
  const normalize = (id: string) => id.replace(/-0([1-9])$/, "-$1");
  const uncalled = new Set(input.uncalled.map(normalize));
  const result = new Map<string, string>();
  const abbreviation = (party: string) =>
    party === "democrat" || party === "D"
      ? "DEM"
      : party === "republican" || party === "R"
        ? "REP"
        : "IND";
  for (const state of new Set(input.delegations.map((row) => row.state))) {
    const remaining = new Map<string, number>();
    for (const row of input.delegations.filter((row) => row.state === state)) {
      const party = abbreviation(row.party);
      remaining.set(party, (remaining.get(party) ?? 0) + (row.seatsHeld ?? 1));
    }
    const rows = input.districts.filter((row) => row.district.startsWith(`${state}-`));
    const consume = (district: string, party: string) => {
      if ((remaining.get(party) ?? 0) <= 0)
        throw new Error(`Called district conflicts with canonical delegation: ${district}`);
      remaining.set(party, remaining.get(party)! - 1);
      result.set(district, party);
    };
    for (const row of rows.filter((row) => !uncalled.has(normalize(row.district))))
      consume(row.district, abbreviation(row.party));
    for (const row of rows.filter((row) => uncalled.has(normalize(row.district)))) {
      const preferred = abbreviation(row.party);
      const party =
        (remaining.get(preferred) ?? 0) > 0
          ? preferred
          : [...remaining].find(([, seats]) => seats > 0)?.[0];
      if (!party) throw new Error(`No canonical uncalled seat available: ${row.district}`);
      consume(row.district, party);
    }
    if ([...remaining.values()].some((seats) => seats !== 0))
      throw new Error(`Incomplete canonical district allocation: ${state}`);
  }
  return result;
}
