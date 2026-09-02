# Nuvo Command Centre

The web app behind `https://nuvo-command-centre.netlify.app`. One page, one
password, and a chat that can go and look things up in JobTread.

Until 2 September 2026 this source existed only inside a Netlify zip drop. It was
pulled back out of deploy `6a74ea1952c521afee2c1eb9` and committed here, so the
app can be rebuilt and redeployed rather than hand dropped.

## How it fits together

| File | What it does |
|---|---|
| `command-centre.html` | The dashboard. The only file the refresh task rewrites. Not published statically, so it is never reachable without the password. |
| `netlify/functions/site.js` | Serves `/`. Checks the session, then serves the dashboard with the chat injected. |
| `netlify/functions/chat-widget.html` | The chat. Floating Ask button, sheet, dictation, resize, minimise. Injected into the page by `site.js`. |
| `netlify/functions/_auth.js` | One password, one signed cookie, checked server side. |
| `netlify/functions/login.js` | `/api/login`, and `/api/login?out=1` to sign out. |
| `netlify/functions/chat.js` | `/api/chat`. Claude, with a `jobtread_query` tool. |
| `netlify/functions/jobtread.js` | Guarded passthrough to the JobTread Pave API. The grant key never leaves the server. |
| `static/` | Published statically. Holds `robots.txt` and nothing worth reading. |

## Why the chat is not in the page

The refresh task rebuilds `command-centre.html` twice a weekday. If the chat
lived in that file, every rebuild would be another chance to break it, and it
had already been broken more than once. It now lives in `chat-widget.html` and
is injected by `site.js` at request time. The task writes the dashboard. The
chat is not its problem.

Anything on the page pointing at `#chat` opens it, so a rebuilt page only has to
write a plain link. `https://nuvo-command-centre.netlify.app/#chat` opens the
site straight into the conversation, which is the one worth bookmarking on a
phone.

## Deploying

Everything, every time. Never a bare HTML drop.

```
netlify deploy --prod --dir=. --site=30bdd77c-2d79-4967-a130-5e84e92cd64c
```

The four environment variables (`SITE_PASSWORD`, `SESSION_SECRET`,
`ANTHROPIC_API_KEY`, `JOBTREAD_GRANT_KEY`) live in Netlify and are untouched by a
deploy. They are not in this repository and must not be put in it.

## Rolling back

Deploy `6a74ea1952c521afee2c1eb9` is the last version before this restructure.
