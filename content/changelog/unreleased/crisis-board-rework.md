---
date: 2026-11-08
title: "Crises board with a world map"
summary: >-
  The Crises page now opens on a world map of active crises, shows how each one
  touches you, and lists them by urgency. Wars moved onto the same page, and
  the nav shows how many crises you can act on right now.
tags: [world, crises, conflicts, inbox]
badges: [minor]
areas: [frontend, backend]
---

## What changed

- The Crises page leads with a world map. Each crisis is a marker sized by severity and coloured by type (war, disaster, economic, political, opportunity). Lines join crises that belong to the same chain of events or the same war. Selecting a marker opens that crisis.
- "Your exposure" lists the crises that touch your country, your state, the sectors of corporations you run or hold shares in, and your office. Each one says whether you can act now and when the decision closes.
- Below the map, crises are grouped by what needs doing: needs your response, escalating, ongoing, winding down and recent history. Each card shows severity, turns left, who can act and a direct link to respond.
- Conflicts now live on the Crises page under the Conflicts filter. The old Conflicts page sends you there, and the war detail pages are unchanged.
- The Crises entry in the World menu shows a count of the crises you can respond to right now.
- You get an inbox message when a crisis that affects you moves to a new stage or opens a new decision, linking to that crisis. You get at most one per crisis per turn.
