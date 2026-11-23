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
