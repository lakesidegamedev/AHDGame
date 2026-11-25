---
date: 2026-11-25
title: Inbox search and category filter, tidier page structure
summary: >-
  Search your inbox and filter it by category, turn a whole group of notification alerts on or
  off at once, and pages now have a clear heading structure for screen readers.
tags: [interface, inbox, accessibility]
badges: [patch]
areas: [frontend]
---

## What changed

- The inbox has a search box and category buttons (Crisis, Treasury, Election and the rest), shown only for categories you actually have.
- Notification settings let you turn a whole group of alerts on or off in one click.
- Economy, News, World Trade, Elections, Executive, Legislature and Inbox pages have a proper heading order, so screen readers and page outlines list their sections correctly. The Legislature bills section reads "Senate bills".
- The login page names the current in-game year, matching the front page.
- Selected options in company views (per turn, daily, annual and the like) use the same purple highlight as filters elsewhere.
- The front page headline uses the standard type sizes, and its red year counter uses a named theme colour.
