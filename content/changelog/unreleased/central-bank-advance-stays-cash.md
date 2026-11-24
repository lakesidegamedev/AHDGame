---
date: 2026-11-24
title: "Central bank advances stay in cash and are sized to each bank"
summary: >-
  A liquidity advance from a monetary committee is now capped by the bank's
  deposits, and automatic bill purchases no longer spend it.
tags: [banking, central-bank]
badges: [patch]
areas: [fullstack]
---

When a monetary committee injects liquidity, each bank's share is now capped at
a tenth of its deposits, counting any advance it already carries. Before, the
whole amount was split by deposit share alone, so a small bank could receive
many times its own deposits.

Advance cash now counts toward the bank's cash floor until it is repaid. The
automatic sweep and manual bill purchases use only the bank's own cash above
the floor, so bills bought at the ask and valued at the bid can no longer turn
an advance the bank never asked for into a loss.

The bank treasury panel's cash floor now includes any outstanding advance.
