---
date: 2026-11-10
title: "Party leadership election code reorganised"
summary: >-
  Behind the scenes, the code for party, state party, committee and caucus chair
  elections now lives with the rest of the election code. Nothing changes in play.
tags: [elections, parties]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Party leadership, state party,
national committee and caucus chair elections behave exactly as before. Their
code now sits next to the other election systems so it is easier to maintain.
