---
date: 2026-11-04
title: "Governments buy from their own plants first and share the rest fairly"
summary: >-
  Behind two new stage switches, a government's world-market orders take its
  own country's sellers first, and what is left on the world market is shared
  between governments in proportion to what each still needs, instead of in
  alphabetical order. Both are off by default; nothing changes until they are
  switched on.
tags: [economy, producer-market, defence]
badges: [patch]
areas: [engine]
---

## What changed

- Government orders on the world market were filled in alphabetical order of country code. When the world was short, the governments early in the alphabet bought out the supply before the later ones were reached.
- On the latest turn the United States government asked for about 62,000 units of ordnance a day and received none. United States plants offered about 19,700 a day, and almost all of it was exported to France, Japan, Germany, Italy and Spain. The United States order was reached after the market was empty. Its price limit and budget were not the problem.
- With `producerPublicHomeFirstStage` at 1, each government's world-market order first buys from sellers in its own country, at its usual price limit and budget. What is left then goes to the shared market.
- With `producerPublicFairShareStage` at 1, government orders on the same world market split each price level in proportion to what each still wants. A government that hits its price limit or budget takes what it can afford, and its unused share goes to the others. No country is favoured by its name.
- On the latest turn home-first would deliver about 19,700 units a day to the United States government. Governments that build little ordnance of their own, such as France, Germany and Italy, would import less. Fair share then spreads the small remainder: the United Kingdom would get about 60 a day instead of 3.
