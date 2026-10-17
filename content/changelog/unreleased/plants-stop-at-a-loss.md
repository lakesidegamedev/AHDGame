---
date: 2026-10-17
title: Plants scale back when they lose money on what they make
summary: A plant that keeps losing money on its output now makes less of it, so it stops paying for goods that sell below what they cost.
tags: [corporations, economy, plants]
badges: [minor]
areas: [backend]
---

- Every turn each plant compares what it earned from its sales with the costs it would save by making less: inputs, running costs per unit, and the part of its crew above the minimum staff.
- After six turns in a row of losing more than 5% on its sales, a plant cuts its run by 5% of its capacity each turn. After six turns of earning more than 5%, it steps back up the same way.
- One bad turn never cuts a plant, and a plant keeps a small test run going so it can tell when prices recover.
- Supply contracts with named buyers are always produced in full.
- Fewer working hours also means a smaller crew over time, so wage bills fall with the run. Upkeep on the plant itself does not change.
