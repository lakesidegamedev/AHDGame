export const worldEventsContent = `# World Events

A state visit is on the calendar. Or an oil shock, a bank run, an Olympic host year. World events are scheduled, country-level happenings, and the game offers each one to a country's head of government (President, Prime Minister, Chancellor or equivalent), who picks a response. They are separate from the random personal events on your own character and from player-to-player mail. They hand governments small, dated decisions with real effects on approval, treasury and which sectors boom or sag. They also give a long game a heartbeat: quiet stretches stop feeling empty, and every executive gets occasional decisions even when no war or election is running.

## How an offer reaches a country

Each turn the scheduler goes through every active country.

![Per-turn scheduler checking each country for a pending offer, then picking the first due event, offering at most one to the head of government, and reporting the outcome in the news.](/wiki-images/diagrams/world-events-scheduler-flow.svg)

1. If the country already has a pending world event, it gets no new event card that turn. A wartime society crisis can still open.
2. It looks for the first scheduled event that is due, allowed for that country, inside its year window and inside its tension window.
3. At most **one** new world event is offered per country per turn.
4. The offer goes to the head of government. Other players see the outcome in [News](/wiki/news), which publishes outcomes to the wire and the feed, and in how the country's numbers move, not as a decision card of their own.

A scheduled event comes round again after a gap of several turns, set between a minimum and a maximum and fixed by the country and the last time it fired. A country that has never had that event is eligible straight away. The offer machinery and cooldowns are reused from [Player Random Events](/wiki/player-events).

If the head of government does not answer, the safe default resolves for them. Every default is the neutral option, so a vacant seat or an absent leader never costs the treasury. Waiting is safe, but a good answer is often worth points. If you are not the executive you cannot answer, but you can lobby, run for the office, and read the outcome. Most responses move [Government Approval](/wiki/government-approval), and they shift sector demand, which changes [corporation](/wiki/corporations) sector revenue for 3 to 24 turns.

| Item | Value |
| --- | --- |
| New offers per country per turn | 1 |
| Pending world events per country | 1 |
| Offer length | 24 real hours |

## What turns up, and when

| Family | Who | Gap between events (turns) | What you decide |
| --- | --- | --- | --- |
| Sports victory | Every country | 6 to 16 | Wire-only celebration, approval up 2, treasury up 5,000 |
| State visit | Every country | 8 to 20 | Host lavishly, hold a standard reception or decline |
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

### Olympics and World's Fair hosts

| Item | Value |
| --- | --- |
| Olympics host | Every 48 turns, starting at turn 12 |
| World's Fair host | Every 36 turns, starting at turn 30 |
| Host selection | Fixed from the turn number across active countries, with no bidding |

The host is a draw, not a bid. You cannot win it or lose it by playing well. One active country per cycle is chosen from the turn number, and if that country has a pending event, the offer is skipped until the next cycle.

## When tension turns daily life into a crisis

Four events are wartime society crises, and they are real crises with a decision card, not wire-only cards. They open through [Crisis Interaction](/wiki/crisis-interaction) while the world's [tension gauge](/wiki/cold-war-tension) is high enough, and active wars in [Conflicts & the Military System](/wiki/conflicts-overview) raise the tension that unlocks them. They arrive one at a time every 3 to 6 turns, a staggered sequence and not all at once. Each lasts 12 turns and starts with a drag on one sector: retail down 4 for panic buying, financial down 8 for a bank run, retail down 18 for civil defense fever, media down 4 for protests. Keeping tension down keeps them away.

| Item | Value |
| --- | --- |
| High-tension events | Civil Defense Fever from tension 50, Panic Buying and War Scare Protests from 60, Run on the Banks from 65 |
| Gap between high-tension crises in one country | 3 to 6 turns, plus up to 4 turns from emergency measures |
| High-tension crisis length | 12 turns |

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

Mitigation lengthens the gap before the next wartime crisis by 1 turn for every full 10%, up to 4 turns. No measure makes an active war scare disappear. Guarantees, stockpile releases and shelter programs cost 10,000 to 20,000, so plan treasury. Run on the Banks cuts financial sector margins by 8 for 12 turns, and your answer decides approval, treasury cost and demand shifts.

The world tension gauge reads 62, so War Scare Protests is allowed. Your Prime Minister is offered it.

- **Let them march**: approval falls 2 and nothing else changes. The next wartime crisis is due 3 to 6 turns later.
- **Address the nation**: approval rises 1 and 4% mitigation lasts 8 turns. That rounds down to 0 extra turns, so the next crisis is still due in 3 to 6 turns.
- **Disperse the marches**: approval falls 6 and civil liberties fall 7. The 18% mitigation adds 1 turn, so the next crisis is due in 4 to 7 turns, and defense and manufacturing demand rise 10% and 8% for 10 turns.

Doing nothing for the 12 turns closes the crisis with no response, so none of the option effects apply and you get no mitigation. A cautious response early can be cheaper than ignoring a crisis for 12 turns. Harder measures buy more mitigation but cost approval and civil liberties, and a government that cracks down every time slides toward lower Democratic Health.

These events do not start wars by themselves. The map begins with no pre-seeded wars; wars come from declarations, alliance defence calls, and the scripted campaigns you can read about in [Global Response Crises](/wiki/global-response-crises).

Applies in every current world. Family availability depends on country and year: UK, US, Russia and the DDR have their own events, and Cold War families only run inside their dates. The wartime society crises need the tension gauge to be high enough. Last checked 2026-10-29, version 1.18.0. There is no separate technical page for the scheduler yet and the numbers above are the exact rules; for the crisis system the wartime events run on, see [Crisis System](https://docs.lakesidegames.net/design/crisis-system.html)
`;
