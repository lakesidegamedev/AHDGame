---
date: 2026-11-06
title: "AI companies can expand plants that make several goods when one of them sells out"
summary: >-
  Behind a new stage switch, an AI company's plant that makes more than one
  good is judged by its best-selling product, and goods it supplies to its own
  sites count as sold. Off by default; nothing changes until it is switched on.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Defense, construction and logistics plants make two goods each. If one good sold out while the other sat unsold, or went to the company's own sites, the plant was treated as not selling its output and the AI company would not expand it, even where buyers were short of the good that sold out.
- With `nppGrowthPerProductFillStage` at 1, an AI company's plant passes its sell-through check when any one product it makes sold at least 85% of what it put up, counting units handed to the company's own sites as sold.
- The same switch makes the shortage reading follow the plant's most short product instead of the one it delivered the most units of.
- The existing market, cash and profit checks still apply. Player companies are not affected.
