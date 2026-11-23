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
- The bond screen now leads with "You can issue now", the most one issue can be today, and names what sets it: the per-issue cap, the debt to equity limit, or what creditors could recover if the corporation sold up. The per-issue cap stays as a detail line.
- The CEO Office "Sold" share for a plant now uses the same figure as the sector page: units buyers took out of everything offered, including stock. A plant selling down its stock no longer reads 100% in one place and 66% in the other.
- Per-unit profit lines say what they cover: "a unit sold outside" counts materials, wages and site running; "per unit made" counts every cost over every unit made.
- The Finances tab lists construction paid up front, outside the costs, while builds are under way. The sector Growth and building line says it leaves out construction paid when ordered.
