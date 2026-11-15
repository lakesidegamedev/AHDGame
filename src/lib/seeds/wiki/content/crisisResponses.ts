export const crisisResponsesContent = `# Crisis Responses

Each crisis lists the responses available to specific offices. This page covers who can pull one, what it costs, how Congress acts through an emergency bill, and how what you did, or did not do, is recorded. The basics of crises are on [Crises](/wiki/crisis-interaction).

## Who can act

Responses are called levers. Each lever belongs to one office, and you only see the levers for offices you hold right now.

| Office | Acts as |
| --- | --- |
| Head of state or government | Executive spending, emergency measures, diplomacy |
| State governor | Response inside your own state only |
| Legislature | Through an emergency bill (below) |
| Central bank chair | Rates and liquidity |
| Finance minister | Budget and fiscal measures |
| Corporation CEO | Company-funded response, from a company in the affected area |
| Party leader | Party-level response |

A lever must also be in the right stage. Some are offered only at signal, others only at peak. Most have a cooldown after you use them, so you cannot pull the same one every turn. A crisis outside your country is outside your jurisdiction, except for CEO levers, which depend on where your company operates. Pulling a lever twice in the same turn charges you once. If a charge fails, anything already taken is refunded.

Pulling a lever can be done at partial strength. A partial pull removes less severity and costs proportionally less.

## What a response costs

Levers spend real resources. A lever can cost one or several of these:

- **Treasury cash.** Paid from your country's treasury ([National Budget](/wiki/national-budget)). If the treasury cannot cover it, the response is blocked and says so.
- **Company cash.** Paid from the liquid capital of a corporation you run. You pick the company when you pull it. If it cannot afford it, nothing is charged.
- **Approval.** A cost in national [government approval](/wiki/government-approval). Strong, unpopular measures cost points.
- **Actions.** Bigger levers spend actions from your per-turn action budget, the same one you use for campaigning, legislating and business. A crisis response competes with those for the same turn.

The lever card shows its cost before you confirm. Costs charge when you confirm, and your response counts toward the crisis on the next turn.

## The emergency bill

A legislator cannot just spend. A legislature lever raises a fast-track **emergency bill** instead. Any sitting member of the legislature or a congressional leader can propose one. The bill goes to a vote in the normal way, with a shorter voting window than an ordinary bill, and nothing is charged when it is proposed. Only one bill per response can be before the chamber at a time.

- **If it passes,** the response counts as pulled by the sponsor, the appropriation is spent, and it reduces severity like any other lever.
- **If it fails or is withdrawn,** the crisis records that the legislature did not act.

## Your record

Every crisis keeps a ledger: for each turn, who held which office, what they pulled (or that they had levers and pulled none), what it cost, how much severity it removed, and how bad the crisis was at that moment. It is shown on the crisis detail page as **Who did what**, with plain wording and cost lines. A holder who could have acted and did not is recorded as inaction, and it is weighted by how severe the crisis was.

The record only covers offices that were in a position to act. A governor is only on the hook for crises in their state. A CEO only for crises touching their company's sectors or regions. Party leaders are only on the hook for national and world crises.

## What a crisis leaves behind

The record is not just for show. It feeds three consequences.

- **Blame and credit at elections.** Effective responses earn credit, and inaction at high severity earns blame. Both fall on the people who held the office at the time and on their party in the affected area. See [Election Mechanics](/wiki/election-mechanics).
- **Lasting damage.** A crisis that reaches a high enough peak can leave a lasting loss: lower regional output, damaged plant capacity, lost trust in institutions, population loss or a worse credit standing. These heal slowly over time. The crisis detail page lists them with their progress.
- **Forced events.** A crisis that stays at a high severity for long enough can force an event: a state of emergency, a strike, an impeachment motion, a path toward sovereign default (see [Sovereign Default](/wiki/sovereign-default)) or a bank run. Each fires at most once per crisis.

Last checked 2026-11-08, version 1.20.0. Exact rules: [Crisis System](https://docs.lakesidegames.net/design/crisis-system.html)
`;
