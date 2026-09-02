# Lessons

What has actually been learned about how Ben works and what a good suggested
action looks like on the command centre. The refresh task READS this before it
writes the buttons under each item, and APPENDS to it when a run learns something
worth keeping.

This file lives in the repo, not in the Claude project, deliberately. The refresh
task already clones and pushes this repo, so it can both read and add to it, and
every change is in version control. A project doc would only be readable by tasks
that hold the project tools.

## How to write a suggested action

Two or three per item. Never a menu.

- Name the actual next physical act. "Call Bonnie" beats "follow up".
- The first one should be the thing he would do if he only had two minutes.
- If a person is waiting, one action is always the reply to that person.
- If money or a signature is involved, one action is always the check before the
  commitment, not the commitment.
- Never offer an action the system cannot carry out or he cannot do from a phone.
- Never offer "Ask about this". It was the generic fallback and it taught him
  nothing. It was removed on 2 September 2026.

## What has been learned

**He clears in batches, late.** On 2 September he cleared five commitments
between 21:32 and 22:24 in one sitting. Suggested actions should assume he is
working a list at the end of a day, not reacting through it.

**He tells people yes before the paperwork is checked.** He told All Weather to
proceed at 3:51am, having said the day before that he wanted to cross reference
the quote with Sheena first. Where he has stated a check and then moved past it,
the suggested action is the check, and say why.

**He forwards rather than delegates.** "Hey Bruce can you help sort this out?"
with no date and no definition of done. Where he has forwarded something, a good
action is the one that closes the loop: ask what was found, or set the clock.

**Two minute replies clear standing up.** Say so on the item. He will do them
immediately if he knows they are small.

**A decision he only gets to make once deserves friction.** Say that too, so he
slows down instead of firing from the hip.

**Do not put a recurring task on him.** He has said this repeatedly. Suggested
actions are one offs, never a new standing commitment.

## What a snooze means

Snooze is not defer-and-nag. A snoozed item is GONE from the page until its date.
No count, no greyed row, no "3 hidden". On the morning it comes due it appears in
The One Thing, and only then comes back to the page. If he snoozes the same thing
twice, that is a signal it is not really a commitment, and the second snooze is
worth one quiet line in the email.
