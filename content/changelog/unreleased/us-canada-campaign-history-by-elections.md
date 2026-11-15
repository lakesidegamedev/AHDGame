---
date: 2026-11-14
title: Fix by-election maps and campaign history
summary: Restores supported by-election maps, primary history charts and upcoming-race links, and removes Canadian storage prefixes from election navigation.
badges: [patch]
areas: [fullstack]
tags: [canada, elections, campaigning, navigation]
---

- US and Canadian special governor races use their regional maps. Canadian Commons by-elections support riding maps and campaigns, with vacancy-only allocations and frozen results.
- Canadian by-election maps explain modeled riding placement and distinguish unassigned ridings from contested seats.
- Canadian Commons by-election winners clear their filled vacancy rows while preserving sitting MPs and US offices.
- Finished-primary charts retain their own party's primary history, and upcoming-race links preserve their stage filter.
- Election navigation displays short Canadian region codes while preserving internal identities and California's US code.
