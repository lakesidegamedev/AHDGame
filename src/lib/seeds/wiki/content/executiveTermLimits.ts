export const executiveTermLimitsContent = `# Executive Term Limits

Some countries cap how many terms one character can hold the top executive office. Once you reach the cap you can no longer file for that office, and in most of these countries you cannot be picked as a running mate either. Check the cap before you plan a long career around one office.

## How it works

Limits are set per country. A country with no limit has no cap: you can run for that office as often as you can win it. The UK, Germany and every other country not in the table have no executive term cap.

### Key numbers

| Country | Office | Term cap | Blocks running-mate picks too |
| --- | --- | --- | --- |
| United States | President | 2 terms | Yes |
| Ireland | Uachtarán (President) | 2 terms | No |
| Brazil | President | 2 terms | Yes |
| Nigeria | President | 2 terms | Yes |

**"Blocks running-mate picks"** is the important distinction. In the US, Brazil and Nigeria, a term-limited character cannot be selected as a running mate, because the vice president can inherit the presidency and that would be a back door around the cap. In Ireland the limit only blocks re-election to the Uachtarán seat itself.

### How terms served are counted

Your count for a country is the higher of two numbers:

1. A **running counter** on your character, increased each time you are seated as president after winning an election, or when you succeed to the presidency from the vice presidency.
2. Your **career history**, scanned for every time you were elected or appointed to that office in that country.

Taking the higher number means a character with an old history but no counter still counts accurately, and a history that under-reports cannot give you a fresh two terms.

Things that follow from this:

- **A partial term counts as a full term.** A vice president who takes over mid-term gets the counter increased by one, the same as winning an election.
- **A vice president who has already hit the cap cannot take over.** Succession is blocked for them.
- **An acting presidency from a [Contingent Election](/wiki/contingent-election) does not raise the counter, but it is recorded as an appointment in your career history, and the history scan counts appointments.** In practice it adds to your total.
- **Founding terms do not count.** Terms flagged as founding terms in a character's history are subtracted from the total.
- **The count is per country.** Terms served in one country never count against your limit in another.

## Worked example

A US character wins the presidency in cycle 3 and again in cycle 4. The counter reads 2 and the history shows 2 elected events. The cap is 2, so the character cannot file for President again, and cannot be chosen as anyone's running mate. They can still run for Senate, Governor or any other office the limit does not cover.

Another character wins the presidency once, then as vice president in a later administration succeeds a president who leaves office. The counter goes to 2. That character cannot run for President in the next election.

A third character is made acting president after a House deadlock. Their running counter stays at 0, but their career history now shows an appointment as president, and the history scan counts it, so their total is 1. They win one election later: the total becomes 2 and they are capped. In practice the acting term costs them one of their two terms.

## What you can do

- **Check your count before you commit.** The executive page for the country and the White House page show the term cap for the office; your career history on your character shows each term you have served.
- **Plan succession.** A term-limited US President needs a running mate or successor who is not them. The candidate list is filtered by eligibility before any votes are cast, so a term-limited character never appears on the ballot.
- **Move to another office.** The block covers one office in one country. Every other office stays open.
- **Pick a running mate carefully.** In the US, Brazil and Nigeria, a character who has already served two terms cannot be selected as Vice President.

## Common questions

- **Does a partial term count?** Yes, a succession counts as a full term for the counter.
- **Can a term-limited President be Vice President?** Not in the US, Brazil or Nigeria. They cannot be picked as a running mate.
- **Do the UK or Germany have limits?** No. Only the countries in the table do.
- **Does the acting president from a House deadlock count?** It counts through your career history, so treat it as a term.

## Connections

**Driven by**

- [Contingent Election](/wiki/contingent-election): an acting presidency is recorded in career history and so adds to your term total.
- [General Elections](/wiki/general-elections): winning a presidential election adds a term to your count.

**Affects**

- [General Elections](/wiki/general-elections): a capped character cannot file for the office or appear on the ballot.

## Status

Live in the United States, Ireland, Brazil and Nigeria. Other countries have no executive term cap.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules and edge cases are on the [executive term limits design page](https://docs.lakesidegames.net/design/executive-term-limits.html).
`;
