---
date: 2026-11-08
title: "Party whip orders moved into their own tested module"
summary: >-
  The steps behind a national party whip now live in one place with their own
  tests. Whipping works exactly as before.
tags: [parties, legislature, maintenance]
badges: [patch]
areas: [backend]
---

Issuing a whip on a bill, a leadership race, a government vote, a nomination,
a motion to vacate or an impeachment still checks the same rules, limits you
to the same number of attempts and tells your party members the same things.
The work behind it is now easier to test directly, which makes future fixes to
whipping safer.
