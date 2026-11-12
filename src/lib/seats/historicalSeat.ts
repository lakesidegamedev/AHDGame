/** One seat-holding NPP (or one NPP holding several seats) in a historical roster. */
export interface HistoricalSeat {
  state: string;
  officeType:
    | "house"
    | "senate"
    | "governor"
    | "president"
    | "vicePresident"
    | "commons"
    | "caCommons"
    | "stateSenate"
    | "regionalCouncil"
    | "shugiin"
    | "sangiin"
    | "bundestag"
    | "landtag"
    | "ministerPresident"
    | "npcDelegate"
    | "peoplesCongress"
    | "dail"
    | "seanad"
    | "uachtaran"
    | "localCouncil"
    | "chamber"
    | "supremeSovietDeputy"
    | "nationalitiesDeputy"
    | "republicSupremeSoviet"
    | "volkskammerDeputy"
    | "premier"
    | "chairmanOfPresidium"
    // Beta-parliament office-type keys (FR/IT/ES/SE/TR + ES 1953 Cortes).
    | "deputy"
    | "senator"
    | "member"
    | "procurador";
  party: string;
  seatsHeld?: number; // For multi-seat offices: how many seats this single NPP holds
  senateClass?: 1 | 2 | 3; // US Senate class
  chamberClass?: 1 | 2; // JP Sangiin class
}
