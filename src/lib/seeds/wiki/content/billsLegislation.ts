export const billsLegislationContent = `# Bills & Legislation

Most laws in A House Divided start as bills drafted by sitting national legislators. The route after proposal depends on the country's configured legislature and government type: unicameral bills need one chamber, bicameral bills need two, and only presidential systems send ordinary bills to an executive signature or veto stage.

## Who can propose bills

The general rule: any sitting member of a chamber that can originate the bill may propose it. The bill composer only offers the chambers your country actually has. If a chamber is appointed, such as the Bundesrat or the House of Lords, players cannot introduce there; the elected chamber does the work.

| Scope | Who can propose |
| --- | --- |
| National, lower chamber | Any sitting member of the House, Commons, Shūgiin, Bundestag, Dáil, Chamber of Deputies, NPC, Supreme Soviet, Volkskammer, or the country's equivalent. |
| National, upper chamber | Any sitting member of the Senate, Sangiin, or the country's elected upper house, where the constitution lets that chamber originate bills. |
| State or regional | Any sitting member of that state's legislature. State bills use the same composer, but the state governor signs or auto-signs them. |
| Restricted systems | China, Russia, and East Germany require the delegate's party to be legal. A banned party's delegates cannot propose. |
| Unplayed countries | The autonomous government sponsors and moves national bills through the full lifecycle, so the country is not frozen. |
| Admins | Admins can propose from any country and are exempt from proposal costs. |

## Bill structure

Every bill requires:

- **A category**: agriculture, defense, economy, education, environment, foreign policy, healthcare, immigration, industry, infrastructure, public safety, social, tax, technology, or trade. The category controls which legislation types can appear as provisions.
- **One to three provisions**: each provision is a legislation type (e.g., "Minimum Wage", "Income Tax") paired with a policy option that defines its ideological direction. Bills are capped at three provisions total.

### Provision types

Bills can contain the following kinds of provisions:

1. **Policy provisions**: the standard legislation type + policy option that changes national or state metrics. Most categories use these.
2. **Tariff provisions** (trade bills only): set import tariffs scoped to an entire economy, a specific sector, an origin country, or a single corporation.
3. **Subsidy provisions** (industry bills only): direct government subsidies to an economy-wide sector or a specific industry.
4. **End subsidy provisions**: repeal an existing subsidy.
5. **Embargo provisions**: enact a durable trade embargo against a target country (by commodity or all trade).
6. **End embargo provisions**: repeal an existing trade embargo.
7. **Nationalize provisions**: transfer corporate assets or an entire sector to state ownership.
8. **Privatize provisions**: spin state-owned assets out into a new private corporation (IPO or auction).
9. **Designate strategic sector provisions**: mark a sector as strategically vital, arming nationalization triggers.
10. **Union-law provisions**: set collective-bargaining bias, ban unions, or repeal a ban.
11. **Electoral-law provisions**: change voting age and voter-registration access.
12. **Central-bank independence provisions**: grant or revoke independence where the bank is not shared across countries.
13. **Declare-war provisions**: created through the executive foreign-policy flow and requiring two-thirds support in every chamber.
14. **Join-conflict provisions**: created from a passed international-organization resolution, not from the ordinary bill composer. Autonomous governments file and ratify these themselves.
15. **Budget bills** (UK): the Chancellor's annual Budget bundles real tax rates and statutory programme levels into one Commons confidence vote, sharing the same fiscal ledger as ordinary Acts, so a later Act or a later Budget controls the setting. If no Chancellor is appointed, the Prime Minister may table it.
16. **Redistricting laws** (US states): the State Redistricting Authority, District Compactness and Electoral Fairness Acts, proposable in state legislatures. See [US House Redistricting](/wiki/us-house-redistricting).
17. **Competition Act provisions**: set the country's merger-review threshold and whether the authority may order breakups.
18. **Subsidiary Limits Act provisions**: cap how many subsidiaries one corporate group may run in the country.
19. **Foreign Investment Act provisions**: screen, cap, or ban foreign-controlled ownership.

The last three are national-only economic bills. They change a mechanical law level rather than a metric, and they are available in every era.

### The three economic laws

| Law | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |
| --- | --- | --- | --- | --- | --- |
| **Competition Act** | No review | Review at 75% of a national industry | Review at 60% | Review at 50%, breakups allowed | Review at 40%, breakups allowed |
| **Subsidiary Limits Act** | No limit | 12 subsidiaries | 8 subsidiaries | 5 subsidiaries | 3 subsidiaries |
| **Foreign Investment Act** | Open | Screening for new foreign-controlled subsidiaries and acquisitions | Foreign groups capped at 25% of a national industry | Capped at 10% | Foreign-controlled subsidiaries banned |

A group caught by a tightened subsidiary or foreign-investment limit has **48 turns** to sell or spin off the excess. After that the excess is sold at auction. A competition breakup case stays open for **six turns** while the authority decides whether to order a sale or dismiss it. See [Corporations](/wiki/corporations#merger-review) for how the review works in practice.

### Proposal costs

Proposing a bill costs **10 action points** plus national influence for each provision:

| Provision | NPI cost |
| --- | --- |
| 1st | 5 national influence |
| 2nd | 10 national influence |
| 3rd | 15 national influence |

Tariff provisions do **not** cost national influence: only action points.

Your action and national influence balances are shown in the bill proposal form before you submit. If the bill is eventually enacted, both the action points and NPI spent are refunded to the sponsor.

### Policy options and the dual-axis grid

Each legislation type has policy options ranked on two axes:

- **Economic axis**: negative = left (more spending/redistribution), positive = right (less spending/free market)
- **Social axis**: negative = progressive, positive = conservative

US tax types use a bracketed scale. All other types use a 7-option scale (3 left, 1 center, 3 right). The option you select determines what happens to national metrics when the bill is signed.

Income tax is split into three provisions by income group: Low Income, Medium Income and High Income, each with its own rate.

## Bill guards

The system enforces several hard constraints on bill proposals:

- **One first-chamber bill per sponsor**: in a bicameral system, the sponsor may propose another bill once the earlier bill clears its first chamber. Unicameral sponsors remain limited to one active bill through completion.
- **Pending parliamentary government**: if the government has no seated PM, Chancellor, or Taoiseach, all new proposals are blocked and active bills pause until formation completes.
- **Whip cooldown**: after a whip directive is issued, a cooldown period applies before another can be sent to the same target.
- **NPP catch-up**: every turn, the system ensures NPPs that gained seats after a bill opened still vote before it closes.

## The bill lifecycle

Bills move through a strict status pipeline managed automatically by the turn processor each hour.

\`\`\`guide-screenshot
legislature
\`\`\`

*The Senate bills tab. The tabs separate all bills from those still voting, those awaiting presidential action, signed bills, and failed bills. Each card shows the live count and the closing countdown.*

| Status | Meaning |
| --- | --- |
| \`proposed\` | Drafted but not yet active (used for some internal flows) |
| \`active\` | Voting open in the origin chamber (24-hour window) |
| \`active_other\` | Voting open in the second chamber (24-hour window) |
| \`passed_origin\` | Cleared the origin chamber in a concurrent or staged country flow |
| \`active_both\` | Both configured chambers are voting concurrently |
| \`enrolled\` | Cleared the legislature and awaiting presidential action where required |
| \`signed\` | Executive signed: bill is law |
| \`vetoed\` | Executive vetoed the bill |
| \`veto_override\` | Veto overridden by legislature: bill becomes law |
| \`override_failed\` | Override vote failed: bill dies |
| \`cabinet_review\` | Under cabinet review in a country flow that uses that stage |
| \`filibustered\` | Legacy parked status; current US invocations are recorded while the Senate vote remains open |
| \`failed\` | Failed a chamber vote or pocket-expired |
| \`withdrawn\` | Sponsor withdrew before voting opened |

### Step 1: Proposal

Submit the bill from the Congress or Parliament page. On submission, the bill immediately enters \`active\` status with a 24-hour voting window. There is no cooldown before a bill becomes active.

### Step 2: chamber vote or votes

While voting is open, members can vote For, Against, or Abstain and can change their vote before the deadline. Each vote you cast personally can shift your own positions by up to 0.25 per axis toward (Aye) or away from (Nay) the bill, once per bill; the buttons show the exact move (see [Voting & Whips](/wiki/voting-and-whips)). Ordinary bills use a simple majority. Nationalization, privatization, and declarations of war require two-thirds of For plus Against in each required chamber.

### Step 3: second chamber

In a sequential bicameral flow, passage opens a fresh vote in the second chamber. Some country configurations vote in both chambers concurrently. Unicameral countries skip this step.

### Step 4: executive action

In presidential systems, a bill that clears every required chamber is \`enrolled\`. The president has 10 hours to sign or veto. If no action is taken within 10 hours, the bill is **automatically signed**.

A veto sends the bill back for an override vote. The override requires **two-thirds of seats**, not two-thirds of votes cast. Vacancies and abstentions do not lower the bar. If the override fails, the bill dies; if it passes, the bill becomes law without the president's signature.

Parliamentary executives do not receive an ordinary bill veto. Their bills enact after the configured chamber and cabinet stages complete. International-organization membership bills can also skip presidential action under their special lifecycle.

### US Senate filibuster

Any seated US Senator may invoke a filibuster while a bill is actively before the Senate, unless Senate rules have abolished it. The action costs **25 AP and 5 NPI**, extends the vote by about 12 hours with a Statecraft adjustment, and can be invoked once per Senator per bill. A filibustered Senate vote passes only when For reaches **three-fifths of For + Against + Abstain**. Members who never vote are excluded, but abstentions raise the threshold.

## How NPPs vote

Non-Player Politicians (NPPs) vote on every bill automatically. Their votes are determined by a **cross-pressure model** that weighs four forces:

- **Ideology**: alignment between the NPP's policy positions and the bill's direction
- **Whip**: party and caucus whip directives
- **District**: the demographics of the NPP's home state or region
- **Donors**: corporate and interest-group alignment

The four forces are summed into a single score. If the total is strongly positive the NPP votes For; strongly negative means Against; near-zero produces Abstain.

- NPP blocs holding multiple seats contribute their full seat-count weight.
- A catch-up run every turn ensures NPPs that gained seats after a bill opened still vote before it closes.

For full details on whip mechanics and the force model, see [Voting & Whips](/wiki/voting-and-whips).

## What happens when a bill is signed

### Metric effects

Each provision applies its policy effects to state or national metrics. Federal US bills divide their effect by 50 (one per state); UK national bills divide by 12 (one per region). Effects apply each turn the policy is active; see [Policy Effects](/wiki/policy-effects) for the full math.

### The budget gate

A bill is not automatically affordable just because it passed.

- **National bills** record their cost against the federal budget. Validation is advisory: an enacted national bill is not blocked, but a breach of the debt ceiling can arm a debt-ceiling crisis.
- **State bills** are stricter. If the state budget cannot fund the bill, the enactment gate rejects it at signature or auto-sign time. A bill that passed the legislature can still fail here.
- **Subsidy, tariff, and budget bills** change the fiscal ledger directly. A later Act or Budget can replace an earlier setting, so the last enacted instrument controls.

If you are sponsoring an expensive programme, check the budget before you spend the NPI. A bill that cannot be funded is a wasted legislative cycle.

### Archetype approval for legislators

Legislators who voted **For** the enacted bill receive demographic archetype approval changes based on how far the policy shifted on each axis:

- \`impact = shift × affinity × 0.15 × positionMultiplier\`, clamped to ±10 per bill
- The \`positionMultiplier\` is higher for extreme options (1.5 at the far ends) and lower for centrist ones (0.5 at the center), so bold shifts create stronger reactions.
- A bill moving education policy two steps rightward gives evangelicals (affinity +35) roughly +10 approval and public-sector archetypes (affinity −40) roughly −10 approval.

## Bicameral strategy

### Building votes

You need majorities in both chambers plus executive support. Strategies:

1. **Whip allies before the vote.** Use whip directives to push your party's members. See [Voting & Whips](/wiki/voting-and-whips).
2. **Propose in your stronger chamber first.** If you have a House majority but shaky Senate support, introduce in the House so momentum builds before the Senate vote.
3. **Keep provisions focused.** Each extra provision adds national influence cost and gives opponents more to vote against. A narrow one-provision bill is easier to pass than a three-provision omnibus.

### Parliamentary differences

In parliamentary countries (UK, JP, DE), the lower chamber (Commons, Shūgiin, or Bundestag) does most of the legislative work. The upper chambers (Lords, Sangiin) can also vote on bills; the Bundesrat is appointed by Land governments, and players cannot interact with it directly. If the government has no PM/Chancellor seated (including the window after a successful no-confidence vote or a snap dissolution), legislation is fully frozen: no new bills can be proposed and active bills stay in place until the freeze lifts.

## Where a bill dies

Most bills do not become law. Knowing the failure points saves actions and NPI.

| Failure point | What happened | What you can do |
| --- | --- | --- |
| Proposal rejected | You lacked the actions, NPI, eligibility, or an open chamber. | Check the cost preview and your office before submitting. |
| First chamber | The vote failed, or the bill was withdrawn. | Whip earlier, narrow the provisions, or negotiate before the vote opens. |
| Second chamber | The first chamber passed, but the second did not. | Build a second-chamber majority before you start. Sequential flows give you time. |
| Cabinet or committee stage | The country's flow parked the bill and it did not clear. | Check the country's lifecycle. Not every system has this stage. |
| Presidential veto | The executive rejected the bill. | An override needs two-thirds of seats, not votes cast. |
| Override failed | The override did not reach two-thirds of seats. | The bill is dead. Start a new bill with a narrower scope. |
| Pocket expiry | The executive neither signed nor vetoed inside 10 hours. | This signs the bill automatically, so it is not a failure. |
| Budget gate | The state could not fund the bill at enactment. | Reduce the cost, pass a funding bill first, or move the programme to the national budget. |

## Sponsor checklist

- [ ] You are a sitting member of a chamber that can originate this bill.
- [ ] You have 10 actions and the NPI for every provision you selected.
- [ ] The bill has no more than three provisions, and every provision fits the category.
- [ ] You know which chamber votes first and whether the flow is sequential or concurrent.
- [ ] You have the votes, not just the argument. Count the chamber before you file.
- [ ] You have checked the whip situation and any cooldown on your party's whips.
- [ ] You have checked the budget, especially for a state bill with a real cost.
- [ ] You know what happens after passage: signature, auto-sign, cabinet stage, or referendum.

## A realistic time budget

A simple bill in a bicameral presidential system can take two to three real days from filing to law: 24 hours in the first chamber, 24 hours in the second, and up to 10 hours for executive action. Concurrent chambers shorten that. A filibuster adds about 12 hours to the Senate stage. Plan your NPI and your political capital around the whole pipeline, not just the first vote.

## Viewing bills

Every bill has a detail page at \`/congress/bills/[id]\` showing:

- A timeline stepper from proposal through enactment
- Live vote bars (For / Against / Abstain percentages) for both chambers
- A live countdown timer while voting is open
- The presidential action panel (Sign / Veto), visible only to the executive

## Related pages

- [Voting & Whips](/wiki/voting-and-whips): Whip directives, how party discipline works, how to influence NPP votes
- [Policy Effects](/wiki/policy-effects): How signed bills change national and state metrics each turn
- [Congress Leadership](/wiki/congress-leadership): Speaker, floor leaders, how leadership shapes the legislative agenda
- [Committees](/wiki/committees): National party committees now; committee-stage bill flow is not live
- [Government Formation](/wiki/government-formation): Parliamentary government status and the legislation freeze
`;
