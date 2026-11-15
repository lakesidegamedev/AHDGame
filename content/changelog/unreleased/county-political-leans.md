---
date: 2026-11-11
title: Repair the US 2027 opening
summary: >-
  Repairs US opening budgets, Cabinet funding, district holders, population
  totals and state election calendars. Uses dated provisional 2026 results
  with explicit fallbacks for unresolved or missing counts.
tags: [elections, budgets, resets]
badges: [patch]
areas: [engine]
---

- Maps the current law book to Cabinet funding and preserves the modeled
  spending composition through budget refreshes.
- Reconciles regional GDP, conserves whole-person population totals, and
  links opening House delegations to district holders.
- Replaces stale political allocations with a November 11 provisional
  snapshot, including Nebraska's nonpartisan chamber and Wyoming's 31 seats.
- Uses state-specific regional election years. State senates still use
  aggregate chamber renewal; missing counts and unmapped laws are labeled.
- Adds opening diagnostics and integrated regression coverage.
- Preserves Senate classes on opening incumbents and isolates incumbent lookups
  by country, including legacy US records.
- Matches 2027 House holders to the provisional district results and conserves
  demographic shares at exactly 100 percent.
- Ships corrected Census CD120 geometry for all 435 voting districts in the
  2027 preset. Historical map assets remain separate. Missing PVI uses a
  labeled modeled fallback rather than claiming observed voting data.
- Preserves Minnesota's short state-senate term after each census and keeps
  party abbreviations consistent after House elections.
- Records district winners, party labels and map geometry with new House
  results. Historical results use that record; older races without one are
  clearly labeled unavailable. Current holders have a separate live view.
- Carries unavailable district PVI through to map tooltips and labels missing
  district vote margins. Batches holder writes once per state.
- Enables Default Parties, No NPPs and No Parties for the 2027 reset while
  retaining 2027 world data. Empty starts apply to player countries, preserving
  economic actors and background governments. Recreated China parties now
  restore regional organization under their actual party IDs.
- Prevents legacy House rosters from aborting resets when district counts differ.
  Compatible delegations keep their declared vacancies; incompatible states are
  explicitly reported as unmapped without inventing incumbents.
- Matches the US 2027 opening sovereign bond coupons to budgeted debt interest
  and checks both principal and annual coupons during reset qualification.
- Reconciles US 2027 federal and regional grants using the existing formula,
  loads the correct state poverty records, and preserves valid zero rates.
  Saved law boards now omit absent restrictions and accept older BSON nulls.
- Preserves US 2027 regional opening services and their category mix through
  fiscal rollover, funding them alongside newly enacted regional programs.
- Keeps budget healing from restoring superseded law catalogs or erasing
  regional services and cash. Regional budget views now show cash separately
  from annual surplus and label formula-based grant program estimates.
- Scores metric summaries and democratic health against the active world year,
  preserving historical preset calendars and the 2027 opening after reset.
- Seeds Hungary's 2027 settlement quote and complete modeled political boards
  with matching approval calibration. Aid skips recipients without a treasury.
- Captures funded sovereign maturity payments and completed refinancing receipts
  in the v2 treasury flow, keeping principal aligned with settled bond stock.
- Aligns the US 2027 campaign income baseline with reconciled regional GDP.
- Prevents a second emergency loan when sovereign debt servicing has already
  been funded, preserving cash conservation and genuinely unfunded advances.
- Integrates the current development seed and census architecture, preserves
  called US House races, and labels unsupported modeled openings explicitly.
- Rejects national metric requests under another country's URL, keeping US
  and Canadian metric summaries and drilldowns isolated.
- Uses v2 systems only where the reset verified country coverage, retaining
  legacy receipt compatibility and the existing paths elsewhere.
- Recalibrates the optional 2027 campaign price factor to the corrected US GDP
  baseline while preserving the default flag-off behavior.
- Lets post-turn contest writes finish before reset rehearsal connections close.
- Uses national approval for national metric views, avoiding missing-census
  errors for synthetic US and Canadian national region IDs.
- Preserves Canada's modeled provincial services through budget healing and fiscal
  rollover, with shortfalls shown as unfunded services rather than surplus.
- Keeps Canadian opening-year provincial elections on their authored dates and
  labels every provincial cycle with its own election year.
- Seeds an unseated Canadian regional candidate bench in 2027 Default Parties
  worlds so provincial elections receive NPP competitors alongside Commons and
  premier contests, without appointing winners or refilling No NPPs worlds.
- Uses the Canadian default parties' nationwide regional presence when
  seeding Canadian party organizations and NPP candidate eligibility.
- Initializes working-age population before the first turn, preserving historical
  voting ages and preventing an artificial opening employment collapse.
- Keeps US annual grants synchronized with state receipts and preserves Canada's
  modeled provincial transfers through ordinary turns and fiscal rollover.
- Reconciles Canadian opening debt interest to the actual seeded bond coupons.
- Records corporate advertising, construction funding, organization transfers,
  and funded Treasury payments without duplicate operating-income or tax entries.
- Records NPP stock trades and corporation-founding fees against their investment cash, using the
  existing phase batch and preserving historical account denominations.
- Dates corporation wind-downs using the turn that actually processes them,
  closes departing cash accounts once, and keeps central-bank distributions out
  of Treasury receipts.
- Batches settlement bookkeeping and crisis board updates while retaining guarded
  cash writes, receipt recovery, and the existing economic rules.
- Keeps shared euro quotations synchronized for countries without a separate
  central bank, so corporate payments and cash valuation use the same rate.
- Batches annual market creation and income-tax reads, and reuses guarded
  banking and organization settlement metadata without changing payments or phase budgets.
- Restores every authored default-party roster during reset, including Canada,
  and preserves development cash records when an interrupted turn resumes.
