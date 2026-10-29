export const cabinetContent = `# Cabinet

A cabinet seat is the difference between voting on policy and running a department. Each seat gives its holder ministerial orders, standing policy settings, buildings to construct and a national influence tier, and an empty cabinet costs the government approval. In the US each seat is nominated by the President and confirmed by the Senate.

## Getting a seat

1. **Nomination.** Only the character holding the **President** office can nominate. The President picks a player or NPP and submits the nomination from the executive dashboard. One nomination per seat can be pending at a time, and the President can withdraw it before the vote closes.
2. **Senate confirmation.** The Senate votes for 24 hours, and the Senate vote decides whether a nominee takes office. See [Confirmation Process](/wiki/confirmation-process).
3. **Taking office.** A confirmed nominee is installed as the Cabinet member and the seat shows as filled.
4. **Direct appointment.** The White House Chief of Staff is the exception: the President appoints them alone, with no Senate vote, and can fire them at any time.

![A vacant cabinet seat is filled by nomination and a 24 hour Senate vote, by an acting secretary, or by direct appointment.](/wiki-images/diagrams/cabinet-seat-lifecycle.svg)

- **As President:** nominate, withdraw a nomination, fire a secretary, or seat an acting secretary.
- **As a senator:** vote on nominees.

Tips:

- Fill the Secretary of State, Defense and Treasury seats first.
- If the opposition holds the Senate, nominate someone they can accept or use an acting appointment as a bridge.
- Nominees: build relationships with senators before you are named.

### Why can't I nominate someone?

- You are not the President.
- The seat already has a pending nomination.
- The seat does not exist yet in the current year.
- The nominee holds an office that cannot be combined with this seat.

### Which seats exist

The US roster depends on the year. Seats unlock as follows (a world that starts later already has them):

| Seat | Available from |
| --- | --- |
| State, Treasury, Defense, Attorney General, Interior, Agriculture, Commerce, Labor | Always |
| Director of Central Intelligence, White House Chief of Staff | 1946 |
| Health, Education and Welfare (Health and Human Services after the Education split) | 1953 |
| Housing and Urban Development | 1965 |
| Transportation | 1967 |
| Energy | 1977 |
| Veterans Affairs | 1989 |
| Homeland Security | 2002 |
| Education | Only after the Department of Education Act passes |

The Chief of Staff is not in the line of succession.

### Parliamentary countries

In the UK, Japan, Germany and Ireland the Prime Minister, Chancellor or Taoiseach appoints ministers directly after [government formation](/wiki/government-formation), with no confirmation vote. The whole cabinet resets when the government changes. Japan also lets cabinet members propose bills through a cabinet review step before the Diet. UK and German ministers use the ordinary chamber route. Every country's seats and powers are in the [Cabinet Guide](/wiki/cabinet-guide).

## When a seat falls vacant

A seat becomes vacant when the Secretary resigns or is fired, when a new President takes office, or when the White House changes party. The turn never fills seats for you: the President must nominate or seat an acting secretary. A removed President is replaced (see [Impeachment](/wiki/impeachment)) and cabinet terms change with them, and a new President or a change of party after [General Elections](/wiki/general-elections) ends or resets cabinet terms.

An empty cabinet loses approval in proportion to the share of seats left empty, up to -7.5 (see [Government Approval](/wiki/government-approval)).

### Acting secretaries

A President can seat an acting secretary in a vacant seat from the cabinet page, without a Senate vote, so a department does not go dark while confirmation is pending.

- One acting appointment per seat per presidency. When it lapses the seat falls vacant and cannot be filled this way again.
- It lasts 24 turns. The cabinet page shows an Acting badge with the turns left.
- It needs a vacant seat. It cannot remove a confirmed secretary, install a nominee the Senate rejected, or fill a department that does not exist in the era.
- Confirmation wins: when the Senate confirms someone, they replace the acting secretary at once. An acting appointment does not cancel a pending nomination.
- An acting secretary has the same departmental powers as a confirmed one. Normal costs and cooldowns still apply.

## Running a department

Once seated you can issue ministerial orders (1 action each) that change metrics nationally or in target regions (see [National Metrics](/wiki/national-metrics)), set standing tier policies for free, designate a target region, and build assets. See [Cabinet Projects & Buildings](/wiki/cabinet-projects): a seat is what lets you build schools, plants and projects. Executive offices appoint cabinets (see [Player Progression](/wiki/player-progression)), and the cabinet action bonus that adds actions to ministers is described in [Core Systems](/wiki/core-systems).

![Cabinet page showing the seat count, pending votes and the principal officers table](/wiki-images/screens/cabinet-overview.webp)

| Item | Value |
| --- | --- |
| Senate vote window | 24 hours |
| Cabinet actions (ministerial actions) | Cap 4, regain 1 every 6 turns |
| Buy one extra action | 10 action points, once per turn, never above the cap |
| Ministerial order | Costs 1 action; lasts 24 turns by default |
| Acting secretary | 24 turns, once per seat per presidency |
| National influence tier | Confirmed member 1.5; acting secretary 0.75 (highest tier only, no stacking) |
| Approval cost | Acting secretary -0.5 each; empty cabinet up to -7.5 |

Say you are confirmed as Secretary of Energy with the full bank of 4 actions. On turn 0 you issue two ministerial orders: the bank drops to 2. Six turns later you have 3, twelve turns later you are back at 4. If you buy an extra action on turn 3 for 10 AP, the bank goes to 3 for that moment, and you can do that once per turn. Each order then runs for 24 turns, so two orders issued on turn 0 stay in force until turn 24 even after the bank refills.

\`\`\`wiki-chart
ministerial-action-bank
\`\`\`

Holding a seat sets your national influence tier (see [Elections Player Guide](/wiki/elections-player-guide)). The trade minister's office holds the embargo panel and spends cabinet actions (see [Embargoes & Trade Exposure](/wiki/embargo-and-trade-exposure)). The head of government and finance minister hold the taking and privatization powers (see [Nationalization & National Corporations](/wiki/nationalization)) and the powers over state companies (see [National Corporations](/wiki/national-corporations)).

Live in every world with a cabinet. The US uses nomination and Senate confirmation, and the US roster depends on the year. The UK, Japan, Germany and Ireland appoint directly. Several other countries, including China, the Soviet Union and the East German state, have their own cabinets; see the [Cabinet Guide](/wiki/cabinet-guide) for each country.

Last checked 2026-10-29, version 1.18.0. Exact rules and the full position list: [Cabinet design doc](https://docs.lakesidegames.net/design/cabinet.html)
`;
