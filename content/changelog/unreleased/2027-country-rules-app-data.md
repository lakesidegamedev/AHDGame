---
date: 2026-11-10
title: "page and component code reads country rules from data tables"
summary: >-
  Behind the scenes, page and component logic that was specific to one country now reads
  from a shared table instead of checking country codes in the code. Nothing
  changes in play.
tags: [internal]
badges: [patch]
areas: [engine, backend]
---

Rules that only apply to some countries are now listed in a single table, which
makes it easier to change which countries use them. Behaviour is unchanged.
