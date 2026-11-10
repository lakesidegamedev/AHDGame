---
date: 2026-11-10
title: "A generated successor now belongs to the largest bloc"
summary: >-
  When no one is left to vote for and a successor is generated, that successor
  now joins the largest bloc instead of being created as an independent.
tags: [elections, succession, government]
badges: [patch]
areas: [engine, backend]
---

The generated president or prime minister was meant to come from the largest
bloc but was almost always created with no party. It now keeps the bloc's party
and gets a home region the bloc already holds. A seat that someone else filled
in the meantime is also no longer overwritten.
