---
date: 2026-11-23
title: "Civic screens agree with each other"
summary: >-
  Fixes to the money history, savings rate text, Campaign Manager polling,
  regional legislature pages and map loading.
tags: [finances, elections, legislature, maps]
badges: [patch]
areas: [engine]
---

## What changed

- Money in and out: the fund generation credit is now recorded the moment it is paid, so a turn can no longer add campaign money without a matching history row. Fundraising credits are recorded the same way. The income row is now called "Office income".
- Savings: the central bank rate note now shows the real rate, the prime rate and inflation behind it, so it adds up to the rate shown. The page now says interest builds up every turn and is added to your balance every 12 turns.
- Campaign Manager: the polling chart no longer shows another race's history while a race loads, and never appears next to "No polling history yet". Primary polls now say that alignment counts as well as favorability and influence.
- Regional legislature pages now use the same title for the regional head as the region page. Blocs of seats are labelled as party blocs with their leader, and seat shares add up to exactly 100.0%.
- Maps that cannot load now say so and offer a retry instead of staying on "Loading map..." forever.
- /bank now opens Banking and /wallet opens your Portfolio.
