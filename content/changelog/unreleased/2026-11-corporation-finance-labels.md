---
date: 2026-11-23
title: "Corporation finance screens agree with each other"
summary: >-
  Several corporation figures now add up and say what they include: bond
  quotes, subsidies, cost totals, income splits and output shares.
tags: [corporations, finances, bonds]
badges: [patch]
areas: [frontend]
---

## What changed

- The bond form's face value slider now ends on a whole number, so it matches the face value shown beside it.
- The bond quote labels its cost per day as 24 turns, the game's financial day, so it is no longer mistaken for a calendar day.
- Each active subsidy now says how many of your sectors it covers. The subsidy benefit line on the statement is marked as an estimate and as already included in the costs above it, so gross profit is not meant to add it again.
- The Costs figure on the Overview and the Total costs row on the Finances tab say they are operating costs plus bond interest, with tax left out.
- The Overview income split (costs, interest and tax, dividends, retained) now adds up to 100%, including when net income is above operating income.
- A sector's share of output sold and share sent to your own sites no longer add up to more than 100%.
- The company cash shown when building capacity is rounded the same way as the Overview.
