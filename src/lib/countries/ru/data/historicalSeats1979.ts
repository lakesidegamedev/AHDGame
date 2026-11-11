import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─────────────────────────────────────────────────────────────────────────────
// 1979 Cold-War one-party legislatures (single National Front lists). The
// multiparty players (US/UK) and economy-only democracies (FR/IT/ES/SE/TR) start
// with vacant legislatures — their per-state/per-region 1979 results are a
// separate historical-data task and are deliberately not estimated here. The
// one-party states ARE seated because single-list dominance is a historical fact.
// officeType "chamber" = a multi-seat proportional lower chamber (the BR pattern).

// USSR — Supreme Soviet single-list: CPSU members ~75%, non-party (independent) ~25%.
// Soviet of the Union: 559 seats across all 14 RU regions; every region's
// delegation equals its `houseDistricts` in ruRegions — asserted in
// sovietSeatMap.test.ts, so reapportioning requires regenerating this list.
// The real 1979 chamber seated 750; the missing 191 belong to Ukraine,
// Byelorussia and the Baltics, which are their own countries with their own
// chambers now, so their rows left this list.
// Soviet of Nationalities: 515 republic-weighted delegations from
// RU_NATIONALITIES_SEATS (ruSeats.ts, D11), likewise down from 640 for the same
// reason. Both chambers: CPSU share = round(seats * 0.75).
export const SU_SUPREME_SOVIET_1979: HistoricalSeat[] = [
  { state: "CEN", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 61 },
  { state: "CEN", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 20 },
  { state: "NWR", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 29 },
  { state: "NWR", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 9 },
  { state: "NOR", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 13 },
  { state: "NOR", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 4 },
  { state: "CBE", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 17 },
  { state: "CBE", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 6 },
  { state: "VOL", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 44 },
  { state: "VOL", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 14 },
  { state: "NCA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 32 },
  { state: "NCA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 11 },
  { state: "URA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 41 },
  { state: "URA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 14 },
  { state: "WSB", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 26 },
  { state: "WSB", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 9 },
  { state: "ESB", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 17 },
  { state: "ESB", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 6 },
  { state: "FEA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 15 },
  { state: "FEA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 5 },
  { state: "KAZ", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 32 },
  { state: "KAZ", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 10 },
  { state: "TRA", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 30 },
  { state: "TRA", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 10 },
  { state: "CAS", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 55 },
  { state: "CAS", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 18 },
  { state: "MOL", officeType: "supremeSovietDeputy", party: "su_cpsu", seatsHeld: 8 },
  { state: "MOL", officeType: "supremeSovietDeputy", party: "independent", seatsHeld: 3 },
  // ── Soviet of Nationalities (RU_NATIONALITIES_SEATS, D11) — republic-weighted,
  // same CPSU share convention: round(seats * 0.75). The D11 map is
  // population-independent, so the delegation matches the 1953 block. ──
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
