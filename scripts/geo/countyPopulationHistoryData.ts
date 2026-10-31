/** Census text adapters. Missing historical observations remain missing, never zero-filled. */
export function parseDecennialCounties(text: string, year: number): Record<string, number> {
  if (year < 1900 || year > 1990 || year % 10) throw new Error("Invalid decennial year");
  const result: Record<string, number> = {};
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!/^\d{5}\s/.test(line)) continue;
    const fields = line.trim().split(/\s+/);
    const id = fields[0];
    if (seen.has(id)) throw new Error(`Duplicate decennial FIPS ${id}`);
    seen.add(id);
    const token = fields[1 + (1990 - year) / 10];
    if (/^(?:-+|\.+)$/.test(token)) continue;
    if (!/^\d+$/.test(token)) throw new Error(`Invalid decennial population ${id}`);
    const population = Number(token);
    if (!Number.isSafeInteger(population)) throw new Error("Unsafe decennial population");
    result[id] = population;
  }
  if (!seen.size) throw new Error("No decennial observations");
  return result;
}

/** Each county has 19 disjoint ages x 8 race/sex groups x 2 origins. */
export function parseIntercensalCounties(text: string, year: number): Record<string, number> {
  if (year < 1990 || year > 1999) throw new Error("Invalid intercensal year");
  const result: Record<string, number> = {};
  const groups = new Map<string, Set<number>>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 6 || fields.some((v) => !/^\d+$/.test(v)))
      throw new Error("Invalid intercensal row");
    const [y, id, ageText, raceText, originText, popText] = fields;
    const age = Number(ageText),
      race = Number(raceText),
      origin = Number(originText);
    const population = Number(popText);
    if (
      Number(y) !== year - 1900 ||
      !/^\d{5}$/.test(id) ||
      id.endsWith("000") ||
      age > 18 ||
      race < 1 ||
      race > 8 ||
      origin < 1 ||
      origin > 2 ||
      !Number.isSafeInteger(population)
    )
      throw new Error("Invalid intercensal observation");
    let cells = groups.get(id);
    if (!cells) groups.set(id, (cells = new Set()));
    const cell = age * 16 + (race - 1) * 2 + origin - 1;
    if (cells.has(cell)) throw new Error(`Duplicate intercensal cell ${id}`);
    cells.add(cell);
    result[id] = (result[id] ?? 0) + population;
    if (!Number.isSafeInteger(result[id])) throw new Error("Unsafe intercensal total");
  }
  if (!groups.size || [...groups.values()].some((cells) => cells.size !== 304))
    throw new Error("Incomplete intercensal coverage");
  return result;
}

/** The published 1979 table alternates 1970-74 and 1975-79 panels per state. */
export function parse1979Counties(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  let selected = false;
  let pending = "";
  for (let line of text.split(/[\r\n]+/)) {
    if (!line.trim()) continue;
    if (pending) {
      if (/^\d{5}\s/.test(line) || /^Code\s/.test(line))
        throw new Error("Incomplete 1979 table row");
      line = pending + " " + line.trim();
      pending = "";
    }
    if (/^Code\s+Area Name/.test(line)) selected = /1979\s*$/.test(line);
    if (!selected || !/^\d{5}\s/.test(line)) continue;
    const fields = line.trim().split(/\s+/);
    const id = fields[0],
      values = fields.slice(-5);
    if (values.some((value) => !/^\d+$/.test(value))) {
      pending = line;
      continue;
    }
    if (id in result) throw new Error(`Duplicate 1979 FIPS ${id}`);
    const population = Number(values[4]);
    if (!Number.isSafeInteger(population)) throw new Error("Unsafe 1979 population");
    result[id] = population;
  }
  if (pending) throw new Error("Incomplete 1979 table row");
  if (!Object.keys(result).length) throw new Error("No 1979 observations");
  return result;
}

/** Census county-change notices: only whole-entity renames or unions, no estimated splits. */
export const COUNTY_HISTORY_ALIASES: Readonly<Record<string, string>> = {
  "12025": "12086", // Dade -> Miami-Dade
  "46113": "46102", // Shannon -> Oglala Lakota
  "02270": "02158", // Wade Hampton -> Kusilvak
  "51515": "51019", // Bedford city -> Bedford County
  "51560": "51005", // Clifton Forge -> Alleghany County
  "51780": "51083", // South Boston -> Halifax County
  "02063": "02261", // Chugach + Copper River -> map's former Valdez-Cordova
  "02066": "02261",
};

export function reconcileCountyHistory(
  populations: Readonly<Record<string, number>>,
  roster: readonly string[]
): {
  populations: Record<string, number>;
  fallbackStates: Record<string, { missing: string[]; extra: string[] }>;
} {
  if (new Set(roster).size !== roster.length || roster.some((id) => !/^\d{5}$/.test(id)))
    throw new Error("Invalid map roster");
  for (const old of ["12025", "46113", "02270"])
    if (old in populations && COUNTY_HISTORY_ALIASES[old] in populations)
      throw new Error("Conflicting county rename observations");
  for (const old of ["51515", "51560", "51780"])
    if (old in populations && !(COUNTY_HISTORY_ALIASES[old] in populations))
      throw new Error("Incomplete historical county union");
  if (
    ("02063" in populations || "02066" in populations) &&
    (!("02063" in populations) || !("02066" in populations) || "02261" in populations)
  )
    throw new Error("Incomplete or conflicting Valdez-Cordova union");
  const stateIds = new Set(roster.map((id) => id.slice(0, 2)));
  const normalized: Record<string, number> = {};
  for (const [id, population] of Object.entries(populations)) {
    if (!/^\d{5}$/.test(id) || !Number.isSafeInteger(population) || population < 0)
      throw new Error("Invalid historical county population");
    if (id.endsWith("000") || !stateIds.has(id.slice(0, 2))) continue;
    const target = COUNTY_HISTORY_ALIASES[id] ?? id;
    normalized[target] = (normalized[target] ?? 0) + population;
    if (!Number.isSafeInteger(normalized[target])) throw new Error("Unsafe historical union");
  }
  const result: Record<string, number> = {};
  const fallbackStates: Record<string, { missing: string[]; extra: string[] }> = {};
  for (const state of [...stateIds].sort()) {
    const expected = roster.filter((id) => id.startsWith(state)).sort();
    const available = Object.keys(normalized)
      .filter((id) => id.startsWith(state))
      .sort();
    const missing = expected.filter((id) => !(id in normalized));
    const extra = available.filter((id) => !expected.includes(id));
    if (missing.length || extra.length) fallbackStates[state] = { missing, extra };
    else for (const id of expected) result[id] = normalized[id];
  }
  return { populations: result, fallbackStates };
}
