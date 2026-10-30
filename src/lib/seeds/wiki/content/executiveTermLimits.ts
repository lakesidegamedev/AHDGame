export const executiveTermLimitsContent = `# Executive Term Limits

You have won the presidency twice. Can you file a third time, and can anyone pick you as a running mate? In some countries the answer is no. Once you reach the cap you can no longer file for that office, and in most of these countries you cannot be picked as a running mate either. Check the cap before you plan a long career around one office.

| Country | Office | Term cap | Blocks running-mate picks too |
| --- | --- | --- | --- |
| United States | President | 2 terms | Yes |
| Ireland | Uachtarán (President) | 2 terms | No |
| Brazil | President | 2 terms | Yes |
| Nigeria | President | 2 terms | Yes |

Limits are set per country. A country with no limit has no cap: you can run for that office as often as you can win it. The UK, Germany and every other country not in the table have no executive term cap.

## Running mates are blocked too

In the US, Brazil and Nigeria, a term-limited character cannot be selected as a running mate, because the vice president can inherit the presidency and that would be a back door around the cap. In Ireland the limit only blocks re-election to the Uachtarán seat itself. So a term-limited US President cannot simply slide onto the ticket as Vice President. They need a successor who is not them, and the candidate list is filtered by eligibility before any votes are cast, so a term-limited character never appears on the ballot. Pick a running mate carefully: in the US, Brazil and Nigeria, a character who has already served two terms cannot be selected as Vice President.

## What counts as a term

Your count for a country is the higher of two numbers:

1. A **running counter** on your character, increased each time you are seated as president after winning an election, or when you succeed to the presidency from the vice presidency. Winning a presidential election in [General Elections](/wiki/general-elections) adds one. Ireland's Uachtarán race does not move this counter, so there the history below is the count.
2. Your **career history**, scanned for every time you were elected or appointed to that office in that country.

Taking the higher number means a character with an old history but no counter still counts accurately, and a history that under-reports cannot give you a fresh two terms.

- **A partial term counts as a full term.** A US vice president who takes over mid-term gets the counter increased by one, the same as winning an election.
- **A US vice president who has already hit the cap cannot take over.** Succession is blocked for them. Automatic vice-presidential succession only runs in the US.
- **An acting presidency from a [Contingent Election](/wiki/contingent-election) does not raise the counter, but it is recorded as an appointment in your career history, and the history scan counts appointments.** In practice it adds to your total.
- **Founding terms do not count.** Terms flagged as founding terms in a character's history are subtracted from the total.
- **The count is per country.** Terms served in one country do not count against your limit in another. The one exception is an old history entry with no country recorded, which the scan counts in every country with the same office.

## Three characters, three counts

A US character wins the presidency in cycle 3 and again in cycle 4. The counter reads 2 and the history shows 2 elected events. The cap is 2, so the character cannot file for President again, and cannot be chosen as anyone's running mate. They can still run for Senate, Governor or any other office the limit does not cover.

Another character wins the presidency once, then as vice president in a later administration succeeds a president who leaves office. The counter goes to 2. That character cannot run for President in the next election.

A third character is made acting president after a House deadlock. Their running counter stays at 0, but their career history now shows an appointment as president, and the history scan counts it, so their total is 1. They win one election later: the total becomes 2 and they are capped. In practice the acting term costs them one of their two terms.

## Checking your own count

The executive page for the country and the White House page show the term cap for the office; your career history on your character shows each term you have served. The block covers one office in one country, so every other office stays open. A capped character also cannot file for the office or appear on the ballot in [General Elections](/wiki/general-elections).

Applies in the United States, Ireland, Brazil and Nigeria; other countries have no executive term cap. Last checked 2026-10-30, version 1.18.0. Exact rules: [Executive term limits (design)](https://docs.lakesidegames.net/design/executive-term-limits.html)
`;
