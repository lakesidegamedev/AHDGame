import type { JpLawText } from "./jpLawTextTypes";

export const JP_LAW_TEXT_GOVERNANCE: Record<string, JpLawText> = {
  "governance.participation.primary": [
    "Public Offices Election Act",
    "Who may vote and how easily the state lets them.",
    3,
    [
      ["Restricted Franchise", "Only a narrow group may vote."],
      ["Universal Franchise", "Every adult citizen may vote."],
      ["Modern Registration", "Registers are automatic and polling is convenient."],
      ["Access Enforcement", "Early voting and assistance reach every voter."],
      ["Full Participation Charter", "Voting is easy, supported and expected."],
    ],
  ],
  "governance.openness.primary": [
    "Information Disclosure Act",
    "Opening the door on the official mind.",
    3,
    [
      ["Official Secrecy", "Ministries keep their records closed."],
      ["Publication Rules", "Key decisions are published."],
      ["Records Access", "Citizens may request records."],
      ["Open Government Standard", "Records are open by default."],
      ["Radical Transparency", "Almost nothing stays secret."],
    ],
  ],
  "governance.localAutonomy.primary": [
    "Local Autonomy and Grants Act",
    "What the national government sends the prefectures and municipalities, and with how many strings.",
    2,
    [
      ["No Grant System", "Local government depends on its own revenue."],
      ["Specific Grants", "Grants are tied to specific projects."],
      ["Grant Settlement", "Local allocation tax evens out local budgets."],
      ["Block Grants", "Funds arrive as block grants with few conditions."],
      ["Devolved Finance", "Prefectures and cities raise and spend most of their own money."],
    ],
  ],
  "governance.integrity.primary": [
    "Audit and Anticorruption Act",
    "The Board of Audit and watchdogs keeping officials honest.",
    3,
    [
      ["No Watchdogs", "Officials answer to nobody."],
      ["Audit Office", "An audit board checks the accounts."],
      ["Accounts and Standards", "Ethics rules and published accounts bind officials."],
      ["Anticorruption Regime", "Investigators prosecute bribery and favours."],
      ["Glass-House Standard", "Every official decision is open to scrutiny."],
    ],
  ],
  "governance.administration.primary": [
    "National Public Service Act",
    "The permanent bureaucracy, recruited, ranked and running the state.",
    4,
    [
      ["Patronage Service", "Posts go to supporters."],
      ["Merit Foundations", "Entry exams and ranks are introduced."],
      ["Professional Service", "A career service runs the ministries."],
      ["Administrative Excellence", "Training and mobility raise standards."],
      ["Reformed Administration", "A lean and accountable service runs every ministry."],
    ],
  ],
  "governance.decisiveness.primary": [
    "Cabinet Office and Prime Minister Act",
    "Whether the centre can decide and make it stick.",
    3,
    [
      ["Fragmented Government", "Ministries and factions pull in different directions."],
      ["Cabinet Offices", "The cabinet has a secretariat."],
      ["Organized Centre", "The prime minister's office coordinates policy."],
      ["Streamlined Command", "The prime minister controls appointments and the agenda."],
      ["Decisive Executive", "The centre decides and ministries obey."],
    ],
  ],
  "governance.centralAuthority.primary": [
    "National Supremacy Act",
    "Whether national law settles the matter everywhere.",
    3,
    [
      ["Weak Centre", "Prefectures follow national law as they choose."],
      ["Enforcement Capacity", "National agencies can enforce in the prefectures."],
      ["Assured Supremacy", "National law overrides local rules."],
      ["Strong Centre", "Ministries direct prefectural officials."],
      ["Commanding Centre", "The national government directs every local authority."],
    ],
  ],
  "sec.electionsAdministration": [
    "Elections Administration Act",
    "How the count is run and who watches it.",
    3,
    [
      ["No Standards", "Each town runs its own count."],
      ["Officer Standards", "Election officers follow common rules."],
      ["National Standards", "National standards govern ballots and counting."],
      ["Enforcement Machinery", "Observers and courts enforce the rules."],
      ["Full Guarantee Regime", "Every vote is counted fairly and checked."],
    ],
  ],
  "sec.ministryReorganization": [
    "Ministry Reorganization Act",
    "Reviews that prune and merge ministries and agencies.",
    3,
    [
      ["No Authority", "Ministries stay as they are."],
      ["Review Committees", "Committees review overlaps."],
      ["Reorganization Authority", "The cabinet may merge and abolish agencies."],
      ["Sweeping Consolidation", "Ministries are merged into large units."],
      ["Continuous Reform Mandate", "Reorganization never stops."],
    ],
  ],
  "sec.publicBroadcasting": [
    "Public Broadcasting Act",
    "Licence-funded broadcasters and the nation talking to itself.",
    3,
    [
      ["No Public Broadcasting", "All broadcasting is commercial."],
      ["Radio Broadcasting", "A public radio service is funded."],
      ["Charter Broadcasting", "A public broadcaster runs radio and television on a fee."],
      ["Digital Expansion", "Online services and regional stations join the broadcaster."],
      ["Full Public Service Media", "Public media serves every audience in every region."],
    ],
  ],
};
