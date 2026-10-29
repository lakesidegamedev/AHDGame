export const worldEventsContent = `# World Events

World events are scheduled, country-level happenings: a state visit, an oil shock, a bank run, an Olympic host year. The game offers them to a country's head of government (President, Prime Minister, Chancellor or equivalent), who picks a response. They are separate from the random personal events on your own character and from player-to-player mail. They matter because they hand governments small, dated decisions with real effects on approval, treasury and which sectors boom or sag.

## How it works

Each turn the scheduler goes through every active country.

1. If the country already has a pending world event, it is skipped.
2. It looks for the first scheduled event that is due, allowed for that country, inside its year window and inside its tension window.
3. At most **one** new world event is offered per country per turn.
4. The offer goes to the head of government. Other players see the outcome in [News](/wiki/news) and in how the country's numbers move, not as a decision card of their own.

A scheduled event comes round again after a gap of several turns, set between a minimum and a maximum and fixed by the country and the last time it fired. A country that has never had that event is eligible straight away.

If the head of government does not answer, the safe default resolves for them. Every default is the neutral option, so a vacant seat or an absent leader never costs the treasury. An offer stays open for 24 real hours.

### Key numbers

| Item | Value |
| --- | --- |
| New offers per country per turn | 1 |
| Pending world events per country | 1 |
| Offer length | 24 real hours |
| Olympics host | Every 48 turns, starting at turn 12 |
| World's Fair host | Every 36 turns, starting at turn 30 |
| Host selection | Fixed from the turn number across active countries, with no bidding |
| High-tension events | Civil Defense Fever from tension 50, Panic Buying and War Scare Protests from 60, Run on the Banks from 65 |
| Gap between high-tension crises in one country | 3 to 6 turns, plus up to 4 turns from emergency measures |
| High-tension crisis length | 12 turns |

### The event families

| Family | Who | Gap between events (turns) | What you decide |
| --- | --- | --- | --- |
| Sports victory | Every country | 6 to 16 | Wire-only celebration, approval up 2, treasury up 5,000 |
| State visit | Every country | 8 to 20 | Host a standard reception |
| International summit | Every country | 10 to 24 | Assertive, moderate or conciliatory stance |
| Scientific breakthrough | Every country | 12 to 30 | Fund commercialization or decline |
| Papal visit | Every country | 20 to 40 | State reception, approval up 2 |
| Royal event | UK | 24 to 48 | Celebration, approval up to 3, media demand bump |
| Budget Day | UK | 20 to 36 | Steady, giveaway, austerity or U-turn |
| NHS winter pressure | UK | 16 to 32 | Acknowledge, surge package or dismiss |
| BBC charter skirmish | UK | 24 to 48 | Defend, reform review or pick a fight |
| Constitutional crisis | US | 96 to 240 | Review, continuity protocol or conference |
| Sputnik moment | Russia, 1955 to 1962 | 96 to 200 | Maximum propaganda, sober framing or downplay |
| Berlin crisis | DDR, 1958 to 1962 | 150 to 300 | Seal the border, seek talks or defer to Moscow |
| Space race milestone | US and Russia, 1957 to 1975 | 150 to 300 | Crash program, steady funding or cede it |
| Oil embargo shock | Every country, 1973 to 1979 | 150 to 288 | Price controls, release the reserve or ride it out |
| Detente overture | US and Russia, 1969 to 1979 | 200 to 350 | Pursue a summit, demand concessions or decline |
| Olympics and World's Fair | One host country | Fixed cadence above | Host, with approval up 6 (Olympics) or 3 (Fair) and a 6-turn demand bump |

### High-tension events

These four are wartime society crises, and they are real crises with a decision card, not wire-only cards. They appear while the world's [tension gauge](/wiki/cold-war-tension) is high enough, one at a time every 3 to 6 turns, so they arrive as a staggered sequence and not all at once. Each lasts 12 turns and starts with a drag on one sector: retail down 4 for panic buying, financial down 8 for a bank run, retail down 18 for civil defense fever, media down 4 for protests.

\`\`\`wiki-chart
high-tension-world-events
\`\`\`

| Crisis | Option | Approval | Other effects |
| --- | --- | --- | --- |
| War Scare Protests | Let them march | -2 | None |
| War Scare Protests | Address the nation | +1 | Buys 4% mitigation for 8 turns |
| War Scare Protests | Disperse the marches | -6 | Civil liberties -7, 18% mitigation for 24 turns, defense and manufacturing demand up |
| Run on the Banks | Stand by the banks | -2 | Financial demand down 5 |
| Run on the Banks | Guarantee all deposits | +3 | Costs 20,000, 10% mitigation |
| Run on the Banks | Bank holiday | -4 | Civil liberties -3, 14% mitigation |
| Panic Buying | Appeal for calm | +1 | Retail demand up 4 |
| Panic Buying | Emergency rationing | -3 | Civil liberties -2, 12% mitigation |
| Panic Buying | Release stockpiles | +2 | Costs 10,000, 8% mitigation |
| Civil Defense Fever | Dismiss the panic | -2 | None |
| Civil Defense Fever | Order drills | +1 | Civil liberties -1, 8% mitigation |
| Civil Defense Fever | Fund a shelter program | +2 | Costs 15,000, 10% mitigation, retail down 20% and construction, manufacturing and defense up 20% for 12 turns |

Mitigation lengthens the gap before the next wartime crisis by 1 turn for every full 10%, up to 4 turns. No measure makes an active war scare disappear.

### Worked example

The world tension gauge reads 62, so War Scare Protests is allowed. Your Prime Minister is offered it.

- **Let them march**: approval falls 2 and nothing else changes. The next wartime crisis is due 3 to 6 turns later.
- **Address the nation**: approval rises 1 and 4% mitigation lasts 8 turns. That rounds down to 0 extra turns, so the next crisis is still due in 3 to 6 turns.
- **Disperse the marches**: approval falls 6 and civil liberties fall 7. The 18% mitigation adds 1 turn, so the next crisis is due in 4 to 7 turns, and defense and manufacturing demand rise 10% and 8% for 10 turns.

Doing nothing for the 12 turns resolves it on the cautious default.

### Why they exist

Scheduled events give a long game a heartbeat. They stop quiet stretches feeling empty, tie the tension gauge to daily life, and give every executive occasional decisions even when no war or election is running. The high-tension set exists so the cost of a hot world reaches ordinary households and sectors, not just the military.

## What you can do

- **If you are the head of government,** answer the card on your actions page. Defaults are neutral, so waiting is safe, but a good answer is often worth points.
- **If you are not the executive,** you cannot answer, but you can lobby, run for the office, and read the outcome in [News](/wiki/news).
- **Watch the tension gauge.** Above 50, wartime society crises start to appear. Keeping tension down keeps them away.
- **Plan treasury.** Guarantees, stockpile releases and shelter programs cost 10,000 to 20,000.

Tips:

- A cautious response early can be cheaper than the political cost of ignoring a crisis for 12 turns.
- Harder measures buy more mitigation but cost approval and civil liberties. A government that cracks down every time slides toward lower Democratic Health.
- The Olympics host is a draw, not a bid. You cannot win it or lose it by playing well.

### Common questions

- **Who gets the Olympics?** One active country per cycle, chosen from the turn number. If that country has a pending event, the offer is skipped until the next cycle.
- **Can I influence it if I am not the president?** Only through the office, the legislature and the news cycle.
- **What does Run on the Banks do?** It cuts financial sector margins by 8 for 12 turns, and your answer decides approval, treasury cost and demand shifts.
- **Do these end in war?** No. World events do not start wars by themselves. The map begins with no pre-seeded wars, and every war was started by a player declaration or by a campaign you can read about in [Global Response Crises](/wiki/global-response-crises).

## Connections

**Driven by**

- [Cold War Tension](/wiki/cold-war-tension): the gauge gates the four wartime society crises at 50, 60 and 65.
- [Player Random Events](/wiki/player-events): its offer and cooldown machinery is reused for country-level offers.
- [Conflicts & the Military System](/wiki/conflicts-overview): active wars raise the tension that unlocks wartime crises.

**Affects**

- [Crisis Interaction](/wiki/crisis-interaction): wartime society events open as real crises with decision cards.
- [Government Approval](/wiki/government-approval): most responses move approval up or down.
- [News](/wiki/news): outcomes publish to the wire and the news feed.
- [Corporations](/wiki/corporations): responses shift sector demand, which changes sector revenue for 4 to 24 turns.

## Status

Live in every current world. Family availability depends on country and year. UK, US, Russia and the DDR have their own events, and Cold War families only run inside their dates. The wartime society crises need the tension gauge to be high enough.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

There is no separate technical page for the scheduler yet. The cadences, gaps and effect sizes above are the exact rules. For the crisis system the wartime events run on, see [Crisis System](https://docs.lakesidegames.net/design/crisis-system.html).
`;
