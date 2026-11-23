---
date: 2026-11-23
title: Clearer company finances and quality
summary: >-
  Sector running costs, the last-turn cash walk, construction spending and the
  quality breakdown now name every line instead of hiding a leftover, and
  commodity pages say when governments do not buy a good.
tags: [corporations, economy]
badges: [patch]
areas: [fullstack]
---

## What changed

- A sector's "Other running costs" is now split into site running costs, the premium for missing minor inputs, unused inputs written off and management overhead. Idle upkeep reads from the turn's own record, so two sectors no longer show an equal and opposite leftover.
- The last-turn cash walk now names the tax on dividends received and the currency conversion fee on foreign income, and the remaining line says what it can hold, such as rounding, instead of "not itemised".
- The Finance statement always shows construction ordered on the latest turn and construction still in progress, with 0 when there is none.
- Average quality always lists the four pillar scores with their weights when they were recorded, names the biggest mover when two turns have them, and links to the quality guide.
- Commodity pages note under Top consumers when governments do not buy that good.
- Commodity pages now have a "What is in this price" box: the base price, the scarcity premium with how it moved since last turn, and the producer cost pass-through. It explains that the premium builds while a good is short and only eases back at a set pace once supply catches up, so a well supplied good can still sit near its top price. The market list shows the same note when you hover a price against base.
- A sector that sells only energy no longer says it needs "about 0" TEU of freight. It says its output moves by wire or pipe and needs none.
- The supply chain tables now say their units and totals are for one turn and note that sector pages show the same flows as a daily rate (24 turns).
- The last-turn cash walk now counts bond coupons received and interest paid once, so a company that holds or issued bonds no longer shows a matching leftover on the statement or in cash.
