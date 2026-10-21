---
date: 2026-10-21
title: Index funds no longer skip their daily rebalance
summary: Funds that missed their rebalance now catch up on the next turn.
tags: [economy, funds]
badges: [patch]
areas: [engine]
---

- Fixed some index funds never running their daily rebalance, which left new cash uninvested. A fund that misses its usual rebalance turn now catches up on the next turn it can.
