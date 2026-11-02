---
date: 2026-11-02
title: Targeted embargoes now stop sales
summary: >-
  An embargo on one commodity, or on one direction of trade, used to change
  nothing about who could buy from whom. Now buyers can no longer buy the
  embargoed goods across a route the embargo closes.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, trade, embargoes, corporations]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine, backend]
---

## What changed

- The rule that decides which sellers a buyer may buy from only ran on worlds
  with an era unit scale. On every modern world it was skipped, so an embargo
  limited to one commodity or one direction of trade had no effect on a sale.
  Only a full two-way embargo did anything, through a separate older path.
- That rule now also runs on any world with an active embargo. Households,
  governments, investment buyers, marketing buyers and producers buying inputs
  all skip offers the embargo blocks.
- A world with no active embargo builds exactly what it built before, and era
  worlds are unchanged. Modern worlds still clear in one world market; the
  embargo filters who can buy inside it.
