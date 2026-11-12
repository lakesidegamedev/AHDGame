---
date: 2026-11-09
title: "Voter drift now runs on census groups only"
summary: >-
  Laws, newsroom slant and historical realignments now move census groups
  directly, and the lean shown on region pages is read from the same census
  electorate that decides votes.
tags: [demographics, elections]
badges: [patch]
areas: [backend]
---

## What changed

- Laws that shift how a census group votes or turns out now act only on that census group. Laws that named an old voter group instead no longer move anything.
- Newsroom slant pulls the whole electorate of a region through its census groups, by the same small step as before.
- A region's starting and running lean is now read from its census electorate in every era. Against the old voter-group figure, no region in the 2027 world moves more than two points on either axis. The largest moves are some strongly Republican US states, which start about one to one and a half points closer to the centre.
- Historical realignments and landmark laws keep moving census groups durably, as before.
