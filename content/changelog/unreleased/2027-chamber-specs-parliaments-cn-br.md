---
date: 2026-11-08
title: "Eight parliaments, China and Brazil run elections from the shared description"
summary: >-
  France, Italy, Spain, Sweden, Turkey, Greece, Austria, Finland, China and
  Brazil now schedule their elections the same way as Ireland and Nigeria.
  Election dates, seat counts and regions are unchanged.
tags: [engine, elections, countries]
badges: [patch]
areas: [engine]
---

## What changed

- The lower houses of France, Italy, Spain, Sweden, Turkey, Greece, Austria and Finland, China's National People's Congress, provincial congresses and regional governors, and Brazil's Chamber, Senate and regional governors now come from one shared election description, including how snap elections move the next regular vote.
- A region with no seat count in its seed data now fails loudly instead of quietly getting one seat. Every era start was checked and none is missing a value.
- Snapshot tests for every era start (1953 to 2027) confirm the same elections, dates and seats as before. The one difference: after an election resolves, China and Brazil regional governor races now wait one turn before the next one spawns, like every other office.
