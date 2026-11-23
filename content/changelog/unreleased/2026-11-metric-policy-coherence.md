---
date: 2026-11-23
title: Metrics, budgets and approval now add up and follow the laws in force
summary: >-
  Estimated metrics stop sliding for no reason and follow the laws actually in
  force. States and provinces use real data, budgets and approval explain every
  number, and approval no longer counts national performance twice.
tags: [metrics, legislation, policy, budget, approval, seeds]
badges: [patch]
areas: [backend, frontend]
---

## What changed

### Metrics
- Fixed estimated metrics (air quality, crime, health coverage, social cohesion, public trust and others) drifting down in every state and province. Opening state and provincial laws with no regional budget line were treated as unfunded. Affected metrics now move toward the level that matches current laws and conditions.
- Law pressure on the metrics page now shows the change from the opening law, which is what moves the metric. Laws that match the opening law show no pressure, and replacement laws show only their change.
- Each metric now shows its 0 to 100 score, so domain scores can be checked. Military readiness now counts toward the Security domain.
- Metric history charts now place points by turn, label values, and show each recorded turn on hover.
- Voter turnout shows the election it comes from. Treatment delay and housing burden units use consistent labels.

### State and provincial data
- US states and Canadian provinces now start from real figures for crime, air quality, carbon, renewable power, protected land, food insecurity, incarceration, turnout, roads, health coverage and graduation, instead of copies of the national value or income-based tiers.
- Violent crime uses the same offence categories in both countries. Canada previously used a broader definition that roughly tripled its rate.
- Air quality uses one scale based on fine particle pollution in every country, so equal air reads equal.

### Policy page
- The Policy page now shows the enacted level of each law. Some laws, such as Ethics and Audit or National Security, previously showed their lowest level.

### Budgets
- Interest now shows the average rate actually paid, and the refinancing ladder adds up to the interest line.
- The defence debt tile says it covers defence only, and the whole-budget deficit per turn is shown next to it.
- Debt projections list the growth, rate and balance they use.
- Environment and energy, justice and public safety, and housing now have their own spending lines instead of sitting in Other.
- International dues show each organization's name.

### Approval
- National approval no longer adds national performance on top of regional approval, which already reflects it.
- Every approval effect explains what its numbers mean, where it comes from, and when it ends.
- Region approval adds up line by line, including the gradual movement toward the target.
- Largest effects are always listed first, and all of them can be expanded.
- The regional average matches the regions listed below it.
- Cabinet rosters show loading and error states instead of "No positions configured".
- The White House page shows the correct start date for the administration.

### Parties and policy
- Party list player counts use the same rule as party headquarters (active, unbanned players).
- The members table shows every office a member holds, with the same titles as the overview.
- Parties with no members show as dormant.
- Discord invite links are hidden in party agendas and can no longer be saved there.
- Law counts use one definition on every page. Tariffs and subsidies are counted separately.
- Old statutes replaced by a newer law no longer appear alongside it, and each law names the bill that enacted it.


### States, provinces and government
- Region pages say why a chamber has no members instead of showing an admin message. DC is described as the nation's capital.
- Canadian provinces show their own legislature titles and no Senate card.
- Lean, registration, organization and projected seats are each defined where they appear. Premier cards explain that premiers are elected separately from the legislature.
- A majority is half the full chamber plus one, and governments are described by the seats they hold.
- A vacant House minority leader seat explains how it gets filled.
- State budget cash reads the same ledger as state debt.
- When a Supreme Court seat opens under a player President, they are notified at once and again after 48 turns. If the seat is still empty after 96 turns, the Administration files a nominee from the President's party and the Senate votes as usual.
- The Supreme Court page exists only for countries that have one in the game.

### Elections
- Each race lists every party primary's front-runner, labelled by party, instead of one primary's leader as the race standing.
- Single-candidate primaries and races are marked uncontested.
- The election night board appears only once counting starts.
- Races say when the sitting officeholder is not running, and why.
- Primary estimates explain how they are calculated, and the filing deadline is shown.
- The national party members table shows state party roles such as chair.
