# Scheduled trigger audit — 2 September 2026

Audit of every Routine (scheduled trigger) on Ben's account, why the Nuvo tasks
are not delivering, and what will and will not fix it.

## Headline

All six enabled recurring Nuvo tasks are firing on schedule. None of their
*scheduled* runs is finishing. Every one stalls partway through on an
**unanswered tool-permission prompt**, because the run is unattended and nobody
is there to approve it. The session is then marked `ABANDONED`.

This is an authorisation problem, not a broken-trigger problem. The trigger
definitions, crons and prompts are all fine.

**A force-fired run of the same trigger completes normally.** See "Force-fire is
not a valid test" below. This is the single most important operational finding
in this audit and it invalidates the obvious test method.

## Inventory

### Enabled, recurring (6)

| Trigger ID | Name | Cron (UTC) | Most recent run | Outcome | Stalled on |
|---|---|---|---|---|---|
| `trig_01NyZ1GbMUciuDcU6Ze9kXUX` | Nuvo command centre refresh (6:30am and 2:30pm) | `30 12,20 * * 1-5` | 2026-09-02 12:40 | PENDING / BLOCKED | `mcp__Microsoft_365__outlook_calendar_search` |
| `trig_01JXeNVQ48KWddB9qD4hT6NP` | Nuvo morning brief | `0 13 * * 1-5` | 2026-09-02 13:10 | PENDING / BLOCKED | `mcp__Zapier__inspect_zapier_actions` |
| `trig_018jWnV9qvpf2yjv7xXNW818` | Nuvo weekly job health report | `0 13 * * 1` | 2026-08-31 13:20 | ABANDONED / BLOCKED | `mcp__Zapier__inspect_zapier_actions` |
| `trig_01NNYHJXD6LB143GeMrCeoXG` | Nuvo weekly commitment sweep | `0 12 * * 5` | 2026-08-28 12:21 | ABANDONED / BLOCKED | `mcp__Zapier__inspect_zapier_actions` |
| `trig_018EbBLxXZNUbgJ1nmbECBKf` | Weekly Nuvo social post drafts | `0 8 * * 5` | 2026-08-28 08:05 | ABANDONED / BLOCKED | `mcp__Buffer__create_post` |
| `trig_01RCLSCcdJMWohRHp8F36ayk` | Weekly Nuvo blog draft | `0 9 * * 5` | 2026-08-28 09:06 | ABANDONED / BLOCKED | `mcp__Zapier__inspect_zapier_actions` |

### Enabled, one-shot (1)

| Trigger ID | Name | Fires | Status |
|---|---|---|---|
| `trig_01FE4JGxKLzJhLbTWdHzxmkx` | Clock change: shift Nuvo task times back an hour | 2026-11-02T16:00:00Z | Never fired. Cron targets in its prompt are arithmetically correct for MDT to MST. |

### Disabled, already OLD-prefixed (3)

| Trigger ID | Name | Most recent run |
|---|---|---|
| `trig_01LUzt5FNsedLsWm5raGk3NV` | OLD Nuvo morning email brief (superseded 25 Jul) | none recorded |
| `trig_01WWQn6b1QPi4FnZpGHiPp4v` | OLD Nuvo weekly job health report (superseded 25 Jul) | none recorded |
| `trig_0183oCWrJ51KDFoBmy4RvuLb` | OLD Weekly Nuvo social post drafts (superseded 25 Jul) | 2026-07-24 08:04 **SUCCEEDED** |

## On "last five run results"

Not available. The Routines API exposes only `last_run` — a single most-recent
record per trigger — and there is no run-history endpoint or tool. What is in the
table above is the complete run history retrievable from this account. Per-run
detail beyond that requires opening each fired session individually, and only the
most recent session ID is retained per trigger.

## Evidence

Each blocked run was opened directly. All six show the same shape:

- `session_status: SESSION_STATUS_REQUIRES_ACTION`
- `status_bucket: SESSION_STATUS_BUCKET_BLOCKED`
- a populated `pending_action` naming the exact tool call awaiting approval

