---
date: 2026-10-26
title: Bank loan payments charge each borrower their own instalment
summary: >-
  A bank servicing loans to several companies in one turn could charge one
  company for every borrower's instalment. Each borrower now pays only its
  own loans.
tags: [banking, bugfix]
badges: [hotfix]
areas: [engine]
---

## What changed

- When a bank collected loan instalments from several companies in the same
  turn, the payments could all be taken from the first company. Each borrower
  is now charged exactly its own instalments.
