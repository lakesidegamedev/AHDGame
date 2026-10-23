---
date: 2026-10-23
title: Two unused search indexes removed from the turn's busiest logs
summary: >-
  The money transaction log and the action audit log each carried a text
  index that nothing searched. Removing them cuts index writes on every turn
  and frees about 600 MB. No gameplay change.
tags: [performance, turn, database]
badges: [patch]
areas: [engine, backend]
---

## What changed

- `financialTxLog_text_search` and `actionAuditLog_text_search` are dropped on
  existing worlds at startup and no longer created by the seed.
- No query used `$text` on either collection. The admin log search matches
  names with a regular expression, which a text index cannot serve, so search
  behaves exactly as before.
- Each row written to these logs previously added one index entry per name
  word. The two logs take roughly 100,000 rows a turn.