Example, the weekly commitment sweep (`cse_01QwsnsRVfQkPCz3wrc2AML4`), stalled
mid-run on the call it needed to send Ben the email:

```
"pending_action": {
  "display_tool_name": "Inspect Zapier Actions",
  "input": {"selected_api": "ZapierMailCLIAPI",
            "tool_name": "email_by_zapier_send_outbound_email"},
  "tool_name": "mcp__Zapier__inspect_zapier_actions"
}
```

The social drafts task got further still — it had the finished post written and
was stalled on the call that would have saved it to Buffer as a draft. The work
was done. It just could not be delivered.

## Force-fire is not a valid test

`trig_01NyZ1GbMUciuDcU6Ze9kXUX` (command centre refresh) was force-fired from an
interactive session at 18:10:08 UTC on 2 September as a diagnostic. It ran to
completion in about 7.5 minutes:

- `session_status: SESSION_STATUS_IDLE`
- `status_bucket: SESSION_STATUS_BUCKET_REVIEW_READY`
- no `pending_action`
- real work done: 33,208 output tokens, $5.40

The same trigger, same prompt, unchanged, had blocked that morning at 12:40 UTC
on `mcp__Microsoft_365__outlook_calendar_search`.

The only recorded difference between the two runs is `origin`:
`force_run_trigger` versus `scheduled_trigger`.

**Inference.** A force-fire initiated from an interactive session appears to
carry an approval context that a scheduled fire does not have, so it sails past
the gate that stops the scheduled run.

**Competing explanation, not yet ruled out.** Something may simply have changed
between 12:40 and 18:10 — a permission approved by hand, or a connector
re-authorised — in which case scheduled runs are now fine too.

These two are distinguishable only by watching a real scheduled run. The next one
is 20:30 UTC (2:30pm Mountain) the same day.

**Consequence for testing.** "Force-fire it and see if it delivers" cannot
confirm these tasks are fixed. It can return green while every scheduled run
still fails. Only an observed scheduled run counts as proof.

## Root cause, and the date it started

**Fact.** The only `SUCCEEDED` run anywhere in the account's trigger records is
24 July 2026, on `trig_0183oCWrJ51KDFoBmy4RvuLb` — a trigger that is now disabled.

**Fact.** That successful session carries no `chat_project_id` and lacks the
`config:routine-lineage-none` tag. Every blocked session since carries
`chat_project_id: 019f7597-cf0e-75f1-a96b-d7088d8add17` and that tag.

**Fact.** The current tasks were created 25 July (morning brief, job health,
social drafts), 26 July (commitment sweep) and 1 August (blog draft, command
centre) — replacing the ones now marked OLD.

**Inference.** The 25 July rebuild moved these tasks under a Claude project, and
runs in that context prompt for MCP tool permission instead of proceeding. No run
has completed since. The rebuild is what broke them.

This matters for the remedy: recreating the tasks is the thing that caused this,
and doing it again repeats it.

## Why recreating the triggers will not fix it

1. The failure is at the permission gate, downstream of anything a trigger
   definition controls. A new trigger with the same prompt hits the same gate.
2. `create_trigger` exposes no `permission_mode`. There is no way to mint a
   trigger whose fired sessions are more permitted than the current ones.
3. Its `connectors` parameter does not help either. The documentation is explicit
   that it "attaches the connectors only — individual tool calls from fired
   sessions still go through runtime permission checks." The connectors are
   already attached and working: Zapier, Buffer and Microsoft 365 tools are all
   being reached and called. Only the approval is missing.

Recreating all six would cost the run history, add six more OLD entries to a list
that already carries three stale ones, and leave the tasks exactly as broken.

## What will fix it

The permission grant lives in Ben's account and project settings, not in the
trigger definitions, so it has to be changed there. The tools that need standing
approval for unattended runs:

