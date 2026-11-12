---
date: 2026-11-09
title: "Vacant national offices always get filled, and the wire says so"
summary: >-
  A vacant presidency, premiership or party leadership now fills even when
  nobody is in line or no one can be voted in, special presidential elections
  show up properly on election pages, and the wire reports each step.
tags: [elections, succession, government]
badges: [patch]
areas: [engine, backend, fullstack]
---

## What changed

- When the president and vice president seats are both empty (or the vice president is barred from the office), a special presidential election is now called after a short wait, instead of the office staying empty until the next regular election.
- A legislature or party vote that finds nobody it can pick now seats a new member of the largest party once the deadline has passed. An office awaiting a special election that came back empty is filled the same way once overdue.
- A mid-term vacancy in the 1991 Russian presidency now gets its special election once the first ballot has produced a result.
- The wire now reports when a national office falls vacant, when it is still empty past its deadline, when a special presidential election is called and who takes the office.
- Special presidential elections now show as national races with the right title on election pages, the map, the sidebar and navigation, and the acting prime minister is no longer dropped from the ballot in presidential countries.
- In a country with players, the special presidential election is left to players: computer-run politicians no longer enter it on their own or as filler candidates. In countries without players they still do, and the election now gets its usual minimum of challengers.
- Folded parties are no longer picked as the party for a by-election or challenger candidate.
