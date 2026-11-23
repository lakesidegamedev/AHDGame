---
date: 2026-11-23
title: Clearer price caps, sector listings and dissolution previews
summary: The market price-cap label matches the real cap, listing and dissolution previews add up, take private shows a fundable quote, and the abandon dialog matches the overview.
tags: [economy, corporations, markets]
badges: [patch]
areas: [fullstack]
---

## What changed

- Goods that sit on the market's price ceiling are now marked "at price cap". The ceiling shown now includes the general rise in prices over time, so no good reads above its own cap.
- Listing a sector for sale shows its estimated worth, the price you would receive, that no fee comes out of it, how the sale completes (another CEO buys it) and how to unlist.
- The dissolution preview shows one payout per share and gives every row in the same currency as the pool, including index funds and party holders that were left out before.
- The preview explains why the pool is below book value: cash, bonds sold to the market, and a share of the sectors' book value.
- When a corporation has bonds outstanding, the dissolve button is disabled with the reason. For public corporations the preview now says a passed vote settles bonds first.
- Take private now shows the real buyout: the number of shares bought out, the market price, the offer price when an asset or bank value floor raises it, the cash to reserve, and your personal cash. The reservation comes from your personal cash only. When you cannot cover it, the vote button is disabled and says how much you are short.
- The Abandon dialog now states the same per-turn revenue as the sector overview, and lists in plain lines what abandoning does: no cash for built plants, 75% refund on undelivered build orders, an NPP operator taking most plants, jobs ending, unsold stock lost, and where contracts go.