- `mcp__Zapier__inspect_zapier_actions` and `mcp__Zapier__execute_zapier_write_action`
  (email delivery — blocks the morning brief, commitment sweep, job health report
  and blog draft)
- `mcp__Microsoft_365__outlook_calendar_search` and `mcp__Microsoft_365__outlook_email_search`
  (blocks the command centre refresh)
- `mcp__Buffer__create_post` (blocks the social drafts)

Once those are pre-approved for scheduled runs, the existing six triggers should
complete unchanged.

Do **not** verify by force-firing. Per the section above, a force-fire passes
regardless. Verify by letting each task run on its own schedule and checking that
the resulting session reaches `SESSION_STATUS_IDLE` rather than `REQUIRES_ACTION`.

## Note on `claude/build-state.md`

Could not be read or updated from this session. The `claude/*.md` files the task
prompts reference — `build-state.md`, `command-centre-spec.md`,
`commitments-ledger.md`, `voice-profile.md` — are Claude **project documents**,
reached with `project_read` / `project_write` inside project
`019f7597-cf0e-75f1-a96b-d7088d8add17`. They are not files in this git repository,
which is empty and has no commit history. This session has neither tool.

This audit was written to a separate filename deliberately, so it does not
compete with the real `build-state.md` as a second source of truth.

## Hosting the command centre — blocked

Requested: pull the live `nuvo-command-centre` deploy into this repo, add
`command-centre.html` served at `/` behind the app's existing login, move the
JobTread chat to a link on that page, and have the trigger redeploy the whole app
each run rather than dropping a bare HTML file.

The plan is sound. It cannot be executed from this session.

### What is actually deployed there

Site `30bdd77c-2d79-4967-a130-5e84e92cd64c`, deploy `6a74ea1952c521afee2c1eb9`,
published 2026-08-06, 24 files and **five serverless functions**:

| Function | Route | Purpose |
|---|---|---|
| `site` | `/` | serves the page — the root is a function, not an index.html |
| `login` | `/api/login` | the app's own login |
| `_auth` | — | auth helper |
| `chat` | `/api/chat` | the live chat |
| `jobtread` | — | live JobTread access |

`deploy_source: api`, `public_repo: null`, `commit_ref: null` — it was uploaded
as a zip drop, not built from a git repository. So the source is not in any repo;
it exists only in the Netlify deploy.

### The blocker

Retrieving that source needs the Netlify API, and this environment's egress
policy denies it:

```
2026-09-02T18:19:42Z  connect_rejected  api.netlify.com:443
    gateway answered 403 to CONNECT (policy denial)
2026-09-02T18:13:34Z  connect_rejected  nuvo-command-centre.netlify.app:443
    gateway answered 403 to CONNECT (policy denial)
```

There is no other route:

- No `NETLIFY_AUTH_TOKEN` in the environment and no Netlify CLI installed.
- The Netlify MCP server offers only `get-deploy`, `get-deploy-for-site` and
  `deploy-site`. It has no operation that reads or downloads deploy files.

### Why no deploy was attempted

`deploy-site` publishes the working directory. This working directory does not
contain the app. Calling it would have replaced the five-function authenticated
app with the contents of this repo — precisely the bare-HTML overwrite that was
ruled out. Rolling that back would mean re-uploading a source zip nobody holds a
copy of.

Nothing on Netlify was created, modified or deployed.

### To unblock, any one of these

1. Allow `api.netlify.com` in the environment's egress policy, and provide a
   Netlify personal access token. Everything else then proceeds unattended.
2. Download the deploy zip from the Netlify dashboard
   (`app.netlify.com/projects/nuvo-command-centre` → Deploys → the 6 Aug deploy)
   and commit it to this repo.
3. Point at wherever the app was built, if a working copy still exists outside
   Netlify.

Once the source is in the repo, the rest is straightforward: add
`command-centre.html`, adjust the `site` function to serve it at `/` behind the
existing `_auth` check, replace the in-page chat with a link to `/api/chat`, and
change the trigger's delivery step to redeploy the whole directory.
