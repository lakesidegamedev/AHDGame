---
date: 2026-11-23
title: "Money screens now agree with each other"
summary: >-
  Fixes to the money history, the party treasury, the donate box and the
  portfolio so the numbers and labels match what actually happens.
tags: [finances, parties, portfolio]
badges: [patch]
areas: [engine]
---

## What changed

- Money in and out: starting campaign money and party caucus dues now appear under Campaign instead of Personal. The "Balance after" column only shows when the entries have a recorded balance.
- Donating to your party now says it uses your campaign funds, and shows your campaign balance.
- Party treasury: voter registration spending now has its own line, and the Political Strength line shows what is really spent, so the lines add up to the net income shown.
- The treasury save button now uses the standard action colour instead of the party colour.
- Treasury insights show a clear message with a retry link if they cannot load, instead of loading forever.
- Portfolio: bond income of zero is no longer shown in green, and the history chart labels no longer repeat the same value on a narrow range.
