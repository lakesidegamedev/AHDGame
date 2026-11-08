/** Slate display order: upper chambers, lower chambers, executives, then regional seats. */
export function getSlateElectionSortWeight(electionType: string): number {
  switch (electionType) {
    case "senate":
    case "sangiin":
    case "lords":
    case "seanad":
    case "bundesrat":
      return 10;
    case "house":
    case "commons":
    case "bundestag":
    case "shugiin":
    case "dail":
    case "chamber":
    case "npc":
    case "npcDelegate":
    case "supremeSovietDeputy":
    case "nationalitiesDeputy":
      return 20;
    case "governor":
    case "ministerPresident":
    case "premier":
      return 30;
    case "stateSenate":
    case "regionalCouncil":
    case "holyrood":
    case "senedd":
    case "landtag":
    case "peoplesCongress":
    case "republicSupremeSoviet":
    case "localCouncil":
      return 40;
    default:
      return 50;
  }
}
