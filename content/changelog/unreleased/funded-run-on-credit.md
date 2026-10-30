---
date: 2026-10-30
title: Companies short of cash can keep their plants running on credit
summary: >-
  A private company that runs out of cash no longer has to idle every plant.
  It can keep staffing them and owe its workers and site bills for a while,
  paying them back first out of what it sells next. The credit is limited, so a
  company that keeps losing money still has to stop.
tags: [economy, corporations, balance]
badges: [patch]
areas: [engine]
---

- Player and AI companies on the funded market can now run their plants when
  their cash does not cover the turn. Wages and site bills they cannot pay are
  owed to the workers and payees and paid first out of the next turns' sales.
  No money is created: the people owed are simply paid late.
- Materials are still bought with cash. A company with no cash at all can run
  plants that need no purchased inputs, or that use inputs it already holds.
- A company can owe up to two turns of its full wage and site bill. If what it
  owes has not gone down for four turns, the credit stops and it runs on cash
  alone until it pays down its bills.
- State companies are unchanged: their treasury still advances their run.
