export const billsLegislationContent = `# Bills & Legislation

A bill is how a sitting legislator changes the law. You draft it, pay a cost, the chamber (or chambers) vote over about a day each, and in presidential countries the president signs or vetoes. Most bills never become law, so knowing the route and the cost before you file saves actions and [national influence](/wiki/glossary) (NPI).

## How it works

1. **File the bill** from the Congress or Parliament page. It is open for voting at once.
2. **Chamber vote.** Members vote For, Against or Abstain for 24 hours. Ordinary bills need a simple majority. Nationalization, privatization and war declarations need two-thirds of For plus Against in each required chamber.
3. **Second chamber** (bicameral countries). In a sequential flow a fresh 24 hour vote opens in the second chamber. Some countries vote in both chambers at once. Unicameral countries skip this step.
4. **Executive action.** In presidential systems the president has 10 hours to sign or veto. No action means the bill is signed automatically. A veto goes to an override vote that needs two-thirds of all seats, not two-thirds of votes cast, so vacancies and abstentions do not lower the bar. Parliamentary executives have no ordinary veto: the bill becomes law once the chamber and cabinet stages finish.
5. **Enactment.** Each provision applies its policy effects every turn from then on (see [Policy Effects](/wiki/policy-effects)), and your proposal costs are refunded.

![Flow of a bill from filing through two chamber votes to presidential sign or veto and override, or the parliamentary cabinet stage, ending in enactment.](/wiki-images/diagrams/bills-legislation-bill-lifecycle.svg)

\`\`\`guide-screenshot
legislature
\`\`\`

*The House bills tab. The tabs separate all bills from those still voting, those awaiting presidential action, signed bills, and failed bills. Each card shows the live count and the closing countdown.*

### Key numbers

| Item | Value |
| --- | --- |
| Action points to propose | 10 |
| NPI per provision | 5 for the 1st, 10 for the 2nd, 15 for the 3rd (30 for three) |
| Provisions per bill | 1 to 3 |
| Voting window per chamber | 24 hours |
| Presidential window | 10 hours, then auto-sign |
| Veto override | Two-thirds of all seats |
| Filibuster (US Senate) | 25 AP and 5 NPI, about 12 hours added |
| Time to comply with a tightened subsidiary or foreign-investment limit | 48 turns |

\`\`\`wiki-chart
bill-provision-cost
\`\`\`

Tariff provisions cost action points only, no NPI.

### Worked example

You file a three-provision healthcare bill in a bicameral presidential country. It costs 10 AP plus 5 + 10 + 15 = 30 NPI. Hour 0 to 24: House vote. Hour 24 to 48: Senate vote. Hour 48 to 58: president's window. If the president does nothing, the bill is signed at hour 58, about two and a half real days after filing, and the 10 AP and 30 NPI come back to you. A one-provision version costs 10 AP and 5 NPI and gives opponents less to object to.

### What a failed bill costs

A bill that fails, is vetoed without an override, or is withdrawn gets **no refund**. The refund happens only when the bill is enacted. You can withdraw your own bill only while it is still \`proposed\` or in its first \`active\` vote.

### Why the limits exist

The NPI ladder makes omnibus bills expensive, the one-bill rule stops one sponsor flooding the floor, and the 10 hour presidential window stops a silent president from blocking the legislature.

## What you can do

- **Propose a bill** (any sitting member of a chamber that can originate it). The composer only offers chambers and categories your country has. Appointed chambers such as the Bundesrat and the House of Lords cannot originate bills. State bills use the same composer and the state governor signs them.
- **Vote** on any open bill in your chamber. See [Voting & Whips](/wiki/voting-and-whips).
- **Whip** your party before the vote, if you hold a whip role.
- **Withdraw** your own bill early.
- **Sign or veto** if you are the president. **Override** a veto if you hold a seat.
- **Co-sponsor** another member's bill, or remove your co-sponsorship.

Tips: count the chamber before you file; propose in the chamber where you are strongest; keep provisions few.

### Proposal rules

| Rule | Detail |
| --- | --- |
| One bill at a time | You may file another once your earlier bill clears its first chamber. In a one-chamber legislature you wait until it finishes. |
| No government | If a parliamentary country has no seated PM, Chancellor or Taoiseach, new bills are blocked and active bills pause until a government forms. |
| Banned parties | In China, Russia and East Germany a delegate's party must be legal to propose. |
| Unplayed countries | An autonomous government files and moves bills itself so the country is not frozen. |

### Categories and provisions

Every bill has one category: agriculture, custom, defense, economy, education, environment, foreign policy, healthcare, immigration, industry, infrastructure, public safety, social, state ownership, tax, technology or trade. The category decides which provisions you can attach. Custom bills are flavor and roleplay and carry no policy provisions.

Provision kinds: policy options (the standard kind), tariffs (trade bills), subsidies and end-subsidy repeals (industry bills), embargoes and embargo repeals, nationalize, privatize and designate strategic sector (state ownership bills), union laws, electoral laws (voting age and registration), central-bank independence, declarations of war (two-thirds in every chamber), international-organization join resolutions, UK Budget bills (the Chancellor's yearly bill, or the Prime Minister's if there is no Chancellor), US state redistricting laws (see [US House Redistricting](/wiki/us-house-redistricting)), and three economic laws below.

Each policy provision pairs a legislation type with a policy option placed on an economic axis (left spends more, right spends less) and a social axis (progressive to conservative). Income tax is split into low, medium and high income provisions with their own rates.

### The three economic laws

These national bills change a law level rather than a metric.

| Law | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |
| --- | --- | --- | --- | --- | --- |
| **Competition Act** | No review | Review at 75% of a national industry | Review at 60% | Review at 50%, breakups allowed | Review at 40%, breakups allowed |
| **Subsidiary Limits Act** | No limit | 12 subsidiaries | 8 | 5 | 3 |
| **Foreign Investment Act** | Open | Screening of new foreign-controlled holdings | Foreign groups capped at 25% of an industry | Capped at 10% | Foreign-controlled subsidiaries banned |

A group caught by a tightened limit has 48 turns to sell the excess, then it is auctioned. A breakup case stays open six turns. See [Corporations](/wiki/corporations#merger-review).

## After a bill passes

### The budget gate

- **National bills** record their cost against the federal budget. They are not blocked, but breaching the debt ceiling can arm a debt-ceiling crisis (see [National Budget](/wiki/national-budget)).
- **State bills** are stricter: if the state budget cannot fund the bill, it is rejected at signature or auto-sign even after the legislature passed it.
- **Subsidy, tariff and budget bills** change the fiscal ledger directly, and the last enacted instrument wins.

### Approval changes

Legislators who voted For an enacted bill see approval move among census groups. For each group the change is the policy shift, times how strongly the group leans on that policy, times 0.15, times a boldness factor (0.5 for a centrist option up to 1.5 for an extreme one), capped at 10 points per bill. A bold move to the right on education raises approval among groups that lean right on education and lowers it among groups that lean left.

### Metric effects

A federal US bill divides its effect by 50 (one share per state); a UK national bill by 12 (one per region). See [Policy Effects](/wiki/policy-effects).

## Where a bill dies

| Failure point | What you can do |
| --- | --- |
| Proposal rejected (not enough AP, NPI, eligibility or open chamber) | Check the cost preview and your office first. |
| First chamber vote fails | Whip earlier, narrow the provisions, negotiate before filing. |
| Second chamber fails | Build the second chamber majority before you file. |
| Cabinet stage (countries that use one) | Check your country's flow. |
| Veto not overridden | The bill is dead. File a narrower one. |
| State budget cannot fund it | Cut the cost or move it to the national budget. |

## Connections

**Driven by**

- [Voting & Whips](/wiki/voting-and-whips): votes and party whips decide whether a bill passes.
- [Cloture & Filibuster](/wiki/cloture-and-filibuster): a US Senate filibuster lengthens the vote and raises the passing bar.
- [Government Formation](/wiki/government-formation): with no seated head of government in a parliamentary country, bills freeze.
- [NPPs Overview](/wiki/npps-overview): non-player politicians vote on every bill automatically.
- [No-Confidence Votes](/wiki/no-confidence-votes): a passed motion removes the PM and freezes bills until a new PM is seated.
- [One-Party States](/wiki/one-party-states): banned parties cannot propose or vote, and the bill route is simpler.
- [Supreme Court](/wiki/scotus): a divergent ruling on a docket case can enact policy through the bill pipeline.
- [referendums](/wiki/referendums): a passing referendum creates the Westminster consent bill (and a Dail bill for Northern Ireland).
- [npp-behavior](/wiki/npp-behavior): NPP Behavior: NPPs vote on every open bill by summing ideology, whip, party line, district and donor forces.

**Affects**

- [Policy Effects](/wiki/policy-effects): an enacted bill starts moving national and state metrics.
- [National Budget](/wiki/national-budget): enacted costs count against the budget and can trigger a debt-ceiling crisis.
- [Government Approval](/wiki/government-approval): legislators who voted For see approval shift among population groups.
- [Corporations](/wiki/corporations): the Competition, Subsidiary Limits and Foreign Investment Acts change what corporate groups may own.
- [Embargoes & Trade Exposure](/wiki/embargo-and-trade-exposure): an embargo or end-embargo provision makes or removes a durable embargo
- [unions](/wiki/unions): Union-law provisions shift unionization drift and strike thresholds.
- [Labour & Wages](/wiki/labour-and-wages): Minimum-wage law sets the floor on sector pay.
- [sovereign-default](/wiki/sovereign-default): chamber votes decide whether a sovereign crisis resolution passes.
- [Nationalization & National Corporations](/wiki/nationalization): a passed nationalization bill orders a Fair-tier taking.
- [National Metrics](/wiki/national-metrics): Enacted laws push state metrics away from baseline every turn.
- [us-house-redistricting](/wiki/us-house-redistricting): state laws set who draws House maps and the compactness and fairness tiers.
- [referendums](/wiki/referendums): enacting the consent bills lets a passing referendum transfer the region.
- [declaring-war](/wiki/declaring-war): A declaration of war is a bill that needs two-thirds of votes cast in every chamber.
- [manpower-conscription](/wiki/manpower-conscription): The reserve-forces law level sets the conscription stance and so the manpower pool.
- [Subsidies](/wiki/subsidies): A bill is the only way to start or end a subsidy.
- [Tariffs](/wiki/tariffs): A bill with a tariff provision creates, changes or removes a tariff.

## Status

Live in every world that has a national legislature. The chambers, executive step and any cabinet stage depend on the country and era. Single-party states use their own restricted route (see [One-Party States](/wiki/one-party-states)). Bills go straight from filing to the floor vote; there is no committee stage (see [Committees](/wiki/committees)).

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules and the lifecycle by country: [Bills & legislation design doc](https://docs.lakesidegames.net/design/bills-legislation.html).
`;
