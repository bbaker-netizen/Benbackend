# Keeping the Away tab current

10 September 2026.

The Away tab reads its roster from `/api/leave`. Something has to put it there,
because NuvoCrew is an MCP connector and a Netlify function cannot reach it.

**The board is loaded and correct right now.** It was populated by hand from
NuvoCrew on 10 September. It will not update itself until the Routine below
exists.

## Why I could not create the Routine

`create_trigger` returns:

    the connectors parameter is not available for this organization

Without connectors, a Routine fires with no `mcp__NuvoCrew__*` tools at all, so
it cannot read leave. I created one, saw that warning, confirmed the connector
parameter is refused, and deleted it rather than leave a daily job running that
silently does nothing. Same limitation hit The One Thing on 2 September.

A Routine created from the **claude.ai Routines UI** inherits Ben's connectors.
That is the fix and it needs him, once, for about two minutes.

## What to do

claude.ai, Routines, New routine. Schedule: weekdays, 6am Mountain. Paste the
prompt below verbatim.

---

Refresh the leave roster behind the Away tab on Ben's command centre. Small job, no email, no page rebuild.

## What this does

The Away tab shows who is booked off over a rolling 45 day window. NuvoCrew is an MCP connector and the Netlify app cannot reach it, so this task mirrors the forward book into the app once a weekday.

The app stores the WHOLE forward book and the page slices 45 days from whatever today is in the browser. So pull wide, not 45 days.

## THE ONE RULE THAT MATTERS MOST

**If you cannot read NuvoCrew, post NOTHING and stop.**

Posting an empty roster would wipe a good one, and the page would then say "nobody is booked off in the next 45 days", which Ben would reasonably read as a fact about his team rather than a broken pull. A stale roster is safe because the page prints how old it is and turns amber past three days. An empty one is a lie. Never POST a `leave` array you did not actually build from live NuvoCrew rows.

Same if the pull returns rows but they look wrong, for example every name resolving to Unknown. Stop and say so in your task output.

## A tool that hangs kills the run

You are a scheduled session with nobody awake. An un-preapproved tool does not fail, it stops forever waiting for a permission prompt. Prefer plain HTTPS over MCP wherever there is a choice. If NuvoCrew tools hang, that is what happened; the roster simply stays as it was and the page says so, which is the designed behaviour.

## Step 1. Pull the leave

`mcp__NuvoCrew__leave` with `from` = today, `to` = today plus 120 days, `limit` 100.

It returns two blocks. **Leave balances are not what you want** and are not date filtered; ignore them entirely. You want **Leave requests**, which are date filtered.

Take every request whose `end date` is today or later. Include ones that started before today and have not finished, because someone mid-holiday is still away.

## Step 2. Put names to the ids

`mcp__NuvoCrew__find_people` with `limit` 100. Map `employee id` to a person.

Use the PREFERRED name with the surname where a preferred name exists, because that is what Ben calls people. Tatyana Hindson is "Skye Hindson". Where there is no preferred name, use the full name. Carry `position title` and `department name` too.

If an id resolves to nobody, use "Unknown" for that one row and say so in your output. Do not drop the row: a person being away matters even when the directory is behind.

## Step 3. Post it

Read `TASK_TOKEN` with plain HTTPS, no MCP tool:

    curl -s -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
      "https://api.netlify.com/api/v1/accounts/6a74a017d742b0b85a171232/env/TASK_TOKEN?site_id=30bdd77c-2d79-4967-a130-5e84e92cd64c"

Value is at `.values[0].value`. Capture it into a shell variable. Never echo it.

Then:

    POST https://nuvo-command-centre.netlify.app/api/leave
    header: Authorization: Bearer <TASK_TOKEN>
    body: {
      "source": "NuvoCrew leave management",
      "account": "<the name and role from mcp__NuvoCrew__whoami>",
      "horizonTo": "<the to date you used>",
      "counted": <number of rows>,
      "leave": [
        { "id": "<request id>", "name": "Skye Hindson", "title": "Estimator",
          "dept": "Pre-Construction", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD",
          "hours": 32, "type": "vacation", "status": "approved",
          "reason": "<the request reason>", "note": "<reviewer notes, plus approver name if useful>" }
      ]
    }

This replaces the whole roster each run, so send everything, not a delta.

`type` should be the leave type as NuvoCrew gives it: vacation, sick, or other. The page colours the bars from it.

## What not to do

- Never write to NuvoCrew. This is a read and a mirror, nothing else.
- Never email Ben. This task is silent. The Away tab is where the answer lives.
- Never rebuild or redeploy the command centre page. Different task, not yours.
- Never put TASK_TOKEN in your output.
- Do not filter out sick leave or leave you think is sensitive. The page already keeps reasons behind a tap; your job is to carry the data faithfully.

## Say what you found

In your task output, one short block: how many requests were in the window, how many people that is, the earliest and latest dates, any id that would not resolve, and whether the POST returned ok. If the forward book is empty, say that plainly, because an empty forward book is a real management signal and not a failure.

---

## Until then

The page states the age of the pull on every view and turns it amber past three
days, so a roster going stale is visible rather than silent. That was deliberate:
an empty leave board and a broken pipe look identical otherwise.

## Whose account this reads through

`mcp__NuvoCrew__whoami` returns **Bruce Baker, bbaker@4workplaces.com,
master_admin**, not Ben. Worth recording alongside "WordPress is Ellie's
account": the leave feed goes if Bruce's access goes, and it reads with
master_admin visibility rather than Ben's own.

## What the data actually said on 10 September

Checked against NuvoCrew directly, 1 January 2026 to 31 December 2027.

- 58 leave requests logged in 2026.
- **Exactly one is in the future**: Skye Hindson, 25 to 30 September, 32 hours,
  vacation, approved. Four working days.
- **Nothing at all booked between 1 October 2026 and 31 December 2027.**

The one booking carries an admin override for an unpaid overdraw of five days.
Her vacation balance shows 88 hours used against 80 accrued, so she is already
past her entitlement and this was allowed on top. Approved by Roland Rivard,
reviewed by Conrad Jones.

An almost empty forward book is the finding here, not a bug. Either the team
books late, or leave is being taken without going through NuvoCrew first. A
board that shows nothing is not visibility, it is a false sense of one, so this
is worth Ben knowing before he relies on the tab for planning.
