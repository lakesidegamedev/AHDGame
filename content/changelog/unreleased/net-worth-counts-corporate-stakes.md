---
date: 2026-11-10
title: "Net worth counts shares your companies hold in other companies"
summary: >-
  A company's shares in another company now count toward the net worth of its
  shareholders, in proportion to their stake.
tags: [economy, corporations]
badges: [patch]
areas: [backend]
---

## What changed

- Net worth and the wealth list now include shares a company you own holds in other companies, valued at the other company's share price and scaled by your share of the owner.
- This follows chains, so a company held by a company held by you is counted too.
- Your direct share holdings are valued as before. No cash moves and no prices change.
- Players who own companies with subsidiaries may move up the wealth list.
