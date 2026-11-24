---
date: 2026-11-24
title: Search finds retired lives and forgives typos at the start of a word
summary: >-
  Search now finds retired characters that still appear on the leaderboards,
  suggests close matches for a typo at the start of a longer word, and only
  offers "Did you mean" names when nothing actually matches what you typed.
tags: [search]
badges: [patch]
areas: [backend]
---

## What changed

- Retired lives, such as names that still rank on the Legacy leaderboard, now appear in search. They open the player's current character, or the Legacy leaderboard if the player has none.
- A typo near the start of a longer word now finds it: "Margn" suggests laws and pages with "Marginal".
- Laws can be suggested when a search has a typo.
- "Did you mean" character names appear only when nothing in the results contains the word you searched, so "Margin" no longer leads with people named Martin.
