---
date: 2026-11-11
title: Wages rise in step with what plants actually sold
summary: >-
  A plant that made more than the market took now raises wages only in
  proportion to the part of last turn's run that sold, so a glut no longer
  lifts the wage bill on output nobody bought.
tags: [economy, labour, corporations]
badges: [minor]
areas: [engine]
---

## What changed

- A plant's wage rise is now scaled by last turn's sell-through: units sold
  divided by units made, never above all of them.
- A plant that sold half its run raises wages by half as much; a plant that
  sold none pays its normal payroll only.
- Wages still never fall below the normal payroll, and the rise still cannot
  take more than the set share of the surplus left after wages and site bills.
- A settled receipt with no sales count is read as fully sold, so nothing
  changes for records that do not carry one.
