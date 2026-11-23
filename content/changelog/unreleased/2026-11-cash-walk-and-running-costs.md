---
date: 2026-11-23
title: "Cash walk, running costs, wages and quality add up"
summary: >-
  The recorded cash walk now includes research unlocks bought between turns,
  the income lines foot, running costs are split into named lines, and wage and
  quality labels say what they measure.
tags: [corporations, finance]
badges: [patch]
areas: [fullstack]
---

## What changed

- The cash walk for a turn now counts every ledger entry made between the two recorded turns, so a research unlock or build paid between turns shows as its own line instead of an unexplained balancing amount.
- The balancing line is renamed "Cash change with no ledger record", and dividends received on shares you hold, starting grants and a few bond and share movements now have their own lines.
- When cash has moved since the turn was recorded, the walk shows cash now beside the recorded end cash.
- The recorded income statement now signs bond interest and other items the right way, so revenue less costs, tax and dividends plus that line equals retained income. Bond interest paid and coupons received are shown on their own lines.
- Sector "Other running costs" is split into overheads (shown as a credit when it is one), stock carrying cost and crisis or disaster losses. Only what none of them explains stays in "Other running costs, not itemised".
- Wage labels now say what they measure. Your setting is a multiple of the industry baseline, the industry baseline and your pay are each compared with the median industry, and union claims are shown as a multiple of the industry baseline.
- The People tab shows an estimated wage bill at the wage you are about to set whenever the sector has workers.
- The autopilot "you can afford" research notice no longer appears for a technology you already own.
- The Tech tab states the breakthrough rule: one roll every few turns, chance equals R&D score divided by 200, and a hit adds free capacity to one sector.
- Average quality on the Overview shows how far it last moved and from what, and names what quality is built from.
