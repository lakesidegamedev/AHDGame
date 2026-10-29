export const onePartyStatesContent = `# One-Party States

Twelve countries run as one-party states: China (CN), the Soviet Union (RU), East Germany (DD), Poland (PL), Czechoslovakia (CS), Hungary (HU), Romania (RO), Bulgaria (BG), Yugoslavia (YU), Ukraine (UKR), Belarus (BLR) and the Baltics (BAL). One party, the **ruling party**, controls government. Other parties are tolerated or banned. The ruling party survives by keeping its own members confident in the leader and the public tolerant of the regime. If both slip far enough, the country can convert to a multi-party system.

## How it works

Each party carries a **regime status** that decides what it can do.

| Tier | Who | What it can do |
| --- | --- | --- |
| **Ruling** | The single party in government (CN: CCP; RU: CPSU; DD: SED) | Everything: forms government, fields executive candidates, proposes and votes on bills, forms coalitions, takes donations, holds cabinet seats |
| **Approved** | Tolerated minor parties (CN: CDL, CNDCA) | Holds seats, runs for legislative offices, proposes and votes on bills, takes donations, sits in cabinet. Cannot form government or field executive candidates |
| **Banned** | Outlawed parties; new player-created parties start here | Nothing: no candidates, bills, donations or cabinet seats. Existing seats are vacated at once and stay empty until the next regular election for that office |

The badge next to a party's name on its profile and on the parties list shows its tier.

### What changes compared with a parliamentary state

- **Government formation:** only the ruling party can form government. Losing a legislative majority does not collapse the government.
- **No-confidence vote:** only a ruling-party member can file one, and in China the generic motion is disabled.
- **Coalitions:** only the ruling party can create, invite or join one. Banned parties have no coalition role.
- **Snap elections:** not available by default.
- **Cabinet and executive offices:** banned parties cannot hold cabinet seats; only the ruling party can field a candidate for Premier or President.
- **Elections are weighted.** Votes are multiplied by the party's tier: ruling 3.0, approved 0.375, independent 0.0, banned 0.0. Independents count the same as banned parties, so a non-ruling player's route to power is limited to approved-party seats.

Most one-party legislatures have one chamber, where a bill passes by a majority of votes cast and takes effect with no assent delay. The Soviet Union's Supreme Soviet is the exception: a bill must clear both chambers and a rejection in the second kills it outright. The union republics (UKR, BLR, BAL) are single-chamber.

### Two scalars drive the regime

- **Popular Legitimacy** (starts at 75, range 0 to 100): how the public reads the regime. Driven by the economy, repression, policy alignment with the country's priorities and the credibility of elections.
- **Party Confidence** (starts at 75, range 0 to 95): how stable the ruling party is internally. Driven by intra-party bleed, policy alignment and a coupling from popular legitimacy.

Both get a small natural recovery each turn, slow enough that reforms stay meaningful.

### The four-stage escalation chain

The chain moves forward only. The regime must sit past a threshold for a number of turns before the next stage begins, so one bad turn never collapses a regime. Each stage offers the leader a decision. If the leader does nothing for 48 turns, the stage's default plays out.

| Stage | Name | Trigger |
| --- | --- | --- |
| 1 | Public Discontent | Popular legitimacy at 60 or below for 12 turns |
| 2 | Mass Unrest | Popular at 35 or below for 36 turns in a row, or 48 turns in total within a 168 turn window |
| 3 | Internal Challenge | Party confidence below 15 for 24 turns. A faction split fires and spawns a breakaway approved party |
| 4 | Forced Collapse | Popular below 15 for 72 turns, reachable only from Stage 3 |

### Key numbers: reforms

The ruling leader has five reform actions that trade party confidence for public standing.

| Action | Confidence | Popular | Per-turn boost | Cooldown |
| --- | --- | --- | --- | --- |
| Legalize a banned party | -6 | +8 | +0.2 for 120 turns | 168 turns per party |
| Reduce vote multipliers | -4 | +4 | +0.15 for 96 turns | 240 turns |
| Honest by-election | -3 | +5 | none | 96 turns |
| Anti-corruption purge | -2 | +3 | none | 72 turns |
| Constitutional amendment | -8 | +12 | +0.3 for 240 turns | once only |

Purges cost party confidence by severity: minor -2, regional -4, senior -7, faction -10, extreme -15. Anti-corruption purges are read by the public as a benefit, not repression. The Regime Health tab on the executive hub projects where each reform pushes the scalars before you spend it.

### Worked example: a 20 turn slide

Popular legitimacy falls to 55 and stays there. After 12 turns Stage 1 begins and the leader is offered a decision. The leader chooses to acknowledge and promise reform (-2 confidence, +3 popular, and the next reform costs half as much confidence). The leader then holds an honest by-election: its normal cost is 3 confidence, but the promise halves it, and it gives +5 popular. The action is then locked for 96 turns. Popular is back near 63, above the Stage 1 line, and the counters ease back one turn at a time. If the leader had ignored the decision, popular would have decayed 1.25 times faster for 24 turns and the regime would have ended up nearer Stage 2.

## What you can do

- **Ruling leader (Premier or equivalent):** use the five reforms, respond to stage decisions, order purges, or announce a constitutional convention (below).
- **Approved-party member:** hold seats, run for legislative offices, propose and vote on bills. A Regime Offers inbox surfaces open offers from the regime, such as seats reserved in a convention.
- **Founding a party:** a new party is marked banned when it is ratified. The charter page explains what it can and cannot do. It can become Approved if the ruling leader picks it with the legalize reform.
- **Anyone:** read the public Regime Stability panel on the country overview, which shows the stage and a short description without raw numbers.

Questions:

- **Why is my new party banned?** One-party states ban new parties by default.
- **Can I win elections as a non-ruling party?** Only through approved-party seats, which have a 0.375 vote weight, so winning power means the regime has to convert first.
- **What triggers collapse?** Stage 4: popular legitimacy below 15 for 72 turns after an internal challenge.
- **Do purges delete anything?** No. A purge is a logged event that costs party confidence by severity; no data is deleted.

### Command economy

Where the command economy is in use, these states set consumer prices by administration rather than supply and demand, throttle cash growth with a wage-fund ceiling, and let a monetary overhang feed back into popular legitimacy and party confidence. Planning seats operate the levers (Gosplan and Gosbank equivalents in RU and DD, Vice Premier and PBoC Governor in CN), plus state-enterprise director appointments.

### Constitutional convention and forced conversion

The leader can announce a voluntary convention: announce, draft, ratify. It freezes the Stage 4 counter, gives +15 popular and -10 confidence, and the draft sets the target system, a package of reserved seats for the former ruling party (up to 35) and the election delay (12, 24 or 48 turns).

If collapse arrives instead, the Stage 4 decision offers a peaceful route or resistance, and the forced conversion reserves only 5 seats, applies a 0.2 vote-share penalty to the former ruling party and holds an election after 12 turns. Resisting costs -25 confidence and -20 popular, bans every approved party and delays conversion 48 turns. Every conversion dissolves the legislature and holds the election it schedules. The reverse can also happen: a victorious enemy can impose a regime-change peace term that converts a democracy to a one-party state, and German reunification under the East creates a one-party Germany (see [Germany](/wiki/de-overview)).

## Connections

**Driven by**

- [National Metrics](/wiki/national-metrics): the economy and conditions feed Popular Legitimacy.
- [Political Parties](/wiki/political-parties): a party's tier decides its powers; new parties start banned.
- [Peace & Truces](/wiki/peace-and-truces): a regime-change peace term can convert a country to a one-party state.

**Affects**

- [Government Formation](/wiki/government-formation): only the ruling party can seat a head of government.
- [No-Confidence Votes](/wiki/no-confidence-votes): only ruling-party members may file a motion.
- [Bills & Legislation](/wiki/bills-legislation): banned parties cannot propose or vote, and a one-party legislature's bill route is simpler.
- [Coalitions](/wiki/coalitions): only the ruling party can form or join them.
- [General Elections](/wiki/general-elections): vote multipliers weight each party's result.

## Status

Live in the countries listed above, in the eras where each exists. Only China, the Soviet Union and East Germany support the faction-split defection at Stage 3; the other countries skip that step. The command economy applies in worlds where it is switched on, which is the default for fresh worlds. Country detail: [China](/wiki/cn-overview), [Soviet Union](/wiki/ru-overview), [East Germany](/wiki/dd-overview).

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact thresholds, constants and code paths: [One-party states design doc](https://docs.lakesidegames.net/design/one-party-states-as-shipped.html).
`;
