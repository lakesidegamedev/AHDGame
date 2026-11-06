---
date: 2026-11-06
title: "Companies ship their own goods first on freight they own"
summary: >-
  Behind a new stage switch, a company that hauls its own output between its
  own plants gets first use of the freight capacity it owns in the state the
  goods leave. Only the rest of its capacity joins the shared pool. Off by
  default; nothing changes until it is switched on.
tags: [economy, logistics, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Until now every company's outbound bulk hauls from a state drew on one shared freight pool, first come first served. A company that had built logistics there could still see its own steel and building materials stuck behind other companies' loads.
- With `ownFreightFirstStage` at 1, a company's hauls to its own plants in other states use the freight capacity that company owns in the origin state first. Capacity it plans to use is kept back from other companies for that turn. Capacity it does not plan to use stays in the shared pool.
- The part of a haul carried on the company's own capacity is internal supply: it is not billed to the company and the state's freight fleet does not earn it. The rest bills and pays exactly as before.
- Companies with no freight capacity in a state keep using the shared pool, and so does every haul that is not an own-supply route. Applies only when own-supply routes run (freight settlement active).
