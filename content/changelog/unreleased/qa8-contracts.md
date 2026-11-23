---
date: 2026-11-23
title: New price options for supply agreements
summary: New supply agreements now use either a set price or the market price plus or minus a percentage. Each turn the contract settles the difference against that turn's market price.
tags: [corporations, economy]
badges: [minor]
areas: [fullstack]
---

## What changed

- A new supply agreement is either a set price or market price plus or minus a percentage. A set price must be within 25% of the market price when the agreement is signed. The percentage can be up to 35% either way.
- With a set price, the seller ends up with exactly that price for every unit delivered. If the market is below it, the buyer pays the seller the gap. If the market is above it, the seller pays the buyer the gap.
- With market price plus or minus, the contract moves with the market, and the percentage is paid between the two companies each turn.
- The market price used is what the seller's units actually sold for that turn. If they did not sell, the published price is used, and the settlement says which one it was.
- Shortfall damages are now valued at the contract price for these agreements.
- The offer form shows what the seller receives and what the buyer pays in total for the option you pick.
- Older agreements keep working as before. They add a bonus or discount on the input price and do not fix a price.
- Standing offers on the board now mean market price plus or minus their percentage. The card says so ("Market +5%") and shows the per-unit price at today's market price. Taking an offer starts an agreement on that basis. Offers already taken keep their old terms.
