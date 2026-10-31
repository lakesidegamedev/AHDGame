---
date: 2026-10-30
title: Share sales and credit lines follow real company value
summary: >-
  When this rule is switched on, the stock market pool stops paying more for new
  shares than a company owns or earns, and your credit line counts shares in
  your own company at a safer value. Trades between players are not affected.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, corporations, stocks, credit]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

These rules ship switched off and start when the world turns them on. Fresh
worlds on the new producer market start with them on.

- **New shares sold to the market pool.** When a company goes public or issues
  new shares, the pool pays no more than the lower of the company's underlying
  share value (the price before market mood is added) and the higher of its
  book value per share or 15 times its recent yearly earnings per share. If
  the asking price is higher, the shares are still placed, at that lower price,
  and the result message says so.
- **A limit on how much one company can raise from the pool.** Over any 48
  turns, the pool buys new shares from one company worth at most the company's
  own book value. Anything above that waits as a pending placement and goes
  through once room frees up.
- **Credit lines.** Shares in a company you run, or hold more than 20% of, now
  count toward your borrowing limit at no more than half their price, and never
  more than the company's book value per share. Shares of that company you
  bought in the last 24 turns while drawing on your credit line count at zero.
  The credit screens explain this when it lowers your limit.
- A lower limit only stops new borrowing. Nothing is called in early, and your
  existing loan and repayments stay as they were.
- Buying and selling shares between players is unchanged.
