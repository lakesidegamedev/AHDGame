---
date: 2026-10-27
title: Central bank liquidity injections no longer drain private banks
summary: >-
  Cash a central bank injects into private banks is still owed back, but no
  longer charges interest. Banks can repay it at any time.
tags: [banking, central-bank, monetary-policy]
badges: [patch]
areas: [backend]
---

## What changed

- A liquidity injection credits the receiving banks' vaults and records the
  same amount as owed to the central bank, as before. That injected part of the
  debt now carries no interest.
- Voluntary margin borrowing still pays interest as before. When a bank repays,
  the interest-bearing part is repaid first.
- Previously the injected debt charged full margin interest. Banks that never
  asked for the cash paid millions a turn on it until their capital ran out,
  and several failed or had their charters revoked.
