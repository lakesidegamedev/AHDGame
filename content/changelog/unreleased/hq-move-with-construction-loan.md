---
date: 2026-11-02
title: Headquarters moves no longer wait on a construction loan
summary: >-
  A company can now move its headquarters within the same country, or to a
  country that uses the same currency, while a construction loan on one of its
  sites is still being repaid. The loan keeps servicing from company cash as
  before.
tags: [corporations, construction, relocation]
badges: [patch]
areas: [backend]
---

A construction loan is secured on the site it financed, and the site does not
move when the headquarters does, so the loan no longer blocks the move.

Moving to a country with a different currency still requires the secured
construction to be settled first, because the move converts the company's
currency and rewrites its sector records.
