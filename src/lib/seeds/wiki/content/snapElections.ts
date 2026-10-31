export const snapElectionsContent = `# Snap Elections

You are Prime Minister, the polls look good, and the next scheduled election is a long way off. Calling a **snap election** (an early general election for the lower chamber, held before its term ends) lets you cash in now. The price is steep: the moment it fires you lose the premiership, every lower-chamber bill dies, and you have 48 turns to win it all back. A snap can also arrive without anyone choosing it: if a country goes 96 turns without a Prime Minister (a Chancellor in Germany), the game calls one.

For the regular cycles see [United Kingdom](/wiki/uk-overview), [Japan](/wiki/jp-overview) and [Germany](/wiki/de-overview).

## Can your country call one?

Snaps exist in parliamentary countries. Presidential and one-party systems such as the US and France do not have them. Parliamentary monarchies (UK, JP) and parliamentary republics (DE, IE) allow them by default, and a country's configuration can override that default. The check reads each country's standing system, not an era override. The snap button is only on the UK, Japan, Germany, Ireland, Scotland and Wales legislature pages; the other countries in the table have the rules but no button yet, so there a snap comes from the vacancy clock.

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
| 🇸🇪 SE | Yes | Riksdag | Snap Riksdag election |
| 🇹🇷 TR | Yes | National Assembly | Snap National Assembly election |
| Scotland | Yes | Scottish Parliament | Snap Scottish Parliament election |
| Wales | Yes | Senedd Cymru | Snap Senedd election |
| 🇺🇸 US | No | N/A | N/A |
| 🇫🇷 FR | No (presidential) | N/A | N/A |

Upper chambers (UK Lords, JP Sangiin, DE Bundesrat) are explicitly excluded. Lords isn't elected at all, the Sangiin has its own fixed cycle independent of snaps, and the Bundesrat is appointed by Land governments.

A third kind of dissolution is not a snap at all and can reach any system: a **conversion** (a collapsed regime, a ratified constitutional convention, or a regime-change peace term). It dissolves the legislature and holds the election it promises, spends none of the head of government's snap allowance, and does not move the rest of the electoral calendar. Where the next scheduled election would then fall too close to run a nomination period, it waits for the following cycle.

## Calling a snap as Prime Minister

The snap button is on the legislature page (in the countries listed above) and shows snaps used, snaps remaining and cooldown turns left. A sitting player PM (or Chancellor in DE) can call a snap at any time, as long as:

- Snap elections are allowed for the country.
- Their government is formed (not pending or caretaker).
- Fewer than 2 snaps have been called this appointment. The counter resets on a new PM.
- If a snap was already called this appointment, 336 turns have passed since it. Seating a new PM clears this cooldown too.
- **No active no-confidence vote** exists for the country. A PM cannot preempt a pending VONC with a snap. See [No-Confidence Votes](/wiki/no-confidence-votes).
- In the UK, the confidence vote that follows a Commons election has also resolved.

| Rule | Value |
| --- | --- |
| Snaps per PM appointment | 2 |
| Cooldown after a snap | 336 turns (14 days at one turn per hour) |
| Vacancy clock before an automatic snap | 96 turns |
| Snap length | 48 turns: 24 primary, then 24 general |
| Next regular election after a snap | Snap end turn + 240 (UK, Scotland, Wales, Italy) or + 192 (JP, DE, IE, AT, GR, ES, FI, TR, SE) |
| Upper chambers affected | None |

### The moment it fires

In order, all in the same turn:

1. All active or upcoming regular lower-chamber elections, and live by-elections for that chamber, are **cancelled**, and their candidates withdrawn.
2. **In-progress bills in the lower chamber** anywhere in its voting or override process fail. Bills currently in the upper chamber (Lords, Sangiin), or in JP's cabinet-review or enrolled stage, are preserved: their chambers are not dissolved.
3. A snap election spawns **per region** for the lower chamber (active status, primary opens immediately, 48-turn total window: 24 turns of primary + 24 turns of general).
4. **Every lower-chamber seat is vacated.**
5. The country's snap-usage counter increments and its last-snap turn is recorded. An automatic snap counts too; a conversion only records the turn.
6. **The sitting PM is vacated**: cabinet cleared, the officeholder loses their post (both the character and any NPP holding it), government status returns to pending, and the 96-turn PM vacancy clock arms.
7. Government cycle and seat counters reset automatically.
8. A public announcement goes out for the country.

![A PM call or the vacancy clock triggers a snap, which cancels lower-chamber elections and vacates the PM seat, runs a 48-turn election, and sets the next regular election.](/wiki-images/diagrams/snap-elections-timeline.svg)

The 48-turn window is **much faster** than a regular Commons cycle (240 turns) or Shūgiin cycle (192 turns). Snap campaigns are sprints: make every action count.

## When nobody is PM: the 96-turn clock

When the government enters a pending state (after a passed no-confidence vote, a lost confidence motion, a resignation, a PM losing their seat, or a snap), a 96-turn clock arms. If no new PM is seated before the deadline, the game automatically triggers a snap election, ignoring the usual cooldown and usage caps. Nobody has to press anything. The count runs 96 turns from the turn the government went pending, and it clears when a PM appointment vote passes or a PM is seated any other way. See [Government Formation](/wiki/government-formation) for how a PM gets seated.

A successful no-confidence vote already leaves the government pending, the same state any PM vacancy reaches. Folding no-confidence into the shared vacancy clock means the game doesn't need to distinguish "snap because of no confidence" from "snap because no party can form a majority." The 96-turn window scales the UK post-FTPA 14-day alternative-government window and JP Article 69 10-day resign-or-dissolve convention to the simulation's timeline.

If you are in opposition and the government is pending with no PM formation vote in sight, the automatic snap is about 96 turns out. Prepare campaign operations now.

## A UK snap, turn by turn

The PM calls a snap at turn 1000. The Commons election and any by-elections are cancelled, Commons bills fail, and the PM is vacated. Snap primaries run turns 1000 to 1024 and the general election ends at turn 1048. The vacancy clock armed at turn 1000, so it expires at turn 1096 if nobody has been seated. That leaves 48 turns after the result to win a PM appointment vote.

The snap counter now reads 1 of 2 and the cooldown runs to turn 1336 (1000 + 336), but both reset the moment any PM is seated. Whoever wins the appointment vote, the old PM included, starts with 2 snaps and no cooldown. The next regular Commons election ends at turn 1288 (1048 + 240).

## Afterwards: the calendar resets

Snap elections shift the regular cycle forward. The next regular lower-chamber election anchors to the snap's end time, not to the original bootstrap date. A typical regular cycle is 240 turns in the UK and 192 in Japan, Germany and Ireland.

| Country | Regular cycle length | Next regular election's end turn |
| --- | --- | --- |
| UK Commons | 240 turns (5 game years) | Snap's end turn + 240 |
| JP Shūgiin | 192 turns (4 game years) | Snap's end turn + 192 |
| DE Bundestag | 192 turns (4 game years) | Snap's end turn + 192 |
| IE Dáil | 192 turns (modeled 4-year cycle) | Snap's end turn + 192 |

The cycle counter increments: a snap that resolves at cycle N is followed by a regular cycle N+1 whose end turn sits 240 (UK) or 192 (JP, DE) turns after the snap's end turn.

What a snap does not touch:

- **Upper chambers** (Lords, Sangiin) are unaffected. Their elections and seats persist.
- **Bills in the upper chamber** are preserved, as are bills in JP's cabinet-review or enrolled stage.
- **Non-lower-chamber regional councils** or devolved assemblies (e.g., Scottish Parliament, future DE state parliaments) are independent of the national snap.
- **Money, actions, stats** of individual players: nothing is reset. You keep everything.

## Playing the sprint

**If you are the PM**, calling a snap is a commitment to win it. You lose your office the instant it fires, and whether you regain it depends on the result and confidence process. Nothing stops the PM who called the snap from becoming PM again: if nominated after the result, they win the lower-chamber appointment vote like anyone else. PMs historically call snaps when polling favours them, so consult [Polling](/wiki/polling) first. The 2-per-appointment cap and 336-turn cooldown reset whenever a PM is seated, and calling a snap unseats you, so the real brake is the risk of losing office.

**If you hold a seat**, every lower-chamber seat is vacated, yours included, and you can stand again in the snap. Upper-chamber seats and bills stay. Your Political Influence and Favorability persist, a huge advantage, but sitting MPs have their seats open just like everyone else. If you had legislation mid-passage in the lower chamber, it's gone; re-propose after the snap.

**If a rival PM called it**, enter the snap race straight away, since primaries open immediately and run 24 turns.

**Every turn of the snap general accumulates votes.** There is no build phase: all the building is done before the snap fires. With the window this short, what you built beforehand carries more of the result: the party's Org share (raised to the 0.2 power, see [Party Organization](/wiki/party-organization)) and NPP endorsements (+1.5 Favorability each in the count, up to +6), because there is little time left to move Favorability.

## Connections

The snap runs on the vote math in [General Elections](/wiki/general-elections) and replaces the regular election, using the same rules as [Election Mechanics](/wiki/election-mechanics), which also gets its next regular election date reset by the snap. The result opens a new formation round in [Government Formation](/wiki/government-formation). Lower-chamber bills fail and the term clock restarts in [United Kingdom](/wiki/uk-overview) and [Japan](/wiki/jp-overview).

Applies in every parliamentary country in the table above: the UK, Japan, Germany, Ireland, Austria, Greece, Italy, Spain, Finland, Sweden, Turkey, Scotland and Wales. They do not exist in presidential or one-party countries such as the US and France, apart from conversion dissolutions, which can reach any country. Last checked 2026-10-30, version 1.18.0. Exact rules: [Snap elections (design)](https://docs.lakesidegames.net/design/snap-elections.html)
`;
