---
date: 2026-10-27
title: Refund governor proposal costs when bills become law
summary: Governor-queued bills refund their original payer on enactment, including bills introduced before explicit payer attribution.
tags: [legislation, governors, refunds]
badges: [patch]
areas: [backend]
---

## What changed

- Preserve the governor's payer ID when a queued bill is introduced by a party NPP.
- Use the governor attribution on older bills when no explicit payer ID is recorded.
- Keep ordinary player and party-chair proposal refunds unchanged.

Tracks #5052.
