export const billsLegislationContent = `# Bills & Legislation

Filing a bill costs 10 action points and up to 30 [national influence](/wiki/glossary) (NPI), and you only get them back if the bill becomes law. Most bills do not. A bill that dies at the second chamber or under a veto has spent your resources for nothing, so know the route, the cost and who will vote before you file.

## What a bill costs

| Item | Value |
| --- | --- |
| Action points to propose | 10 |
| NPI per provision | 5 for the 1st, 10 for the 2nd, 15 for the 3rd (30 for three) |
| Provisions per bill | 1 to 3 |
| Voting window per chamber | 24 hours |
| Presidential window | 10 hours, then auto-sign |
| Veto override | Two-thirds of the seated members of each chamber |
| Filibuster (US Senate) | 25 AP and 5 Political Influence, about 12 hours added |
| Time to comply with a tightened subsidiary or foreign-investment limit | 48 turns |

\`\`\`wiki-chart
bill-provision-cost
\`\`\`

Tariff provisions cost action points only, no NPI.

The NPI ladder makes omnibus bills expensive, the one-bill rule stops one sponsor flooding the floor, and the 10 hour presidential window stops a silent president from blocking the legislature.

## From filing to law

1. **File the bill** from the Congress or Parliament page. It is open for voting at once.
2. **Chamber vote.** Members vote For, Against or Abstain for 24 hours (the mechanics are on [Voting & Whips](/wiki/voting-and-whips)). Ordinary bills need a simple majority. Nationalization, privatization and war declarations need two-thirds of For plus Against in each required chamber.
3. **Second chamber** (bicameral countries). In a sequential flow a fresh 24 hour vote opens in the second chamber. Some countries vote in both chambers at once. Unicameral countries skip this step. In the US Senate, a [filibuster](/wiki/cloture-and-filibuster) lengthens this vote and raises the passing bar.
4. **Executive action.** In presidential systems the president has 10 hours to sign or veto. No action means the bill is signed automatically. A veto goes to an override vote that needs For votes from two-thirds of the seated members of each chamber, not two-thirds of votes cast, so abstentions and absent members count against the override. Vacant seats are not counted. Parliamentary executives have no ordinary veto: the bill becomes law once the chamber and cabinet stages finish.
5. **Enactment.** Each provision applies its policy effects every turn from then on (see [Policy Effects](/wiki/policy-effects)), and your proposal costs are refunded (action points only up to your action cap).

![Flow of a bill from filing through two chamber votes to presidential sign or veto and override, or the parliamentary cabinet stage, ending in enactment.](/wiki-images/diagrams/bills-legislation-bill-lifecycle.svg)

\`\`\`guide-screenshot
legislature
\`\`\`

*The House bills tab. The tabs separate all bills from those still voting, those awaiting presidential action, signed bills, and failed bills. Each card shows the live count and the closing countdown.*

Non-player politicians vote on every open bill automatically, summing ideology, whip, party line, district and donor pressure (see [NPPs Overview](/wiki/npps-overview) and [npp-behavior](/wiki/npp-behavior)), so a chamber can usually be read before you file.

### A three-provision healthcare bill

You file a three-provision healthcare bill in a bicameral presidential country. It costs 10 AP plus 5 + 10 + 15 = 30 NPI. Hour 0 to 24: House vote. Hour 24 to 48: Senate vote. Hour 48 to 58: president's window. If the president does nothing, the bill is signed at hour 58, about two and a half real days after filing, and the 10 AP and 30 NPI come back to you. A one-provision version costs 10 AP and 5 NPI and gives opponents less to object to.

## Filing a bill

- **Propose a bill** (any sitting member of a chamber that can originate it). The composer only offers chambers and categories your country has. Appointed chambers such as the Bundesrat and the House of Lords cannot originate bills. State bills use the same composer and the state governor signs them.
- **Vote** on any open bill in your chamber.
- **Whip** your party before the vote, if you hold a whip role.
- **Withdraw** your own bill early.
- **Sign or veto** if you are the president. **Override** a veto if you hold a seat.
- **Co-sponsor** another member's bill, or remove your co-sponsorship.

![Guided legislative proposal dialog on the Congress page with the by domain, by metric and custom bill choices](/wiki-images/screens/bills-legislation-bill-composer.webp)

![Bill page with a floor vote semicircle and the legislative timeline](/wiki-images/screens/bills-legislation-bill-page.webp)

Tips: count the chamber before you file; propose in the chamber where you are strongest; keep provisions few.

### Who can file, and when

| Rule | Detail |
| --- | --- |
| One bill at a time | You may file another once your earlier bill clears its first chamber. In a one-chamber legislature you wait until it finishes. |
| No government | If a parliamentary country has no seated PM, Chancellor or Taoiseach, new bills are blocked and active bills pause until a government forms. |
| Banned parties | In a one-party state, such as China, the Soviet Union or East Germany, a delegate's party must be legal to propose. |
| Unplayed countries | An autonomous government files and moves bills itself so the country is not frozen. |

The "no government" rule applies until [Government Formation](/wiki/government-formation) seats a head of government, and after a passed [no-confidence motion](/wiki/no-confidence-votes) removes the PM: bills stay frozen until a new PM is seated. In [one-party states](/wiki/one-party-states) banned parties cannot propose or vote, and the bill route is simpler.

## What a bill can contain

Every bill has one category: agriculture, custom, defense, economy, education, environment, foreign policy, healthcare, immigration, industry, infrastructure, public safety, social, state ownership, tax, technology or trade. The category decides which provisions you can attach. Custom bills are flavor and roleplay and carry no policy provisions.

Provision kinds: policy options (the standard kind), tariffs (trade bills), subsidies and end-subsidy repeals (industry bills), embargoes and embargo repeals, nationalize, privatize and designate strategic sector (state ownership bills), union laws, electoral laws (voting age and registration), central-bank independence, declarations of war (two-thirds in every chamber), international-organization join resolutions, UK Budget bills (the Chancellor's yearly bill, or the Prime Minister's if there is no Chancellor), US state redistricting laws (see [US House Redistricting](/wiki/us-house-redistricting)), and three economic laws below.

Several of these reach into other systems:

- A bill is the only way to start or end a [subsidy](/wiki/subsidies), and a tariff provision creates, changes or removes a [tariff](/wiki/tariffs).
- An embargo or end-embargo provision makes or removes a durable embargo (see [Embargoes & Trade Exposure](/wiki/embargo-and-trade-exposure)).
- A passed nationalization bill orders a Fair-tier taking (see [Nationalization & National Corporations](/wiki/nationalization)).
- A [declaration of war](/wiki/declaring-war) is a bill that needs two-thirds of votes cast in every chamber.
- Union-law provisions shift unionization drift and strike thresholds (see [unions](/wiki/unions)), and the minimum-wage law sets the floor on sector pay (see [Labour & Wages](/wiki/labour-and-wages)).
- The reserve-forces law level sets the conscription stance and so the manpower pool (see [manpower-conscription](/wiki/manpower-conscription)).
- State laws set who draws House maps and the compactness and fairness tiers.
- Chamber votes decide whether a [sovereign-default](/wiki/sovereign-default) crisis resolution passes.
- A passing [referendum](/wiki/referendums) creates the Westminster consent bill (and a Dail bill for Northern Ireland); enacting the consent bills lets a later referendum transfer the region.
- A divergent [Supreme Court](/wiki/scotus) ruling on a docket case can enact policy through the bill pipeline.

Each policy provision pairs a legislation type with a policy option placed on an economic axis (left spends more, right spends less) and a social axis (progressive to conservative). Income tax is split into low, medium and high income provisions with their own rates.

### The three economic laws

These national bills change a law level rather than a metric.

| Law | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |
| --- | --- | --- | --- | --- | --- |
| **Competition Act** | No review | Review at 75% of a national industry | Review at 60% | Review at 50%, breakups allowed | Review at 40%, breakups allowed |
| **Subsidiary Limits Act** | No limit | 12 subsidiaries | 8 | 5 | 3 |
| **Foreign Investment Act** | Open | Screening of new foreign-controlled holdings | Foreign groups capped at 25% of an industry | Capped at 10% | Foreign-controlled subsidiaries banned |

A group caught by a tightened limit has 48 turns to give up control, then its controlling stake is sold down to half at book value on the equity market. A breakup case stays open six turns. These acts change what corporate groups may own; see [Corporations](/wiki/corporations#merger-review).

## When a bill fails

A bill that fails, is vetoed without an override, or is withdrawn gets **no refund**. The refund happens only when the bill is enacted. You can withdraw your own bill only while it is still \`proposed\` or in its first \`active\` vote.

| Failure point | What you can do |
| --- | --- |
| Proposal rejected (not enough AP, NPI, eligibility or open chamber) | Check the cost preview and your office first. |
| First chamber vote fails | Whip earlier, narrow the provisions, negotiate before filing. |
| Second chamber fails | Build the second chamber majority before you file. |
| Cabinet stage (countries that use one) | Check your country's flow. |
| Veto not overridden | The bill is dead. File a narrower one. |
| State budget cannot fund it | Cut the cost or move it to the national budget. |

## After a bill passes

### The budget gate

- **National bills** record their cost against the federal budget. They are not blocked, but breaching the debt ceiling can arm a debt-ceiling crisis (see [National Budget](/wiki/national-budget)).
- **State bills** are stricter: if the state budget cannot fund the bill, it is rejected at signature or auto-sign even after the legislature passed it.
- **Subsidy, tariff and budget bills** change the fiscal ledger directly, and the last enacted instrument wins.

### Approval changes

Legislators who voted For an enacted bill see approval move among census groups (see [Government Approval](/wiki/government-approval)). For each group the change is the policy shift, times how strongly the group leans on that policy, times 0.15, times a boldness factor (0.5 for a centrist option up to 1.5 for an extreme one), capped at 10 points per bill. A bold move to the right on education raises approval among groups that lean right on education and lowers it among groups that lean left.

### Metric effects

Enacted laws move state metrics every turn (see [National Metrics](/wiki/national-metrics)). The per-turn ticks of a national bill are split across regions: a US federal bill applies one fiftieth in each state, a UK bill one twelfth per region, Japan one eighth and Germany one sixteenth. The pull on each metric's long-run target uses the same fixed national share in every country, so a national law is equally strong whatever the number of regions. See [Policy Effects](/wiki/policy-effects).

Live in every world that has a national legislature. The chambers, executive step and any cabinet stage depend on the country and era. Single-party states use their own restricted route. Bills go straight from filing to the floor vote; there is no committee stage (see [Committees](/wiki/committees)).

Last checked 2026-10-29, version 1.18.0. Exact rules: [Bills & legislation design doc](https://docs.lakesidegames.net/design/bills-legislation.html)
`;
