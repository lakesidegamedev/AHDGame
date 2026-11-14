---
date: 2026-11-14
title: Steadier sign-in when the Lakeside account check has a hiccup
summary: >-
  Sign-in now retries the Lakeside account password check once when the request
  never reached the account service, and records why a check failed so brief
  outages can be diagnosed.
tags: [accounts, reliability]
badges: [patch]
areas: [backend]
---

## What changed

- When the Lakeside account check times out or the connection drops before an
  answer, sign-in tries once more straight away before reporting that sign-in is
  temporarily unavailable. A wrong password is never retried.
- Each failed check is logged with its reason (timeout, refused connection,
  name lookup, or the service's HTTP status), which account service node
  answered, and a request id.
- The account fields admin status now counts sign-ins refused because the check
  was unavailable, for the last hour and per hour for the last day.
