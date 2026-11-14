---
date: 2026-11-13
title: Lakeside grants, single-player tier rule and maintenance sign-in text
summary: >-
  Single-player and sandbox now come with Supporter+ and Champion, a one-time
  purchase or a grant. The maintenance banner explains that sign-in still works.
tags: [auth, accounts, client]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- The maintenance login banner now says the game is closed, and that you can still sign in to use the Lakeside store, your account and the launcher.
- Single-player and sandbox access come with Supporter+ and Champion, a one-time purchase, or a grant from Lakeside. Plain Supporter no longer includes them.
- The top supporter tier is now shown as Champion everywhere it was called Supporter++. Nothing changes for existing subscribers.
- Grants and free access made on the Lakeside account service are honoured (cached for 60 seconds, failing closed). A grant-only or free-only entitlement in the client lasts at most one hour, while a real purchase or tier keeps the long offline grace.
- New optional `LAKESIDE_ACCOUNTS_INTERNAL_TOKEN`. Without it, grants are not checked.

## Player-facing

Plain Supporter members without a purchase or grant lose single-player and sandbox access. Champion and Supporter+ are unaffected.
