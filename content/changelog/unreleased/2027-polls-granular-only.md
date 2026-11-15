---
date: 2026-11-09
title: "Polls read the full electorate breakdown"
summary: >-
  Polls now work from the detailed electorate breakdown only. The old voter
  group version of the poll is gone, and the headline numbers come from the same
  breakdown the elections count.
tags: [polls, elections, demographics]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- The poll's headline numbers (overall appeal, estimated voters, potential voters and the head-to-head vote totals) are now worked out from the same detailed electorate breakdown the elections use, instead of from a separate list of voter groups.
- The "top groups" and "bottom groups" lists from the old poll are gone. The breakdown explorer on the Full Poll is the way to see which parts of the electorate favour you.
- Pollster's notes read the electorate's average lean from the breakdown.
- A poll saved before this change that has no breakdown is cleared and needs to be commissioned again.
- Numbers will differ slightly from before because the model changed. In a head-to-head poll, party organisation and infamy no longer scale the total directly; they act through the breakdown shares as in the election.
