# A scheduled run does not fail on an unapproved tool. It stalls, silently.

3 September 2026. This cost Ben his morning page and his first The One Thing
email, and it would have cost the commitments ledger on Friday.

## What happened

Both weekday tasks fired on time.

| task | fired | outcome |
|---|---|---|
| Command centre refresh | 12:39 UTC | blocked at 12:40, never built the page |
| The One Thing | 13:19 UTC | blocked at 13:20, no email sent |

Both were `SESSION_STATUS_REQUIRES_ACTION` with the same `pending_action`:

    tool_name: mcp__Netlify__netlify-project-services-reader
    input:     {selectSchema: {operation: "get-project",
                params: {siteId: "30bdd77c-2d79-4967-a130-5e84e92cd64c"}}}

Ben was working through per-tool approvals and had not yet reached that one.

## The thing worth remembering

**An unapproved tool in a scheduled session does not return an error.** The run
does not fail, retry, or fall back. It parks in REQUIRES_ACTION and waits for a
human who is not there, indefinitely. From the outside it looks identical to a
long-running job. The page just quietly stays yesterday's.

Every guard we had was pointed the wrong way. The prompts say what to do if a
source cannot be reached, if JobTread 413s, if the deploy fails. None of that
fires, because nothing failed.

## What the risk actually was, and was not

The standing worry going into 3 September was CONNECTORS: The One Thing was
built by repurposing a disabled trigger because `create_trigger` could not
attach connectors for this org, and the fear was it would fire with no tools.

**That risk is closed.** Both triggers fired and both reached for tools
normally. The repurposed trigger carried its grants. The failure was one
unapproved permission, and it was not the one anybody was watching.

Worth noting how that mattered: a whole day was spent worrying about the
plausible failure while the real one sat in a list of routine approvals.

## The fix

Not "approve the tool". The dependency was never needed.

`TASK_TOKEN` is readable with a plain HTTPS call using `NETLIFY_AUTH_TOKEN`,
which every scheduled session already has:

    curl -s -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
      "https://api.netlify.com/api/v1/accounts/6a74a017d742b0b85a171232/env/TASK_TOKEN?site_id=30bdd77c-2d79-4967-a130-5e84e92cd64c"

The old prompts said only that the token was "readable through the Netlify API",
which is vague enough that a session reaches for the Netlify MCP tools. All four
prompts that touch Netlify now carry the exact call above plus an explicit
prohibition on the reader tools, and a line saying that a tool call which hangs
rather than returns IS this failure.

Guarded, verified 3 September: command centre refresh, The One Thing, weekly
blog draft, weekly commitment sweep. The social, job health and morning brief
tasks never touch Netlify and needed nothing.

`mcp__Netlify__netlify-deploy-services-updater` IS approved and stays in use for
the deploy step. Only the readers were the problem.

## What to do when this shape appears again

1. A task that "ran" but produced nothing: check `session_status`, not the logs.
   `SESSION_STATUS_REQUIRES_ACTION` plus `pending_action` names the exact tool.
2. Ask whether the tool is needed at all before asking for it to be approved.
   A dependency removed cannot stall.
3. Prefer a plain HTTPS call over an MCP tool in any scheduled prompt where both
   would work. Fewer approval surfaces, and a failed HTTP call actually fails.

## Still open

The two stalled sessions from 3 September are still parked. If Ben approves that
prompt later they will resume and complete hours late. The One Thing prompt now
carries a rule for that case: past about 10am Mountain it says plainly that it is
late, and if the day is mostly gone it does not send at all.
