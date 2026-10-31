---
date: 2026-10-31
title: Supply agreements can no longer be signed for goods that can never arrive
summary: >-
  A supply agreement now needs a buyer plant that actually uses the goods, and
  local services such as real estate need one in the contract's state. Live
  agreements that deliver nothing now say why.
tags: [corporations, market, ui]
badges: [patch]
areas: [backend, frontend]
---

Local services (real estate, healthcare, construction and freight) are only
delivered to plants in the same state. It was possible to sign one for a state
where the buyer had no plant that used it, and the contract then delivered
nothing every turn with no explanation.

Proposing, countering, accepting or taking an offer is now refused when the
buyer's plants could never receive the goods, with a plain reason. When you are
the buyer, the state picker lists only states where your own plants use the
service, and the offer board says which offers your plants cannot receive
instead of offering a Take button.

Live agreements now explain a short delivery: the buyer has no plant there that
used it, the supplier produced none, the supplier produced only part of the
volume, or the buyer's plants used less than the cap.
