import {
  INTERNATIONAL_ORGANIZATION_ORDER,
  INTERNATIONAL_ORGANIZATIONS,
} from "@/lib/constants/internationalOrganizations";

const builtInOrgs = INTERNATIONAL_ORGANIZATION_ORDER.map((id) => INTERNATIONAL_ORGANIZATIONS[id]);
const builtInCount = builtInOrgs.length;
const builtInListProse = builtInOrgs.map((o) => o.shortName).join(", ");

const builtInTableRows = builtInOrgs
  .map((o) => `| **${o.shortName}** (${o.name}) | ${o.description} |`)
  .join("\n");

export const internationalOrganizationsContent = `# International Organizations

A trade deal, a sanction or a call to arms only happens here if enough other countries say yes, and silence counts as no. International organizations are blocs of countries that vote together. Through them a country can sign free trade agreements, impose sanctions, send aid, issue joint statements, raise a military alert, and, for blocs, call members into war. They reach beyond one country's laws, and members share trade bonuses and obligations. The game ships with ${builtInCount} built-in organizations (${builtInListProse}), and players can found their own.

## Organizations and their ballots

Every organization has members, a leader, a charter, a category and a treasury. Which actions it can take depends on its category. Members vote on each action in a ballot that stays open for **24 turns**.

### Built-in organizations

| Organization | Description |
| --- | --- |
${builtInTableRows}

These ${builtInCount} are in the catalogue. Founding and dissolution years decide which exist in a given world, and each world seats its own founding members.

### What each category can do

| Category | Resolutions it can table |
| --- | --- |
| Political | Agency funding, joint statements, aid packages |
| Economic | Directives, free trade agreements, sanctions, aid packages |
| Security | Alert posture, joint statements |
| Development | Aid packages, free trade agreements |
| Bloc | Alert posture, joint statements, aid, sanctions, war declarations, conflict entry |

Every category can also set member dues. NATO and the Warsaw Pact are Security alliances in general, and Blocs in worlds that begin in the Cold War.

### Who must say yes

The threshold is counted against everyone entitled to vote, not against who turned up. Abstaining or never voting counts as a no.

| Ballot | Needs | Who votes |
| --- | --- | --- |
| Admitting a member | Every voter | Player-run members |
| Declaring war, or entering a conflict at the bloc's call | Every voter | Player-run members |
| Free trade agreement | Every named party | Only the countries named in the agreement |
| Everything else (sanctions, directives, aid, dues, posture, statements, agency funding, leadership) | More than half | All voting members |

The UN adds a veto: its founding members (US, UK, Germany and Japan) can each block a majority ballot by voting no. Client states are bound by what their bloc decides but do not vote. Countries nobody plays vote on their own, and a failed resolution is written to the country's history.

### A five-country vote

Five countries sit in an Economic organization: A, B, C, D, E. A and B want an FTA.

- The ballot is open 24 turns. Only A and B vote, because only they are named. Both must say yes. C, D and E have no say and are not affected.
- A sanctions resolution against F needs more than half of the 5: at least 3 yeses. If 2 vote yes, 1 votes no and 2 stay silent, it fails, because silence counts as no.
- In the UN, a joint statement that gets 11 yeses out of 15 still fails if the US votes no.

### Key numbers

| Rule | Value |
| --- | --- |
| Voting window | 24 turns |
| Leadership term | 96 turns (2 game years); the Non-Aligned Movement chair serves 144 turns |
| Diplomatic actions per country | 4 per turn; proposing costs 1, voting is free |
| Org head: influence | +1.0 national influence per turn |
| Org head: agenda actions | +2 per turn, banked up to 4 |
| Sanctions | Last 48 turns |
| Dues | Voted by members, from 0% to 1% of GDP a year; the starting rate is 0.006% |
| Joint statement | Subject's approval +2 (endorse) or -3 (condemn) for 24 turns |
| Aid package growth boost | 0.05 x log10(amount) points of GDP growth, up to 0.5 |
| Alert posture: Reduced | Readiness -3, civil liberties +1.5 |
| Alert posture: Heightened | Readiness +3, civil liberties -1.5 |
| Alert posture: Article 5 | Readiness +6, civil liberties -3, GDP growth -0.4 |
| Tribute (1953 worlds): NATO | 0.5% of GDP a year from non-voting client members |
| Tribute (1953 worlds): Warsaw Pact | 0.75% of GDP a year from non-voting client members |

### Joint statements, aid and trade

A joint statement about a country shifts its approval for 24 turns, and aid and statements change a member's approval and growth (see [Government Approval](/wiki/government-approval)). Shared membership multiplies trade affinity by 1.25 and a free trade agreement by 1.6, so organizations feed directly into [International Trade](/wiki/trade-system). An FTA also sets the tariff between its parties to zero; see [Tariffs](/wiki/tariffs).

### Leadership

Each organization has a leadership office, elected when the term ends by a majority of the voting members. The Commonwealth, the Warsaw Pact and COMECON have a permanent leader instead: the head of government of the UK (Commonwealth) or Russia (the other two).

The head gets two personal benefits:

- **+1.0 national influence per turn**, added on top of your domestic position tier.
- **A personal agenda pool** of +2 agenda actions per turn, banked up to 4. They pay for resolutions you table inside the organization you lead. They are spent before your country's diplomatic budget, so a head who is not their country's foreign minister can still table them. Joining, leaving, nominations and war resolutions stay on the country's budget.

### Joining and leaving

Joining takes two yeses (and a [Bloc Alignment & Spheres of Influence](/wiki/bloc-spheres) share of 60 or more allows joining, while 40 or less flags a member as heading out): the organization's members must admit you in a membership ballot, and your own legislature must pass the Join bill. If either fails, the other is cancelled. Joining a Cold War bloc removes you from its rival and commits a country to that alignment pole (see [Bloc Spheres](/wiki/bloc-spheres)). Leaving goes through a withdrawal bill in your legislature.

### Mutual defence

An organization can bind its members to defend each other in two ways:

- **Article 5.** Any Security or Bloc organization whose members vote the Article 5 alert posture.
- **A standing charter.** NATO and the Warsaw Pact in worlds that begin in the Cold War, at every posture.

Political, Economic and Development organizations never bind their members.

When a binding organization's member is declared on, every other member with a government enters on the defender's side. It is defensive only, so no chain of alliances forms. An ally stays out if it has a truce with the attacker, already fights the attacker, shares a bloc with the attacker, or already fought in this war and left it. Posture changes are checked every turn: raising the posture to Article 5 while a member is already under attack pulls the allies in on the next turn, and lowering it stops new entries without removing anyone already in. Full rules, and how a Bloc originates a new war, are on [Declaring War](/wiki/declaring-war).

### Custom organizations

The foreign minister of a country can found a new organization with a name, short name, id, description, charter, leadership title and category, at no fee. A Bloc also creates a new alignment pole in the founder's chosen colour, which the founder starts committed to. Bloc members can spend the pooled fund on influence, use aid to hold members, and risk defections when a member's alignment slips. Custom organizations vote, lead and legislate exactly like built-in ones.

## Using it as foreign minister

- **Open the page.** World, then International Organizations, then pick an organization to see members, leader, charter, active resolutions with live tallies, and history.
- **Table a resolution** as your country's foreign minister (see [Cabinet](/wiki/cabinet); the trade minister sets embargoes). It costs 1 diplomatic action, or 1 agenda action if you head that organization.
- **Vote** as foreign minister. Voting is free, on any open ballot your country is entitled to.
- **Apply to join or propose to leave** as foreign minister. Your legislature must also pass the bill.
- **Nominate a leadership candidate** as foreign minister when the term ends.
- **Found a custom organization** as foreign minister.

Tips:

- Count the roll before you table something, and remember the foreign minister has to cast the vote. An abstaining member blocks a unanimous ballot as surely as a no.
- An FTA needs only its two parties, so you do not need the whole organization to agree.
- Lead an organization to get the influence and agenda actions even when you hold no other international office.

Live in every world. Which organizations exist depends on the era: the EU is founded in 1993, the Warsaw Pact runs from 1952 to 1991, COMECON from 1949 to 1991, and the Non-Aligned Movement from 1961. NATO and the Warsaw Pact act as Blocs only in worlds that begin in the Cold War, and tribute from non-voting clients applies only in worlds that begin in 1953. Last checked 2026-10-29, version 1.18.0. Exact rules: [Bloc Alignment and Spheres (design)](https://docs.lakesidegames.net/design/bloc-alignment-and-spheres.html). Ballot and ratification rules are described on this page and on [Declaring War](/wiki/declaring-war).
`;
