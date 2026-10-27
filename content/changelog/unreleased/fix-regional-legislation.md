---
date: 2026-10-27
title: Regional legislation access and party proposals
summary: >-
  Regional offices use the current legislative composer with automatic party
  legislator selection. Party chairs can introduce regional bills through their
  seated party legislators, and region headers link directly to the legislature.
tags: [legislation, governors, parties, navigation, subsidies]
badges: [minor]
areas: [fullstack]
---

## What changed

- The Governor's Office selects its composer from the server-resolved legislation version and automatically chooses an eligible party NPP.
- Region headers link to the configured legislature beside the executive office shortcut, including when that office is vacant or inaccessible.
- National party chairs and the target region's state chair can propose through an eligible seated party NPP. The chair pays the usual costs and receives the normal passage refund.
- Busy, retired, foreign-party and reserved party legislators are excluded. Concurrent chair requests for one legislator are protected by a partial unique index.
- National MP and admin proposal composers and both regional composers explicitly offer the Subsidies domain. Existing active-bill restrictions remain enforced.

## Compatibility

- Migration `2026-10-27-party-npp-regional-bills` adds the concurrency index. Bootstrap restores it after resets.
- The optional `proposalPayerId` field is written only for chair-directed bills. Existing bills require no backfill and retain sponsor-based refunds.
- Tracks #5052.
