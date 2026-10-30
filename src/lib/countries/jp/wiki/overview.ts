export const jpOverviewContent = `# Japan

In Japan the Prime Minister can dissolve one house of the legislature but not the other, and that asymmetry shapes everything: which seat to run for, how long it lasts, and how a bill gets through. Japan is a **parliamentary constitutional monarchy** whose **National Diet (Kokkai)** has two elected chambers, the Shūgiin (House of Representatives) and the Sangiin (House of Councillors). Both have player-contestable seats. Japan also has a **Cabinet Bills** fast-track found in no other country.

## Two chambers, one that cannot be dissolved

Unlike the UK where the upper house is unelected, both chambers of the Diet are elected by players and NPPs.

**Shūgiin (House of Representatives)**
- **465 seats** elected from 8 regions, with each region's seats shared out by vote share
- **4-year terms**, but can be dissolved by the PM for a snap election
- Invests confidence in the Cabinet: the PM must command a Shūgiin majority
- Originates all bills; has override power over the Sangiin
- Coalition threshold: **233 seats** (50% of 465 + 1)

**Sangiin (House of Councillors)**
- **248 seats** elected from 8 regions, shared out by vote share the same way
- **6-year staggered terms**: half contested every 3 years (2 classes)
- **Cannot be dissolved**: provides legislative continuity even during snap elections
- Revises legislation; can reject Shūgiin bills but the Shūgiin can override with a 2/3 supermajority
- Every region splits its Sangiin seats across both classes (Class 1 gets the ceiling half, Class 2 the floor half): 124 seats up per class, 248 total

A Sangiin seat provides 6-year tenure that survives snap elections, which is useful for stability.

| Office | How filled | Term | Seats |
| --- | --- | --- | --- |
| Prime Minister | Confidence vote of Shūgiin members | No fixed term | 1 |
| Member of the House of Representatives (Shūgiin) | Regional multi-seat election (Hare largest remainder) | 4 years | 465 (466 in 1953, 512 in 1991) |
| Member of the House of Councillors (Sangiin) | Regional multi-seat election (Hare largest remainder), staggered | 6 years | 248 (252 in 1991) |
| Governor | Regional election | 4 years | 1 per region (8) |
| Emperor | Imperial character (ceremonial) | Lifetime | 1 |
| Governor of the Bank of Japan | Appointed action | 4 years | 1 |

## Running in one of eight regions

Japan's gameplay is organized around 8 regions, each containing multiple prefectures. Your character's home region determines where you run for office.

\`\`\`wiki-chart
jp-seats-by-region
\`\`\`

| Region | Code | Population | Shūgiin | Sangiin |
| --- | --- | --- | --- | --- |
| Hokkaido | HOK | 5.2M | 12 | 7 |
| Tohoku | TOH | 8.6M | 37 | 20 |
| Kanto | KAN | 43.5M | 150 | 80 |
| Chubu | CHU | 21.1M | 81 | 44 |
| Kansai | KNS | 22.5M | 82 | 44 |
| Chugoku | CGK | 7.1M | 28 | 14 |
| Shikoku | SHI | 3.7M | 14 | 8 |
| Kyushu & Okinawa | KYU | 14.3M | 61 | 31 |

Kanto (which includes Tokyo) is the most populous region with the most seats. Kansai (which includes Osaka) has a distinct political profile: Nippon Ishin no Kai is the dominant opposition force there, rather than the CDP.

Both chambers use the same rule. Each region elects several members at once, and its seats are shared out by vote share (the Hare largest remainder method). A party must win at least **10% of the pooled votes in the region** to take any seats there. The spoiler effect still applies through major-party modelling.

Say a region elects 14 members and 98,000 votes are cast, so one seat costs a quota of 7,000 votes. Party A has 49,000 votes, B has 31,000 and C has 18,000. A gets 7 seats, B gets 4 and C gets 2, which is 13 of 14. The last seat goes to the largest leftover: A has 0, B has 3,000 and C has 4,000, so C takes it. Final result: A 7, B 4, C 3. A party under 10% of the pooled vote gets nothing, however many leftover votes it holds.

- **Major parties by region:** most regions have LDP and CDP; in Kansai (KNS) it is LDP and Nippon Ishin no Kai.
- **Primaries advance the top 3 candidates** per party per region, the same as the UK rule (not the US's top-1 rule).
- **Timing:** a regular Shūgiin election window is 192 turns (8 real days: 168 for the primary and 24 for the general), and a Sangiin window is 144 turns (6 real days: 120 primary + 24 general).
- **Sangiin stagger:** only one class is up at a time, and every region splits its seats across both classes. So your home region always has Sangiin seats up in every Sangiin election: Kanto's 80 seats are 40 per class. A class comes up every 144 turns (6 real days). Check the election page for which class is next before you declare.

Rules shared with every country are in [Election Mechanics](/wiki/election-mechanics), and [Campaign Strategy](/wiki/campaign-strategy) covers fundraising, ads and canvassing.

## Becoming Prime Minister

The PM is appointed through a confidence vote in the **Shūgiin only** (the Sangiin does not vote on PM selection):

1. After Shūgiin elections resolve, the largest party or coalition with 233+ seats attempts government formation.
2. A confidence vote among all 465 Shūgiin members is held.
3. If it passes (majority), the nominee becomes PM and appoints all cabinet members directly. See the [Cabinet Guide](/wiki/cabinet-guide).
4. **Minority government**: any party or coalition chair holding at least 72 Shūgiin seats (15.38% of the chamber, rounded up) can propose a PM and call a confidence vote, even when a rival bloc has 233+. The Shūgiin votes the bid up or down.

The PM has no fixed term and serves until losing a confidence vote ([No-Confidence Votes](/wiki/no-confidence-votes)), resigning, or calling a snap election.

## Dissolving the Shūgiin

The PM can **dissolve the Shūgiin** and call a snap election, a mechanic Japan shares with the UK and Germany, but not the US. The [Snap Elections](/wiki/snap-elections) page covers the shared rules.

![Snap election cycle from the limits on dissolving the Shugiin to the vacated PM seat, 48 hour snap elections, a confidence vote, and an automatic snap if no PM is seated in time.](/wiki-images/diagrams/jp-overview-snap-cycle.svg)

- **Who:** sitting PM only
- **Limit:** 2 snap elections per PM appointment (resets when a new PM takes office)
- **Cooldown:** 336 turns (2 real weeks) between snap elections, counted from the PM's previous snap
- **Blocked while** a no-confidence vote is open
- **Scope:** Shūgiin only: the Sangiin cannot be dissolved
- **Duration:** 48 hours (24h primary + 24h general): much shorter than a regular cycle
- **Cost:** the PM seat is vacated and the cabinet cleared, so a new PM must be confirmed; if none is seated within 96 turns, a snap is triggered automatically

When a snap election is called, all active Shūgiin elections are cancelled and fresh snap elections spawn across all 8 regions simultaneously. The government resets to pending until a new PM is confirmed through the confidence vote process.

## Getting a bill through the Diet

The shared pipeline is described in [Bills and Legislation](/wiki/bills-legislation). Japan's version is more complex than the UK's because of its elected Sangiin. There is no PM signature or veto step, and no royal assent delay: passage in both chambers means immediate enactment.

![The three bill routes through the Diet: Shugiin origin, Sangiin origin where a Shugiin rejection fails the bill, and Cabinet origin with a 24 hour cabinet vote, with the Shugiin two-thirds override.](/wiki-images/diagrams/jp-overview-bill-paths.svg)

| Path | Route |
| --- | --- |
| Shūgiin-origin bill | Shūgiin → Sangiin → enacted (or Shūgiin 2/3 override if Sangiin rejects) |
| Sangiin-origin bill | Sangiin → Shūgiin → enacted (or failed if Shūgiin rejects: no Sangiin override) |
| Cabinet-origin bill | Cabinet review → Shūgiin → Sangiin → enacted |

The Shūgiin can override a Sangiin rejection with a 2/3 supermajority. The Sangiin cannot override the Shūgiin on any bill. This is on purpose: the Sangiin is a revising chamber that cannot be dissolved, so the confidence chamber gets the last word and a stalled Sangiin cannot freeze the government.

### The cabinet fast-track (Japan exclusive)

The PM and any cabinet member can propose bills through a cabinet review process before they enter the normal Diet pipeline.

1. A PM or cabinet member proposes a cabinet bill.
2. A 24-hour cabinet vote is held: the PM and all player-held cabinet positions vote, and a simple majority of the votes cast carries it. For example, with the PM and three player ministers voting, 3 yes and 1 no sends the bill to the Shūgiin.
3. If the cabinet votes to advance the bill, it moves from cabinet review into the active Shūgiin pipeline.
4. The bill then proceeds through the normal bicameral process: Shūgiin → Sangiin → enacted.
5. Limit: 1 cabinet bill in review at a time.

This gives the ruling coalition a direct legislative fast-track not available in the US or UK. Controlling the PM and enough cabinet seats enables it, which is a significant advantage for the governing party.

## Climbing from the Shūgiin to the premiership

| Stage | Target | Why |
| --- | --- | --- |
| Entry | Shūgiin member | +1 action/turn; introduces legislation in the primary chamber |
| Parallel | Sangiin member | +1 action/turn; 6-year terms survive snap elections |
| Mid-game | Governor | +2 actions/turn; controls regional executive; 4-year term |
| Top | Prime Minister | +4 actions/turn; snap election power; cabinet bill fast-track |

See [Player Progression](/wiki/player-progression) for the general ladder. Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. The charter system is country-agnostic; JP-specific gates don't apply.

## The Emperor

Japan has an **imperial character**, the Emperor: a ceremonial head of state with no political role. The Emperor manages the **Chrysanthemum Properties** corporation (real estate sector). The imperial character represents constitutional continuity but does not vote on legislation, the PM, or any in-game political question.

## Japan's own metrics

Japan tracks regional metrics specific to its economic and demographic context:

| Metric | What it measures |
| --- | --- |
| Elder Care Quality | Capacity for Japan's world-leading elderly population |
| Natural Disaster Preparedness | Earthquake, tsunami, and typhoon readiness |
| Transport Efficiency | Shinkansen and transit network quality |
| Work-Life Balance | Overwork and karoshi rates |
| Demographic Decline | Birth rate trends and population aging |
| Robotics Adoption | Industrial and service robotics deployment |

These metrics are affected by legislation and cabinet policy actions. Bills targeting robotics or elder care can shift regional outcomes more significantly in Japan than equivalent bills in other countries.

## Yen and the Bank of Japan

| Item | Detail |
| --- | --- |
| Currency | JPY |
| Central Bank | Bank of Japan (BoJ) |
| Chair title | Governor of the Bank of Japan |
| Default prime rate | 1.0% |
| Stock exchange | Nikkei |
| Finance Minister | Minister of Finance |

The Yen is stored in JPY millions in-game; the USD exchange rate is approximately 0.00943 (2020 baseline). The BoJ has historically operated near-zero rates: the lowest default prime rate of any country in the game.

## Living history

The timeline below is written by the turn processor whenever a Prime Minister transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
JP
\`\`\`

See also: [Core Systems](/wiki/core-systems) for turn structure and the action economy.

Playable in every era. Seat counts change by era: 466 Shūgiin seats in the 1953 preset, 512 Shūgiin and 252 Sangiin in the 1991 preset, 465 and 248 in modern presets. Cabinet Bills are a Japan-only mechanic. Last checked 2026-10-29, version 1.18.0.
`;
