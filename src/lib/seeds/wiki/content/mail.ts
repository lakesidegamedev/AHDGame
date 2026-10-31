export const mailContent = `# Mail

When you want to say something to one person and nobody else, you use Mail. It is private, one-to-one messaging between player characters, and it sits inside the [Notification Center](/wiki/notifications) inbox as its own segment, separate from system notifications, where unread mail also adds to your counts. Use it to negotiate with an ally, ask a party chair a question, or arrange a deal without posting in public.

## Writing a message

You write a message to another character and it appears in their inbox at once. Each message has a subject and a body, and is private to the sender and the recipient. Mail is for talking to people. Anything you do not want in the public [News](/wiki/news) feed belongs here. Most automatic game events (election results, bill status, wires) arrive as notifications instead.

| Limit | Value |
| --- | --- |
| Subject length | 1 to 80 characters |
| Body length | 1 to 1,000 characters |
| Send rate | 1 message per minute per character |
| Blocked players | up to 500 |
| Who you can write to | Another player character, not yourself |

**Why there is a send limit:** one message a minute stops anyone flooding another player's inbox. If a player blocks you, you are not told, so a blocked sender cannot tell whether the block or a ban is the reason.

## Where it lives

Open **Notifications**, then the **Mail** segment. New mail starts from a character's profile, on its Mail tab. Your sent messages appear inside each thread next to the replies. Everything that is not mail sits in the **Notifications** segment, while **All** and **Needs action** mix both. The Notification Center hosts the inbox and the archive, mute and snooze controls.

Some mail is automatic. At character creation, where the starter checklist is on, a welcome mail from the Game Guide arrives. Forex order fills send mail from the Forex Market ([Currency Exchange](/wiki/currency-exchange)), and a failed currency defence mails the central bank chair. A hard party whip mails the members it binds, a bank mails its decision on your loan, and an IMF restructuring mails the affected bondholders. These have no player behind them, so there is nobody to reply to.

## Reading and deleting

Unread mail is tracked per message. Opening a thread marks every received message in it read. Deleting a received message hides it from your inbox but does not erase the sender's copy. A message is removed completely only after both sides have deleted it.

## Sending, blocking and reporting

- **Send mail** from the recipient's profile: open its Mail tab, enter a subject and body, send.
- **Read, reply and delete** from the Mail segment. Replies go into the existing thread.
- **Block a player** from their profile. A block hides their existing mail, stops them sending you more, and they are not told. You manage your blocked list in Settings, and can unblock there.
- **Report abusive mail** from the thread, which reports the latest message you received in it. One report is allowed per message. Reports go to the game's moderators, who review the message as it was sent, even if you delete it afterward.

Say you want to propose a joint fundraiser to the chair of your state party. Subject: "Joint fundraiser, Saturday" (26 characters). Body: three short sentences with the date and split (about 200 characters). Send. If you try to send a second message within 60 seconds, you are asked to wait. If the chair replies, their message appears in your Mail segment with an unread count.

What does not work: you cannot mail a non-player politician (NPP), a retired character, or someone who is banned or has blocked you. In the last two cases you see the same generic refusal. A prohibited-language filter, the same one used on news posts, rejects messages with slurs. Do not use mail to share real-world personal data.

Applies in every world for characters in good standing; automatic mail such as the welcome message depends on whether the starter checklist is on there. Last checked 2026-10-29, version 1.18.0. Exact rules: [Mail (design)](https://docs.lakesidegames.net/design/mail.html)
`;
