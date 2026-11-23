---
date: 2026-11-23
title: Regional growth reads like a real economy
summary: >-
  Company growth now moves a region's GDP only in proportion to the companies'
  share of that economy, and output history no longer resets.
tags: [economy, growth]
badges: [patch]
areas: [backend]
---

## What changed

- Fixed regional output history being cleared whenever any company in the region had no production reading that turn. Growth then fell back to revenue trends, which read far too high while new companies were being founded.
- Regional GDP growth now weighs the growth of player and NPC companies by their share of the region's economy. The rest grows at the background rate. Previously companies making up 1 to 16% of a region set its entire growth rate, so new companies opening read as 9 to 15% growth. As companies grow into a larger share, they drive more of it.
