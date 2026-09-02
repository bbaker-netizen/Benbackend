# Scheduled trigger audit — 2 September 2026

Audit of every Routine (scheduled trigger) on Ben's account, why the Nuvo tasks
are not delivering, and what will and will not fix it.

## Headline

All six enabled recurring Nuvo tasks are firing on schedule. None of them is
finishing. Every one stalls partway through on an **unanswered tool-permission
prompt**, because the run is unattended and nobody is there to approve it. The
session is then marked `ABANDONED`.

This is an authorisation problem, not a broken-trigger problem. The trigger
definitions, crons and prompts are all fine.

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
complete unchanged. Re-test by force-firing each and confirming the session
reaches `SESSION_STATUS_IDLE` rather than `REQUIRES_ACTION`.

## Note on `claude/build-state.md`

Could not be read or updated from this session. The `claude/*.md` files the task
prompts reference — `build-state.md`, `command-centre-spec.md`,
`commitments-ledger.md`, `voice-profile.md` — are Claude **project documents**,
reached with `project_read` / `project_write` inside project
`019f7597-cf0e-75f1-a96b-d7088d8add17`. They are not files in this git repository,
which is empty and has no commit history. This session has neither tool.

This audit was written to a separate filename deliberately, so it does not
compete with the real `build-state.md` as a second source of truth.
