# Command centre hosting — status, 2 September 2026 (second attempt)

Supersedes the "Hosting the command centre — blocked" section of
`trigger-audit-2026-09-02.md`. One of the two blockers is cleared. The other
is not.

## Headline

**Egress is fixed. The credential is not.** `NETLIFY_AUTH_TOKEN` is present in
the environment but is not a Netlify token — the API rejects it with 401. No
work that touches the live app can proceed until a real token is supplied.

Nothing on Netlify was created, modified or deployed in this session.

## What changed since the last attempt

| Blocker | Then | Now |
|---|---|---|
| `api.netlify.com:443` | 403 CONNECT, policy denial | **Reachable.** Unauthenticated call returns 401, i.e. the connection completes |
| `nuvo-command-centre.netlify.app:443` | 403 CONNECT, policy denial | **Reachable.** `GET /` returns 200 |
| Netlify credential | absent | present but **invalid** |

## The credential

- `NETLIFY_AUTH_TOKEN` is set, 21 characters.
- It is not the shape of a Netlify personal access token. Current tokens are
  `nfp_` + 40 characters; older ones are 64 hex characters. This is neither.
- Verified against the API:

```
GET https://api.netlify.com/api/v1/user
Authorization: Bearer $NETLIFY_AUTH_TOKEN
-> 401 {"code":401,"message":"Access Denied"}
```

- The same call with no token also returns 401, so the token is contributing
  nothing.

The Netlify **MCP server** is separately authenticated and works — it reports
`ben@nuvoconstruction.com`, account `6a74a017d742b0b85a171232`, 1 site. But its
whole operation set is `get-user`, `get-teams`, `get-team`, `get-project`,
`get-projects`, `get-forms-for-project`, `get-deploy`, `get-deploy-for-site`,
`deploy-site`, plus extension and env-var management. **It has no operation that
reads or downloads deploy files.** Read access through MCP is metadata only.

## The good news: the source is recoverable, not lost

The live deploy reports:

```
"has_source_zip": true
"deploy_source": "api"
"deploy_validations_report.secret_scan_result.scannedFilesCount": 24
```

Netlify still holds the original uploaded source zip for deploy
`6a74ea1952c521afee2c1eb9`. This matters: the app does **not** need to be
rebuilt or reverse-engineered. Once a valid token exists, recovering the
complete source — all 24 files and all five function sources — is a single
authenticated API call. The last audit's fallback options 2 and 3 (dashboard
download, hunt for a working copy) are no longer needed.

The retrieval endpoints all currently answer 401/404 for lack of auth:

```
401  /api/v1/deploys/6a74ea1952c521afee2c1eb9/files
401  /api/v1/sites/30bdd77c-2d79-4967-a130-5e84e92cd64c/files
404  /api/v1/deploys/6a74ea1952c521afee2c1eb9/source_zip
```

The exact working path for the zip has to be settled with a live token in hand;
the `/files` endpoints returning 401 rather than 404 confirms they exist and
are auth-gated.

## What is actually deployed (re-confirmed this session)

Site `30bdd77c-2d79-4967-a130-5e84e92cd64c`, deploy `6a74ea1952c521afee2c1eb9`,
published 2026-08-06T20:10:19Z, `deploy_source: api`, `commit_ref: null`,
`public_repo: null`. 24 files, five Node 24 serverless functions:

| Function | Route | Runtime API | Notes |
|---|---|---|---|
| `site` | `/` | v2 | serves the page. The root is a function, not an index.html |
| `login` | `/api/login` | v2 | the app's own password login |
| `chat` | `/api/chat` | v2 | the live chat |
| `_auth` | none | v1 | auth helper, called by the others |
| `jobtread` | none | v1 | live JobTread access, called by the others |

Confirmed by request: `GET /` returns 200 and serves a Nuvo-branded password
gate that POSTs to `/api/login`. `GET /api/login` returns 405, i.e. the
function is live and method-gated. Static paths are not directly addressable —
`/index.html`, `/command-centre.html`, `/app.js`, `/styles.css`,
`/netlify.toml`, `/_redirects` all return 404; only `/robots.txt` returns 200.
The 24 files are served through the `site` function behind the login.

## Why nothing was deployed

`deploy-site` publishes the working directory. This repository contains only
`claude/*.md`. Calling it would replace the five-function authenticated app
with two markdown files — destroying the login, the chat and the JobTread
integration in one step.

That is not recoverable by re-running the deploy, because this session cannot
read the source it would need to put back. The source zip Netlify holds is
attached to the *current* deploy record; overwriting production before
retrieving it is the one action that could turn a recoverable situation into an
unrecoverable one.

So the deploy was not attempted. This is the same conclusion as the last
session, on stronger evidence.

## To unblock

Supply a real Netlify personal access token as `NETLIFY_AUTH_TOKEN` in this
environment's variables. Create it at **Netlify → User settings → Applications →
Personal access tokens → New access token**. It will start `nfp_`.

Everything downstream then proceeds unattended in one session:

1. Pull the source zip for deploy `6a74ea1952c521afee2c1eb9`, unpack, commit.
2. Add `command-centre.html`.
3. Point the `site` function at it for `/`, keeping the existing `_auth` gate in
   front — the login stays exactly as it is.
4. Replace the in-page chat with a one-tap link to `/api/chat`.
5. Change the command centre trigger's delivery step from "write an HTML file"
   to "deploy the whole directory", and set it to run in this environment.
6. Deploy once, verify the login, the page and the chat link, hand over the URL.

## Standing caveat, unchanged

Per the force-fire finding in `trigger-audit-2026-09-02.md`: once the trigger is
rewired, a force-fired run does **not** prove it works. Only an observed
scheduled run does. Budget for that before calling this done.
