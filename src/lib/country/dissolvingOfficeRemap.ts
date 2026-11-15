/**
 * Which office an official holds after their country is absorbed.
 *
 * PER-PAIR, and necessarily so. There is no general rule that turns one
 * country's offices into another's: the mapping is a statement about two
 * specific constitutions, and a generic rule (match on `chamberKey`, say)
 * would silently seat a Land First Secretary in whatever the target happened
 * to call its second chamber.
 *
 * `null` means the office RETIRES. East Germany's Chairman of the Council of
 * State is a head of state, and the Federal Republic has no counterpart seat,
 * so the office ends with the country. An office absent from the table retires
 * for the same reason: silence is not a mapping.
 */
export type OfficeRemap = Record<string, string | null>;

const REMAPS: Record<string, OfficeRemap> = {
  // East Germany into Germany, the German Question's challenger outcome.
  "DD>DE": {
    volkskammerDeputy: "bundestag",
    landAssembly: "landtag",
    governor: "ministerPresident",
    chairmanOfStateCouncil: null,
  },
  // Germany into East Germany — the SAME settlement, with the GDR as the shell
  // that survives.
  //
  // WHY BOTH DIRECTIONS EXIST. Reunification was first built the other way round,
  // on the argument that a country's name is immutable seed data and a unified
  // Germany must not render as "East Germany". That reasoning weighed the name
  // and nothing else. It is far more expensive on every other axis: the currency,
  // the government type and the party regime statuses all belong to the GDR and
  // are free when it is the shell, where the Federal Republic as the shell needs
  // a runtime override for each — and the currency alone is read at 243 sites,
  // with a reverse map at 106 more that assumes the Mark belongs to the GDR.
  // The name needed an override EITHER way, because the Federal Republic renders
  // as "West Germany" while the GDR exists. One override against three.
  "DE>DD": {
    bundestag: "volkskammerDeputy",
    landtag: "landAssembly",
    ministerPresident: "governor",
    // The Federal Republic's presidency has no counterpart in a state whose head
    // of state is the Council of State, and the chairmanship is not a seat a
    // treaty hands to the side that lost.
    president: null,
  },
};

/** The table for a merging pair, or null when this pair has none. */
export function officeRemapFor(fromCountryId: string, toCountryId: string): OfficeRemap | null {
  return REMAPS[`${fromCountryId}>${toCountryId}`] ?? null;
}

/** The office an official takes in the absorbing country, or null to retire them. */
export function remapOffice(from: string, to: string, officeType: string): string | null {
  const table = officeRemapFor(from, to);
  if (!table) return null;
  return table[officeType] ?? null;
}
