import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

/**
 * Available reset presets.
 * Each preset defines a specific starting condition for game resets.
 */
// ─────────────────────────────────────────────────────────────────────────────
// 1953 Early-Cold-War one-party legislatures. Regions match 1979 (bloc borders
// were stable across the Cold War), but each chamber uses its ERA-CORRECT ruling
// party: HU is the MDP (Rákosi's Working People's Party, not the post-1956 MSZMP)
// and RO is the PMR (the Workers' Party, not the "PCR" name it adopted in 1965).
// The other bloc ruling parties (SED, PZPR, SKJ, BKP, KSČ, CPB) carried the same
// names in both eras. Seat totals are authored for the 1953 convocations and
// differ from the 1979 map. The US 1953 executive + 83rd Congress are fully
// authored above; the other democracies (UK/FR/IT/ES/SE/TR/DE/JP/BR/IE) start
// with vacant legislatures — per-state 1953 results are a separate task.
// Nigeria is a British colony (coming-soon) but seeds its late-colonial party
// triad (NCNC/AG/NPC) + zone-governor priors; Federal House seats stay vacant.

// USSR — 3rd Supreme Soviet convocation (elected Mar 1950); CPSU ~75%, non-party ~25%.
// Soviet of the Union: 526 seats across all 14 RU regions; every region's
// delegation equals its `houseDistricts` in ruRegions1953 — asserted in
// sovietSeatMap.test.ts, so reapportioning requires regenerating this list.
// The real 1954 convocation seated 708; the missing 182 belong to Ukraine,
// Byelorussia and the Baltics, which are their own countries with their own
// chambers now, so their rows left this list.
// Soviet of Nationalities: 515 republic-weighted delegations from
// RU_NATIONALITIES_SEATS (ruSeats.ts, D11), likewise down from 640 for the same
// reason. Both chambers: CPSU share = round(seats * 0.75).
export const SU_SUPREME_SOVIET_1953: HistoricalSeat[] = [
  { state: "CEN", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 60 },
  { state: "CEN", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 20 },
  { state: "NWR", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 28 },
  { state: "NWR", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 9 },
  { state: "NOR", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 13 },
  { state: "NOR", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 4 },
  { state: "CBE", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 23 },
  { state: "CBE", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 7 },
  { state: "VOL", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 45 },
  { state: "VOL", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 15 },
  { state: "NCA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 35 },
  { state: "NCA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 11 },
  { state: "URA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 41 },
  { state: "URA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 14 },
  { state: "WSB", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 26 },
  { state: "WSB", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 8 },
  { state: "ESB", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 16 },
  { state: "ESB", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 5 },
  { state: "FEA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 14 },
  { state: "FEA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 4 },
  { state: "KAZ", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 23 },
  { state: "KAZ", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 7 },
  { state: "TRA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 29 },
  { state: "TRA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 10 },
  { state: "CAS", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 38 },
  { state: "CAS", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 12 },
  { state: "MOL", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 7 },
  { state: "MOL", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 2 },
  // ── Soviet of Nationalities (RU_NATIONALITIES_SEATS, D11) — republic-weighted,
  // same CPSU share convention: round(seats * 0.75). ──
  { state: "CEN", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 19 },
  { state: "CEN", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 6 },
  { state: "NWR", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 17 },
  { state: "NWR", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "NOR", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 15 },
  { state: "NOR", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "CBE", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 15 },
  { state: "CBE", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "VOL", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 33 },
  { state: "VOL", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 11 },
  { state: "NCA", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 25 },
  { state: "NCA", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 8 },
  { state: "URA", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 17 },
  { state: "URA", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "WSB", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 15 },
  { state: "WSB", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "ESB", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 15 },
  { state: "ESB", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "FEA", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 15 },
  { state: "FEA", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 5 },
  { state: "KAZ", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 19 },
  { state: "KAZ", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 6 },
  { state: "TRA", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 81 },
  { state: "TRA", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 27 },
  { state: "CAS", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 83 },
  { state: "CAS", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 28 },
  { state: "MOL", officeType: "nationalitiesDeputy", party: "su_cpsu", seatsHeld: 19 },
  { state: "MOL", officeType: "nationalitiesDeputy", party: "independent", seatsHeld: 6 },
  // ── Executive (US_EXECUTIVE_1953 pattern: national offices use the bare
  // country code as `state`; fictional generated names). The world must not
  // open with a vacant Council of Ministers — seedRUGovernmentFormation links
  // the seeded Premier NPP into a `formed` government doc (D5).
  { state: "RU", officeType: "premier", party: "su_cpsu" },
  { state: "RU", officeType: "chairmanOfPresidium", party: "su_cpsu" },
];
