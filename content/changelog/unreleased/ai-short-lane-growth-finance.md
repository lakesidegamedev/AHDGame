---
date: 2026-11-05
title: "AI companies can borrow to build in markets that are running short"
summary: >-
  Behind a new stage switch, an AI company whose plant sells out into a short
  market, and earns back a new unit in time, can ask a bank to fund more
  capacity even when its cash sits below its safety reserve. Off by default;
  nothing changes until it is switched on.
tags: [economy, corporations, banking]
badges: [patch]
areas: [engine]
---

## What changed

- Demand for food, retail, vehicles and advertising has grown much faster than the plants that make them. Most of that capacity belongs to AI companies, and most of those companies hold less cash than their safety reserve, so they stopped building even where their plants were profitable and buyers were going without.
- With `nppShortageGrowthFinanceStage` at 1, an AI company's plant qualifies when buyers on its main market got three quarters or less of what they ordered last turn, the plant made a profit, and a new unit earns back its build price within 100 turns at current prices.
- A qualifying plant can ask a bank to fund up to one growth step (half of what it currently runs). The company still pays its own share of the build, up to a quarter of the cash it holds, and the order is sized so that share fits.
- Banks still decide every loan with their usual checks. A company's construction loans may not pass 24 turns of its average profit, and up to 128 of these requests a turn are considered on top of the existing ones, deepest shortage and fastest payback first.
- Player companies are not affected, and AI companies on autopilot are left out.
