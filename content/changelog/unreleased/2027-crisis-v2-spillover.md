---
date: 2026-11-09
title: "Crises spread between countries and AI governments respond"
summary: >-
  A serious crisis can now spread to the countries tied to it through trade,
  finance, shared alliances, migration and climate. Governments run by the game
  respond to crises at home with the same kind of responses players have, and
  the smaller background countries can start a spread or make one bigger but
  never decide a response. Crisis content has not been connected to the new
  spread links yet, so nothing changes in play today.
tags: [world, crises]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Each turn a crisis checks its spread links. How much passes on depends on how strong the real tie is between the two countries: the share of trade a partner supplies, how concentrated a country's sovereign bond holdings are in another country's debt, shared organization memberships, and shared world region for migration and climate.
- A link can wait a set number of turns, only passes once the crisis is bad enough and far enough along, and either raises an existing matching crisis in the other country in small steps or opens a new one if the game's crisis load allows it.
- Each spread crisis records which crisis it came from and which it caused, so the crises map can draw the spread lines.
- Governments run by the game now answer crises at home. They pick responses by how severe the crisis is, what the treasury and approval can bear and how ambitious or stubborn their leader is, and they pull at most a handful per turn.
- Background countries never pull a response. A larger background country passes a crisis on harder than a small one.
