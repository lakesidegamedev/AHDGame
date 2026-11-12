/**
 * Election types analytics may record verbatim; anything else is "unknown".
 *
 * A static list because the client bundle reads it. `electionTypes.test.ts`
 * fails when an election type the game knows is missing here, so a new
 * chamber is never silently recorded as "unknown".
 */
export const ANALYTICS_ELECTION_TYPES: ReadonlySet<string> = new Set([
  // US
  "president",
  "presidential",
  "house",
  "senate",
  "stateSenate",
  "governor",
  "special_governor",
  "special_president",
  // UK
  "commons",
  "snap_commons",
  "special_commons",
  "primeMinister",
  "holyrood",
  "snap_holyrood",
  "senedd",
  "snap_senedd",
  "qcAssembly",
  "snap_qcAssembly",
  "regionalCouncil",
  // DE
  "bundestag",
  "snap_bundestag",
  "landtag",
  "ministerPresident",
  "chancellor",
  // JP
  "shugiin",
  "snap_shugiin",
  "sangiin",
  // CN
  "npcDelegate",
  "peoplesCongress",
  // IE
  "dail",
  "seanad",
  "localCouncil",
  "uachtaran",
  // BR
  "chamber",
  // FR, IT, ES, SE, TR, AT, FI, GR
  "assembleeNationale",
  "cameraDeputati",
  "congresoDiputados",
  "riksdag",
  "milletMeclisi",
  "caCommons",
  "snap_caCommons",
  "special_caCommons",
  "provincialLegislature",
  "nationalrat",
  "eduskunta",
  "vouli",
  "senat",
  "senato",
  "senado",
  // Soviet Union and its republics
  "supremeSovietDeputy",
  "supremeSoviet",
  "nationalitiesDeputy",
  "unionCongressDeputy",
  "republicSupremeSoviet",
  // Eastern bloc and successor assemblies
  "volkskammerDeputy",
  "landAssembly",
  "sejm",
  "chamberOfThePeople",
  "chamberOfNations",
  "nationalAssembly",
  "grandNationalAssembly",
  "chamberOfDeputies",
  "federalAssembly",
  // Non-office contests
  "specialElection",
  "presidential_primary",
  "party_leadership",
  "unknown",
]);
