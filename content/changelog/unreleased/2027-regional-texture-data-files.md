---
date: 2026-11-10
title: "Regional starting scores for 1953 and 1991 are now checked data files"
summary: >-
  The per-region political scores that open the 1953 and 1991 worlds moved out
  of code into data files that the seed check validates before any world is built.
tags: [seeding, politics]
badges: [patch]
areas: [backend]
---

The 1953 and 1991 regional score tables are plain data files now. Every value is
checked to stay within plus or minus 12 points and to name a real issue family,
so a bad edit stops a world from seeding instead of reaching players. Worlds start
exactly as before, and a test confirms the files match what the generator produces.

Country data and cabinet tables are also exempt from the file size limit by rule,
so adding a country no longer needs a list entry.
