/** Frozen result geometry and winners, owned by the election tally lifecycle. */
export interface HouseDistrictResult {
  version: 1;
  electionId: string;
  countryId: string;
  stateId: string;
  viewBox: string;
  geometryAvailable: boolean;
  partyColors: Record<string, string>;
  districts: {
    id: string;
    name: string;
    path: string;
    winner: string;
    party: string;
    partyLabel: string;
    margin: number;
    marginAvailable: false;
    leanStatus: "unavailable";
  }[];
}

export function freezeHouseDistrictResult(input: {
  electionId: string;
  countryId: string;
  stateId: string;
  indices: readonly number[];
  assignment: ReadonlyMap<number, string>;
  candidateParty: Readonly<Record<string, string>>;
  partyColors?: Record<string, string>;
  partyLabels?: Record<string, string>;
  geometry: { viewBox: string; subdivisions: readonly { id: string; path: string }[] } | null;
}): HouseDistrictResult {
  const ids = input.indices.map(
    (i) => `${input.stateId}-${input.indices.length === 1 ? "AL" : String(i).padStart(2, "0")}`
  );
  const paths = new Map(input.geometry?.subdivisions.map((d) => [d.id, d.path]) ?? []);
  const geometryAvailable = paths.size === ids.length && ids.every((id) => !!paths.get(id));
  return {
    version: 1,
    electionId: input.electionId,
    countryId: input.countryId,
    stateId: input.stateId,
    viewBox: geometryAvailable ? input.geometry!.viewBox : "0 0 1 1",
    geometryAvailable,
    partyColors: { ...input.partyColors },
    districts: input.indices.map((index, i) => {
      const winner = input.assignment.get(index);
      if (!winner || !input.candidateParty[winner])
        throw new Error("Incomplete House district result");
      return {
        id: ids[i],
        name: ids[i],
        path: geometryAvailable ? paths.get(ids[i])! : "",
        winner,
        party: input.candidateParty[winner],
        partyLabel: input.partyLabels?.[input.candidateParty[winner]] ?? "Unknown party",
        margin: 0,
        marginAvailable: false,
        leanStatus: "unavailable",
      };
    }),
  };
}
