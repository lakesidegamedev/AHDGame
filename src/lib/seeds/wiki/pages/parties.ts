import type { WikiSeedPage } from "../types";
import { politicalPartiesContent } from "../content/politicalParties";
import { partyMembershipContent } from "../content/partyMembership";
import { partyLeadershipContent } from "../content/partyLeadership";
import { partyLeadershipAuthorityContent } from "../content/partyLeadershipAuthority";
import { partyOrganizationContent } from "../content/partyOrganization";
import { partyIdeologyContent } from "../content/partyIdeology";
import { partyActionsContent } from "../content/partyActions";
import { partySlateContent } from "../content/partySlate";
import { coalitionsContent } from "../content/coalitions";
import { coalitionFormationContent } from "../content/coalitionFormation";
import { nppsOverviewContent } from "../content/nppsOverview";
import { nppBehaviorContent } from "../content/nppBehavior";
import { nppElectionsContent } from "../content/nppElections";
import { nppAutonomyContent } from "../content/nppAutonomy";

export const partiesPages: readonly WikiSeedPage[] = [
  {
    slug: "political-parties",
    title: "Political Parties",
    description:
      "What parties are, the two-axis ideology system, the sequentialId URL scheme, and how to find parties in each country.",
    content: politicalPartiesContent,
    category: "parties",
    extraTags: ["ideology", "membership"],
    featured: true,
    difficulty: "beginner",
    contentType: "guide",
    estimatedReadTime: 5,
    designDocUrl: "design/parties.html",
  },
  {
    slug: "party-membership",
    designDocUrl: "design/parties.html",
    title: "Party Membership",
    description:
      "How to join a party, switch parties, what membership unlocks (primaries, whip directives, action pools), and how taxes work.",
    content: partyMembershipContent,
    category: "parties",
    extraTags: ["join", "whip"],
    difficulty: "beginner",
    contentType: "guide",
    estimatedReadTime: 5,
  },
  {
    slug: "party-leadership",
    designDocUrl: "design/parties.html",
    title: "Party Leadership",
    description:
      "Chair, vice chair, and treasurer roles at the national and state level: elections, whip authority, and the chairId vs chairCharacterId distinction.",
    content: partyLeadershipContent,
    category: "parties",
    extraTags: ["chair", "whip"],
    difficulty: "intermediate",
    contentType: "reference",
    estimatedReadTime: 7,
  },
  {
    slug: "party-leadership-authority",
    designDocUrl: "design/party-leadership-authority.html",
    title: "Party Leadership & Authority",
    description:
      "Acting-chair vice-chair inheritance, the 24-turn leadership tenure gate, abandoned built-in parties, and where the UK regional parties start strong.",
    content: partyLeadershipAuthorityContent,
    category: "parties",
    extraTags: ["chair", "tenure"],
    difficulty: "intermediate",
    contentType: "reference",
    estimatedReadTime: 7,
  },
  {
    slug: "party-organization",
    designDocUrl: "design/party-building.html",
    title: "Party Organization",
    description:
      "The org score system: how the cap is calculated from election results, how org builds through budget spending, and how org multiplies vote output.",
    content: partyOrganizationContent,
    category: "parties",
    extraTags: ["org", "ground-game"],
    featured: true,
    difficulty: "intermediate",
    contentType: "guide",
    estimatedReadTime: 7,
  },
  {
    slug: "party-ideology",
    designDocUrl: "design/parties.html",
    title: "Party Ideology",
    description:
      "The economic and social two-axis grid: how party positions affect primary scoring, NPP alignment, and voter appeal in generals.",
    content: partyIdeologyContent,
    category: "parties",
    extraTags: ["econ", "social"],
    difficulty: "intermediate",
    contentType: "reference",
    estimatedReadTime: 6,
  },
  {
    slug: "party-actions",
    designDocUrl: "design/party-influence.html",
    title: "Party Actions",
    description:
      "Budget-based actions (GOTV, suppression, org building), NPP influence spending, and whip directives: who can use them and how.",
    content: partyActionsContent,
    category: "parties",
    extraTags: ["gotv", "chair"],
    difficulty: "intermediate",
    contentType: "guide",
    estimatedReadTime: 6,
  },
  {
    slug: "party-slate",
    designDocUrl: "design/party-slate.html",
    title: "Party Slate",
    description:
      "The Slate board where party chairs assign players and NPPs to races: who can assign, the 3 candidate slots per race, and when an NPP accepts.",
    content: partySlateContent,
    category: "parties",
    extraTags: ["slate", "chair", "npp", "candidates"],
    difficulty: "intermediate",
    contentType: "mechanics",
    estimatedReadTime: 5,
  },
  {
    slug: "coalitions",
    title: "Coalitions",
    description:
      "Cross-party alliances, their US chamber leadership effects, and how coalition membership differs from party membership.",
    content: coalitionsContent,
    category: "parties",
    extraTags: ["bloc", "majority"],
    designDocUrl: "design/coalitions.html",
    difficulty: "intermediate",
    contentType: "guide",
    estimatedReadTime: 5,
  },
  {
    slug: "coalition-formation",
    designDocUrl: "design/coalitions.html",
    title: "Coalition Formation",
    description:
      "How to create a coalition, invite or join parties, manage chair succession, and run disband votes.",
    content: coalitionFormationContent,
    category: "parties",
    extraTags: ["bloc", "majority"],
    difficulty: "intermediate",
    contentType: "guide",
    estimatedReadTime: 6,
  },
  {
    slug: "npps-overview",
    title: "NPPs Overview",
    description:
      "What Non-Player Politicians are, how they fill seats, their basic stats and personality traits, and why they matter strategically.",
    content: nppsOverviewContent,
    category: "parties",
    extraTags: ["npp"],
    designDocUrl: "design/npp-system.html",
    difficulty: "beginner",
    contentType: "guide",
    estimatedReadTime: 6,
  },
  {
    slug: "npp-behavior",
    designDocUrl: "design/npp-system.html",
    title: "NPP Behavior",
    description:
      "How NPPs vote on bills, elect Speakers and leaders, respond to whip directives, and how personality traits shape their decisions.",
    content: nppBehaviorContent,
    category: "parties",
    extraTags: ["npp", "whip"],
    difficulty: "advanced",
    contentType: "reference",
    estimatedReadTime: 8,
  },
  {
    slug: "npp-elections",
    designDocUrl: "design/npp-system.html",
    title: "NPP Elections",
    description:
      "How NPPs enter primaries and generals, the 50% primary score penalty when players compete, dropout mechanics, and how to beat NPPs.",
    content: nppElectionsContent,
    category: "parties",
    extraTags: ["npp", "primary"],
    difficulty: "intermediate",
    contentType: "guide",
    estimatedReadTime: 7,
  },
  {
    slug: "npp-autonomy",
    designDocUrl: "design/npp-system.html",
    title: "NPP Autonomy",
    description:
      "Graduated smarter-NPP levels (v0-v3): bill sponsorship, executive formation, ministerial governance, and comingle tiers for player countries.",
    content: nppAutonomyContent,
    category: "parties",
    extraTags: ["npp"],
    difficulty: "advanced",
    contentType: "reference",
    estimatedReadTime: 7,
  },
];
