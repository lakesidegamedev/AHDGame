export const mailContent = `# Mail

Mail is private, one-to-one messaging between player characters. It sits inside the Notification Center inbox as its own segment, separate from system notifications. Use it to negotiate with an ally, ask a party chair a question, or arrange a deal without posting in public.

## How it works

You write a message to another character and it appears in their inbox at once. Each message has a subject and a body, and is private to the sender and the recipient. Mail is for talking to people. Automatic game events (election results, bill status, wires) arrive as notifications instead.

| Limit | Value |
| --- | --- |
| Subject length | 1 to 80 characters |
| Body length | 1 to 1,000 characters |
| Send rate | 1 message per minute per character |
| Blocked players | up to 500 |
| Who you can write to | Another player character, not yourself |

**Why there is a send limit:** one message a minute stops anyone flooding another player's inbox. If a player blocks you, you are not told, so a blocked sender cannot tell whether the block or a ban is the reason.

### Where it lives

Open **Notifications**, then the **Mail** segment. You can also compose from a character's profile. Sent mail has its own list. Everything that is not mail stays in the **Notifs** segment. See [Notification Center](/wiki/notifications) for archiving, muting and snoozing.

Some mail is automatic. At character creation, where the starter checklist is on, a welcome mail from the Game Guide arrives. Forex order fills also send mail from the Forex Market. These have no player behind them, so there is nobody to reply to.

### Reading and deleting

Unread mail is tracked per message. Opening a thread marks the latest received message read. Deleting a received message hides it from your inbox but does not erase the sender's copy. A message is removed completely only after both sides have deleted it.

## What you can do

- **Send mail** from the inbox or a profile: pick the recipient, enter a subject and body, send.
- **Read, reply and delete** from the Mail segment.
- **Block a player** from their profile. A block hides their existing mail, stops them sending you more, and they are not told. You manage your blocked list in Settings, and can unblock there.
- **Report abusive mail** from the thread. One report is allowed per message. Reports go to the game's moderators, who review the message as it was sent, even if you delete it afterward.

Worked example: you want to propose a joint fundraiser to the chair of your state party. Subject: "Joint fundraiser, Saturday" (26 characters). Body: three short sentences with the date and split (about 200 characters). Send. If you try to send a second message within 60 seconds, you are asked to wait. If the chair replies, their message appears in your Mail segment with an unread count.

What does not work: you cannot mail a non-player politician (NPP), a retired character, or someone who is banned or has blocked you. In the last two cases you see the same generic refusal. A prohibited-language filter, the same one used on news posts, rejects messages with slurs. Do not use mail to share real-world personal data.

Tip: mail is the right place for anything you do not want in the public [News](/wiki/news) feed.

## Connections

**Driven by**

- [Notification Center](/wiki/notifications): hosts the inbox and the archive, mute and snooze controls.
- [Currency Exchange](/wiki/currency-exchange): forex order fills send automatic mail.

**Affects**

- [Notification Center](/wiki/notifications): unread mail adds to your inbox counts.

## Status

Mail works in every world for characters in good standing. Automatic mail such as the welcome message depends on whether the starter checklist is on in that world.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Limits, rate rules and storage are on the [Mail design page](https://docs.lakesidegames.net/design/mail.html). See also [News](/wiki/news).
`;
