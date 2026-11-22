---
date: 2026-11-22
title: "Per-unit profit counts outside sales only, and cost jumps are explained"
summary: >-
  A sector's profit per unit now covers only what sold to outside buyers, and
  the Finance tab names what moved operating costs.
tags: [corporations, finance, bugfix]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- The "Earns a unit" line on a sector's run report now counts only units sold to outside buyers, with the costs those units carry. Before, units sent to your own sites were counted as sold at your asking price, which made profit per unit look higher than it was.
- Units sent to your own sites have their own line: how many, and what they are worth at your asking price. They are not a sale, so they are not in the per-unit figures.
- The company now records its operating costs by type each turn: wages, inputs, maintenance, management overhead, freight, marketing, logistics, R&D and CEO pay, and everything else. It also records how many workers it employed.
- When operating costs move 10% or more from the turn before, the Finance tab's last-turn section names the main reasons, for example "Wages up 46%, headcount 1,505 to 2,070". Turns recorded before this change show the total only.
