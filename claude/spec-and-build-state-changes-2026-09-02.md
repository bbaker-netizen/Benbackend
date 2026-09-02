# Spec and build-state changes, 2 September 2026

**Read this first: these changes are NOT in the project documents yet.**

`claude/command-centre-spec.md` and `claude/build-state.md` are Claude *project*
documents, reached with `project_read` and `project_write` inside project
`019f7597-cf0e-75f1-a96b-d7088d8add17`. The session that did this work had
neither tool, so it could not edit them. This file is written to be pasted
across. Until someone does that, the spec and the build-state are stale on every
point below.

The trigger prompts themselves ARE updated and live, so the tasks will behave
correctly regardless. It is the reference docs that lag.

---

## 1. The chat is out of the page

The refresh task no longer builds the chat. It builds the dashboard only.

The chat lives in `netlify/functions/chat-widget.html` and is injected by
`netlify/functions/site.js` at request time. Floating Ask button, sheet, bubbles,
history, resize, minimise, dictation, and an "Ask about this" on every theme and
row. The spec's whole "Ask me box" section should be deleted and replaced with
the contract below, because a page that builds its own chat now ships two.

### The contract between the page and the widget

| The page must | Why |
|---|---|
| Keep `.wrap` as the content container | The chat reads `.wrap` innerText as its context |
| Put `data-q` on buttons, never on links | The widget binds `button[data-q]` |
| Prefix with `ASK `, `DRAFT ` or `DONE ` | The prefix decides what the button does |
| Give every `DONE ` button a `data-done-id` | It is the storage key, and the key that keeps the item struck through after a rebuild |
| Keep `.theme` with `.h`/`.b`/`.mg`, `.row` with `.rt`/`.rm` | That is how each item gets its own Ask button |
| Keep body bottom padding at 90px or more | So the floating button never covers the last line |
| **Never emit a mailto link** | That is what was removed |

`data-done-id` must be STABLE between runs. The same commitment gets the same id
every time, or the thing Ben cleared this morning returns this afternoon.

## 2. DONE and DRAFT go through the chat, not email

Before: `DONE` and `DRAFT` were `mailto:` links. Ben's phone opened his mail app,
he emailed himself, and the Friday sweep read it back out of the inbox.

Now:
- `DONE` posts to `/api/done`, which stores the record in a Netlify blob store,
  and the item is struck through immediately with an Undo beside it.
- `site.js` reads that store on every request and re-applies it, so a clearing
  survives the twice-daily rebuild even though the task will happily re-add the
  item. **The guarantee is enforced on the server, not trusted to the task.**
- `DRAFT` opens the chat and has it write the message. Replies carry a Copy
  button.

**Open item for the Friday commitment sweep.** The sweep still reads Inbox and
Sent Items to find what Ben has done. It will no longer find DONE emails, because
there will not be any. The cleared feed is at `GET /api/done` with
`Authorization: Bearer <TASK_TOKEN>`, where `TASK_TOKEN` is a Netlify environment
variable on site `30bdd77c-2d79-4967-a130-5e84e92cd64c`. The refresh task has
been pointed at it. **The sweep has not.** Until it is, a cleared item stays open
in the ledger until one of the sweep's other checks catches it.

## 3. Marketing sources, tested 2 September 2026

Working, with the exact parameters in the refresh trigger prompt:

| Source | State |
|---|---|
| Google Analytics 4 | Working. `accounts/354229420`, `properties/488107533`. Note it is a Zapier *write* action even though it only reads |
| Google Ads | Working. TWO accounts: `3388878656` is Nuvo's own and was at zero, `5428451076` "Quality Lead Magnet 3000" is where spend actually is |
| Facebook Ads | Working. `3310649279227137` Nuvo, `10152423196052544` Ben personal. Must pass `fields` explicitly or figures come back null |

Not working, and the spec should say so rather than list them as sources:

| Source | Why |
|---|---|
| Semrush | Connected, but the account has no API units. Every call returns a units error |
| Google Business Profile | Connected, but the only account exposed is personal and unverified, and Zapier redacts the account id, so no locations or reviews URL can be built |
| Indeed | The connector is the job seeker side only. It searches public postings and reads Ben's own resume. There is no employer or applicant access, and no Zapier app either. **Candidates awaiting reply cannot be put on the page.** |
| Google Search Console | Still not available at all |

### What the figures actually said

- Analytics, 30 days to 2 September: 3,426 sessions. Paid search 1,856, paid
  social 770, organic search 356, direct 195, cross-network 157, referral 60,
  organic social 19.
- Google Ads: Nuvo's own account spent nothing across 15 campaigns. The second
  account spent $177.32 for 2,883 clicks and no recorded conversions. The page
  said $2,990 a month ago.
- Facebook: zero spend in both accounts, which does not reconcile with 770 paid
  social sessions. The spec should require reconciling these, not just listing
  both.

## 4. Job notes come off the Plaud

The blog and social tasks no longer look for a `JOB NOTE` email subject. Ben does
not email himself. They read Plaud recordings.

`claude/job-note-input.md` is now wrong on its central point: audio was the
blocker, and it is not any more. Both trigger prompts say they win over that doc.

**The trap, confirmed by testing.** `get_transcript` returns an empty array for
recordings Plaud has not finished processing, including ones that synced
recently. An empty array means NOT YET TRANSCRIBED, not "no job note this week".
Both prompts now say to distinguish those two cases in the summary, because only
one of them is Ben's to fix.

## 5. Whose account each connection uses

Recorded because it matters when one breaks, and because one of them is a
single point of failure attached to a person.

| Connection | Account |
|---|---|
| WordPress | **Ellie's.** Drafts show as authored by her, and the connection goes when she does |
| SharePoint | Bruce's |
| Google Ads, Analytics, Outlook | Ben's |
| JobTread | The Nuvo Construction organisation |
| Google Business Profile | A personal, unverified account, which is why reviews cannot be read |
