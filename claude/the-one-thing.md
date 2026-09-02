# The One Thing

One weekday email, 7am, replacing five. Set up 2 September 2026.

Trigger `trig_01LUzt5FNsedLsWm5raGk3NV`, cron `0 13 * * 1-5` UTC, which is 7am
Mountain while it is MDT.

The November clock-change trigger `trig_01FE4JGxKLzJhLbTWdHzxmkx` has been updated
to include it (becomes `0 14 * * 1-5` on 2 November), and told not to skip it on
the strength of its old OLD-prefixed name. That trigger was also told to work from
what `list_triggers` actually returns rather than trusting its own list, because
the account changed a lot on 2 September and a hardcoded list will rot.

## Why

On 2 September Ben got five emails from this system in forty minutes: job health,
social drafts, blog, commitment sweep and morning brief. Plus Buffer and
WordPress drafts sitting in two other apps. He would not have sustained it.

## Shape

Under 300 words, hard.

1. THE ONE THING. The single thing that needs him today, a short paragraph.
2. THEN, IF YOU HAVE TIME. Up to five, ranked, one line each.
3. WAITING ON YOUR APPROVAL. Buffer and WordPress counts with direct links. One
   line each, never the draft text.
4. WHAT YOU CAN IGNORE. One sentence, so a quiet day reads as quiet rather than
   as a broken pipe.
5. Two closing lines: the reply verbs, and the command centre link.

Monday folds job health in as a theme. Friday folds the commitments in as a
theme. Neither appends a section, both still fit in 300 words.

The command centre never emails. It is linked once, at the bottom.

## Reply to act, and the honest mechanics

Ben can reply DONE, DRAFT, ASK or JOB NOTE. It works, but not the way it looks.

**His premise was wrong in an interesting way.** The Outlook connector is not
technically read only, the send tools are all there. Read only is a deliberate
policy written into every task prompt, not a capability limit.

**The actual blocker is different.** Every task email is sent by Zapier from
`no-reply.mr0qgj@zapiermail.com`. Nobody reads that mailbox. A reply to it goes
nowhere.

**What makes it work anyway.** His reply lands in HIS OWN SENT ITEMS, and that is
fully readable. Confirmed 2 September: 23,643 messages searchable with bodies.
So each run reads Sent Items for anything starting DONE, DRAFT, ASK or JOB NOTE.

| Verb | What happens |
|---|---|
| DONE | POSTs to `/api/done`, which strikes it off the command centre and closes it in Friday's sweep |
| DRAFT | Written in his voice at the top of the next email, ready to copy |
| ASK | Answered in one or two lines at the top |
| JOB NOTE | Appended to `claude/job-notes-inbox.md` as a backup to the Plaud |

**The latency is real.** Nothing pushes. A reply is picked up on the next weekday
7am run, so a Friday afternoon reply is actioned Monday. That is stated in the
prompt so no future run pretends otherwise.

`/api/done` was changed on 2 September to accept the task token on POST as well
as GET, because without that a DONE reply had nowhere to land. Each record now
carries `via`, either `page` or `email-reply`.

## The connector problem, and why this trigger was not created fresh

`create_trigger` returned: *"this trigger stores no MCP connectors, so the
sessions it fires will run without connector tools"*, and passing `connectors`
explicitly returned *"not available for this organization"*.

A freshly created trigger would therefore fire with no Zapier, no Outlook, no
JobTread and no Buffer, and would silently do nothing. So instead of shipping a
dead trigger, the disabled `OLD Nuvo morning email brief` trigger was repurposed,
renamed and re-enabled, on the basis that it already carries those grants.

**This is not yet proven.** It is proven by the first 7am run and nothing else. If
that run produces no email, the fix is for Ben to create the Routine from the
claude.ai Routines UI, where it inherits his connectors, pasting the prompt from
the trigger or from this repo.

## Retirement, gated

`trig_01WWQn6b1QPi4FnZpGHiPp4v`, one shot, 8 September. It checks the deliveries
of 3, 4 and 7 September and only acts if all three are clean.

If clean it disables the morning brief and the job health report, and strips the
email step from the commitment sweep, the blog draft and the social drafts so
they write project docs instead.

**It must NOT disable the commitment sweep itself.** The sweep is the single
writer of the commitments ledger, and The One Thing reads that ledger every
Friday. Disabling it would quietly stop the ledger being maintained. Ben asked
for the sweep email retired, not the sweep. That distinction is written into the
retirement prompt in capitals because it is the easiest thing in this whole
change to get wrong.

Until 8 September Ben gets duplicates. That is the deliberate cost of a safe
cutover, and it is what he asked for.
