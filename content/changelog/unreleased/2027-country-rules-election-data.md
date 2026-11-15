---
date: 2026-11-10
title: "Election code reads country rules from data tables"
summary: >-
  Behind the scenes, election logic that was specific to one country now reads
  from a shared table instead of checking country codes in the code. Nothing
  changes in play.
tags: [elections, internal]
badges: [patch]
areas: [engine, backend]
---

Election rules that only apply to one country, such as the US electoral college
or Russian presidential rounds, are now listed in a single table. This makes it
easier to add or change which countries use a rule. Results and behaviour are
unchanged.
