---
date: 2026-11-09
title: "Position editor previews the census electorate"
summary: >-
  The admin position editor now previews each region from the census buckets the
  vote engine counts, and the retired voter-group category data is gone.
tags: [demographics, admin]
badges: [patch]
areas: [fullstack]
---

## What changed

- The admin position editor shows each region as its census buckets (share, lean and turnout per bucket) and reads the region lean off the same electorate the elections use. Position and turnout edits move the buckets; share edits move the lean of their own dimension.
- The editor's CSV export lists census buckets instead of voter-group rows.
- The voter-group category tables are no longer seeded or read. Region pages, polls and elections already used the census, so players see no change.
