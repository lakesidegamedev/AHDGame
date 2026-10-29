export const snapElectionsContent = `# Snap Elections

A **snap election** is an early general election for a parliament's lower chamber, held before its regular term ends. In the countries that allow them, a Prime Minister (a Chancellor in Germany) can call one to chase a good poll, and the game calls one automatically if the country goes 96 turns without a Prime Minister. It matters because a snap ends the current government, cancels bills in the lower chamber and resets the election calendar.

## How it works

Snaps can start two ways: a sitting PM calls one voluntarily, or the 96-turn vacancy clock runs out and the game calls one. A third kind of dissolution is not a snap at all and can reach any system: a **conversion** (a collapsed regime, a ratified constitutional convention, or a regime-change peace term). It dissolves the legislature and holds the election it promises, spends none of the head of government's snap allowance, and does not move the rest of the electoral calendar. Where the next scheduled election would then fall too close to run a nomination period, it waits for the following cycle.

For the regular cycles see [United Kingdom](/wiki/uk-overview), [Japan](/wiki/jp-overview) and [Germany](/wiki/de-overview). For the confidence rules see [No-Confidence Votes](/wiki/no-confidence-votes) and [Government Formation](/wiki/government-formation).

### Key numbers

| Rule | Value |
| --- | --- |
| Snaps per PM appointment | 2 |
| Cooldown after a snap | 336 turns (14 days at one turn per hour) |
| Vacancy clock before an automatic snap | 96 turns |
| Snap length | 48 turns: 24 primary, then 24 general |
| Next regular election after a snap | Snap end turn + 240 (UK, Scotland, Wales) or + 192 (JP, DE, IE) |
| Upper chambers affected | None |

A typical regular cycle is 240 turns in the UK and 192 in Japan, Germany and Ireland, so a 48-turn snap is a sprint by comparison.

## Where snaps are possible

| Country | Snap-eligible? | Lower chamber | Snap election type |
| --- | --- | --- | --- |
| 🇬🇧 UK | Yes | Commons | Snap Commons election |
| 🇯🇵 JP | Yes | Shūgiin | Snap Shūgiin election |
| 🇩🇪 DE | Yes | Bundestag | Snap Bundestag election |
| 🇮🇪 IE | Yes | Dáil | Snap Dáil election |
| 🇦🇹 AT | Yes | Nationalrat | Snap Nationalrat election |
| 🇬🇷 GR | Yes | Hellenic Parliament | Snap Hellenic Parliament election |
| 🇮🇹 IT | Yes | Chamber of Deputies | Snap Chamber of Deputies election |
| 🇪🇸 ES | Yes | Congress of Deputies | Snap Congress of Deputies election |
| 🇫🇮 FI | Yes | Eduskunta | Snap Eduskunta election |
| 🇫🇷 FR | Yes | National Assembly | Snap National Assembly election |
| 🇹🇷 TR | Yes | National Assembly | Snap National Assembly election |
| Scotland | Yes | Scottish Parliament | Snap Scottish Parliament election |
| Wales | Yes | Senedd Cymru | Snap Senedd election |
| 🇺🇸 US | No | N/A | N/A |

Upper chambers (UK Lords, JP Sangiin, DE Bundesrat) are explicitly excluded. Lords isn't elected at all, the Sangiin has its own fixed cycle independent of snaps, and the Bundesrat is appointed by Land governments.

## What you can do

### Call a snap as Prime Minister

A sitting Prime Minister (or Chancellor in DE) can call a snap election at any time, subject to these gates. The snap button is on the country's legislature page and shows snaps used, snaps remaining and cooldown turns left:

- Snap elections must be allowed for the country. This follows from government type: parliamentary monarchies (UK, JP) and parliamentary republics (DE, IE) allow them by default; presidential and one-party systems don't. A country's configuration can override this default.
- Their government must be formed (not pending or caretaker).
- A PM can call at most 2 snaps per appointment. The counter resets on a new PM.
- If a snap was already called, 336 turns must have passed since it.
- **No active no-confidence vote** exists for the country. A PM cannot preempt a pending VONC with a snap.
- In the UK, the confidence vote that follows a Commons election must also have resolved.

#### What happens on a successful snap

In order, atomically:

1. All active or upcoming regular lower-chamber elections are **cancelled**.
2. **In-progress bills in the lower chamber** anywhere in its voting or override process fail. Bills currently in the upper chamber (Lords, Sangiin), or in JP's cabinet-review or enrolled stage, are preserved: their chambers are not dissolved.
3. A snap election spawns **per region** for the lower chamber (active status, primary opens immediately, 48-turn total window: 24 turns of primary + 24 turns of general).
4. The country's snap-usage counter increments and its last-snap turn is recorded.
5. **The sitting PM is vacated**: cabinet cleared, the officeholder loses their post (both the character and any NPP holding it), government status returns to pending, and the 96-turn PM vacancy clock arms.
6. Government cycle and seat counters reset automatically.
7. A public announcement goes out for the country.

Note: the 48-turn snap window is **much faster** than a regular Commons cycle (240 turns) or Shūgiin cycle (192 turns). Snap campaigns are sprints: make every action count.

## Auto-trigger: PM vacancy deadline

When the government enters a pending state (after a regular election, a passed no-confidence vote, a resignation or a snap), a 96-turn clock arms.

If no new PM is seated before the deadline, the game automatically triggers a snap election, ignoring the usual cooldown and usage caps. Nobody has to press anything.

The deadline clears when:

- A PM appointment vote passes.
- Any other flow seats a PM, including a failed-vote fallback appointment.

### Why a single vacancy clock replaces a "no-confidence, then snap" rule

A successful no-confidence vote already transitions the government into a pending state, the same state any PM vacancy reaches. Folding no-confidence into the shared vacancy clock means the game doesn't need to distinguish "snap because of no confidence" from "snap because no party can form a majority." The 96-turn window scales the UK post-FTPA 14-day alternative-government window and JP Article 69 10-day resign-or-dissolve convention to the simulation's timeline.

## Post-snap cycle reset

Snap elections shift the regular cycle forward. The next regular lower-chamber election anchors to the snap's end time, not to the original bootstrap date:

| Country | Regular cycle length | Next regular election's end turn |
| --- | --- | --- |
| UK Commons | 240 turns (5 game years) | Snap's end turn + 240 |
| JP Shūgiin | 192 turns (4 game years) | Snap's end turn + 192 |
| DE Bundestag | 192 turns (4 game years) | Snap's end turn + 192 |
| IE Dáil | 192 turns (modeled 4-year cycle) | Snap's end turn + 192 |

The cycle counter increments: a snap that resolves at cycle N is followed by a regular cycle N+1 whose end turn sits 240 (UK) or 192 (JP, DE) turns after the snap's end turn.

## What a snap does not touch

- **Upper chambers** (Lords, Sangiin) are unaffected. Their elections and seats persist.
- **Bills in the upper chamber** are preserved, as are bills in JP's cabinet-review or enrolled stage.
- **Non-lower-chamber regional councils** or devolved assemblies (e.g., Scottish Parliament, future DE state parliaments) are independent of the national snap.
- **Money, actions, stats** of individual players: nothing is reset. You keep everything.

## Worked example: a UK snap

The PM calls a snap at turn 1000. The Commons election and any by-elections are cancelled, Commons bills fail, and the PM is vacated. Snap primaries run turns 1000 to 1024 and the general election ends at turn 1048. The vacancy clock armed at turn 1000, so it expires at turn 1096 if nobody has been seated. That leaves 48 turns after the result to win a PM appointment vote.

The PM has used 1 of 2 snaps. The cooldown stops another voluntary snap until turn 1336 (1000 + 336). The next regular Commons election ends at turn 1288 (1048 + 240), so a regular election lands before the cooldown ends.

## Common questions

- **Can the PM who called the snap become PM again?** Yes, if they are nominated after the result and win the lower-chamber appointment vote like anyone else. Nothing is guaranteed: the office is vacated at the moment of dissolution. See [Government Formation](/wiki/government-formation).
- **Do I lose my seat?** Every lower-chamber seat is vacated, yours included. You can stand again in the snap. Upper-chamber seats and bills stay.
- **A rival PM called a snap. What now?** Enter the snap race, since primaries open immediately and run 24 turns. Your Political Influence and Favorability persist.
- **How do I know my country allows snaps?** If it is in the table above, it does. The legislature page shows the snap button only where they are allowed.
- **How many snaps are left, and when does the cooldown end?** The legislature page shows snaps used, snaps remaining and cooldown turns left.
- **If no PM is seated, when does the automatic snap fire?** 96 turns after the government went pending, counted from that turn.

## Strategic considerations

### For the Prime Minister

- **Calling a snap is a commitment to win it.** You lose your office at the moment the snap fires. Whether you regain it depends on the result and confidence process.
- **Timing on momentum.** Historically (and in-game) PMs call snaps when polling favours them. Consult polls before deciding.
- **Maximum 2 per appointment.** You can't spam snaps.
- **336-turn cooldown after each snap.** Plan accordingly.

### For opposition MPs

- **Watch the PM vacancy clock.** If the government is pending and no PM formation vote is imminent, auto-snap is ~96 turns out. Prepare campaign operations now.
- **Bills fail on snap.** If you had legislation mid-passage in the lower chamber, it's gone. Re-propose after the snap.
- **48-turn sprint.** Every turn of the snap general accumulates votes. There's no "build phase": all the build is done before the snap fires.

### For candidates (any party)

- **Incumbency is tenuous.** Sitting MPs have their seats open just like everyone else. Your Political Influence and Favorability persist, which is a huge advantage, but you still have to run.
- **Party organization is multiplied.** With the short 48-turn window, the party's Org share (raised to the 0.2 power, see [Party Organization](/wiki/party-organization)) matters disproportionately to individual campaigning.
- **NPP endorsements land harder.** The compressed window means fewer opportunities for Favorability swings; NPP endorsements (each a demographic appeal boost) are near-decisive.

## Connections

**Driven by**

- [Government Formation](/wiki/government-formation): a PM vacancy that lasts 96 turns triggers an automatic snap.
- [No-Confidence Votes](/wiki/no-confidence-votes): a passed motion leaves the PM seat empty and starts the vacancy clock; an open vote blocks a voluntary snap.
- [Polling](/wiki/polling): polling is what makes a PM want to call one.
- [Election Mechanics](/wiki/election-mechanics): the same rules govern early parliamentary elections.

**Affects**

- [Government Formation](/wiki/government-formation): a snap vacates the PM and opens a new formation round after the result.
- [General Elections](/wiki/general-elections): the snap runs on general-election vote math and replaces the regular election.
- [Election Mechanics](/wiki/election-mechanics): a snap resets the next regular election date.
- [United Kingdom](/wiki/uk-overview) and [Japan](/wiki/jp-overview): lower-chamber bills fail and the term clock restarts.

## Status

Snaps are live in every parliamentary country in the table above: the UK, Japan, Germany, Ireland, Austria, Greece, Italy, Spain, Finland, France, Turkey, Scotland and Wales. They do not exist in presidential or one-party countries such as the US, apart from conversion dissolutions, which can reach any country.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact constants, source files and edge cases are on the [snap elections design page](https://docs.lakesidegames.net/design/snap-elections.html).
`;
