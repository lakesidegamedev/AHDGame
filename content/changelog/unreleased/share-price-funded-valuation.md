---
date: 2026-10-30
title: Share prices follow what a company actually sells
summary: >-
  On worlds with the funded market, a company's plants are now valued on the
  money they actually earn, or what was paid to build them, not on what they
  could make at today's prices.
tags: [corporations, economy, stock market]
badges: [patch]
areas: [backend, engine]
---

Before this change, a company's share price counted every plant at its full capacity, priced at whatever its goods sold for that turn. When a good was short and its price climbed every turn, the share price climbed with it, even if the plant sold nothing and the company lost money every turn.

On worlds that run the funded market, with this setting on:

- Each plant is worth the larger of two things: the profit it actually made this turn, valued as a steady income, or what was paid to build it. A plant that sells nothing keeps its build value, and a rising price on goods it never sold adds nothing.
- The growth bonus in the share price now looks at how much a company really sold, counted at fixed prices. Higher prices on the same sales are not growth. Selling more is.
- Company credit ratings use the same plant values, so they follow real earnings too.

Worlds without the funded market keep the old valuation. On an existing world the setting starts off and is switched on separately.
