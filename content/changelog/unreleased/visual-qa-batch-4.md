---
date: 2026-11-23
title: Tidier side tray, province, crisis, executive and election screens
summary: >-
  A small side tray tab, full party names on province pages, clearer crisis pages, a balanced
  executive page and calmer election deadlines.
tags: [interface, widgets]
badges: [patch]
areas: [frontend]
---

## What changed

- With the side tray closed, a small arrow tab sits on the screen edge, centred between the top bar and the bottom bar, instead of a full-height strip of icons. Open it to reach your widgets and Ask Keir.
- The Global markets widget keeps every price and change inside its card, including longer prices such as CA$.
- A price change that rounds to zero shows as a plain 0.0% in widgets, not a green rise.
- The company sectors table fits for chief executives too: the build progress under the plant count wraps instead of widening the table. Any wide table now shows a clear arrow on the side that has more columns.
- During a primary, the Campaign Manager map legend explains that a primary is inside one party, so only that party's colour shows.
- Province and state overviews show full party names in the Organization and Registration legends, wrapping to a second line instead of cutting off. Contested primaries name the race ("House of Commons", "Provincial Legislature") instead of an internal code, and the page says "here" instead of "the state".
- Parliamentary executive pages put the Leader of the Opposition beside the government's leaders, so the two columns stay even. Vacant shadow cabinet posts are listed on one line instead of a card each.
- Admin-only tabs use a quiet dashed style instead of red.
- Crisis pages list every country by its full name, show Resolved in green and an active crisis in amber, hide an empty Effects box, and say "stayed at" when a campaign stage did not change. Responses from countries no player runs read "Government" instead of "Unknown leader". New crises keep their name's capitals in the closing message.
- The House map explains that grey states have a tied delegation or no seated members.
- Election deadlines are plain text unless they are close, and a primary with only one party's candidate says no other party has filed.
- Company pages: region flags show for Canadian and French regions instead of "CA_" and "FR_", the revenue bar names regions as the table does, the Operations table no longer cuts its "Running / sold" header, a strategy switch reads "Switching · 7 turns", slow builds read "1 every 12 turns" instead of "about 0 a turn", the figures grid has no empty block, and a private company says Private once.
- Party pages: recent activity names categories in plain words, the National Chair is listed first, an empty National Committee says so once, discipline rows always name an office, and the Organization chart lists every party with a whole-number total.
- The executive cabinet preview says how many more positions the full list holds, and the confidence history no longer repeats itself before there is any history.
- The elections page says why the Map view is off right next to it.
- Bill pages keep the timeline, how it becomes law and the whip count in view while you scroll, show zero votes in grey, put /yr on both cost figures, say what the pass threshold is a share of, and read "Whipping No".
- Union pages show treasury, costs and upkeep with a currency, spell out plurals ("2 locals", "1 offer"), and say how many bargaining campaigns are open and how many are settled or lapsed.
- Sector pages show the market total once, every share to one decimal, a +0% production effect in grey, "paid" only once on construction lines, and call a staffing gap a shortage only when the state really is short of workers.
- Your profile shows a dash for stats with no per-turn change, names the hoarding threshold in actions, and marks the donor network ceiling as a maximum.
- On the Actions page, the two poll cards open "Quick poll" and "Full poll", and the batch-run note says when 10 runs cost more still.
- Presidential pages label the number of candidates filed, explain the Actions and Levels columns, drop the repeated state and candidate names from map tooltips, and show Previous or Next only when there is somewhere to go.
- The elections overview stats bar no longer leaves an empty dark band, and the US map hint points to the state search.
- State and province pages: the regional government buttons carry a label, regional conditions use one decimal throughout and the margin cap names its unit, Organization effects read in plain text with their ranges, legends leave out shares that round to 0.0%, and states without a specialization bonus say so. State party pages show the electorate lean once and name parties in the share dilution list.
- Party lists keep the Create coalition button on one line and show a Discord button only when a party has an invite; politician lists keep party names on one line and explain the favorability colours.
- Crisis pages style the resolution wire like the breaking wire, in green.
