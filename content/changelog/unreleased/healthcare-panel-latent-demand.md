---
date: 2026-11-22
title: "Healthcare page: government budget row matches the market"
summary: >-
  The government healthcare row on the Healthcare services page now converts each
  national budget to the common currency, so it no longer overstates demand.
tags: [commodities, healthcare, display]
badges: [patch]
areas: [fullstack]
---

## What changed

- The government healthcare row in Top consumers used budgets in each country's own currency, which made it far larger than the demand the market actually books. Budgets are now converted to the common currency first.
- The row is renamed "Government Healthcare Budget (latent)" and explains that it is the uncapped figure. The market books only the part that fits within a multiple of last turn's supply.
