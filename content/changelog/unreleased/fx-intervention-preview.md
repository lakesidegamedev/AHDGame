---
date: 2026-10-18
title: FX defence budgets and live policy estimates
summary: FX intervention now pays for useful movement without overshooting its band. Chairs can preview costs, set a spending limit and see which reserves can fund each direction.
tags: [economy, forex, central-banks]
badges: [minor]
areas: [fullstack, engine]
---

- Live estimates show next-turn reserve draw, expected rate movement and conditional sustainability warnings while editing band or peg targets.
- Suggested bands near the current quote or fundamentals remain estimates, not guarantees.
- Supporting a currency uses foreign reserves; weakening it uses domestic funds. Both available amounts are shown separately.
- Useful impact caps the spending request. Market activity and credibility affect cost and effectiveness, and tiny peg deviations have a tolerance.
- An optional home-currency spending limit overrides the automatic limit of 10% of usable reserves per turn. Existing commitments keep their bounds.
- Paid reserve movements have recoverable publication receipts on both standalone and replicated MongoDB, with no second charge on retry.
