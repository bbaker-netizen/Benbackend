# Nothing can deploy. The Netlify account is out of credits.

4 September 2026, 13:45 UTC. Found while checking why the page was three days
stale.

## The finding

    Account credit usage exceeded - new deploys are blocked until credits are added

    account          Ben Pond's Team (ben-ostzvtq)
    plan             Free
    payment method   NONE
    site             UP and serving normally

Every publish path is blocked, not just one:

| path | state |
|---|---|
| git push, auto build | BLOCKED. Production build 13:38 today errored "Skipped due to account credit usage exceeded" |
| `netlify-cli deploy --prod --no-build` | BLOCKED. 403 Forbidden, same message |
| `mcp__Netlify__netlify-deploy-services-updater` | blocked on a permission prompt as well, and would hit this anyway |

The live site is fine. It is serving the last successful build, `/` returns the
login page and `/api/mail`, `/api/notes` and `/api/done` all return 401 correctly.
Nothing is down. Nothing can be **updated**.

## Why this was invisible until now

The credit ceiling was crossed some time between 13:34 and 13:38 today. A draft
deploy at 13:34 succeeded; the production build at 13:38 was skipped. Before
that, every deploy worked, so the permission stalls were the only visible
failure and they masked this one.

## Honest accounting of what consumed the credits

The refresh task redeploys the WHOLE app twice every weekday. That alone is
roughly forty deploys a month before anyone touches anything.

On top of that, building the tabs, the brand layer and live mail over 2 to 4
September took a lot of deploys from this session: six on 2 September, two on
3 September, several today. That is a real contribution and it is mine.

## The architectural problem underneath

`command-centre.html` is baked into the deploy. `site.js` reads it off disk. So
**every content change to the page requires a full redeploy of the whole app**,
even though only one HTML file changed and the eleven functions are identical.

That is why the page is expensive to update, why the deploy is on the critical
path twice a day, and why a permission stall or a credit ceiling takes the page
down for days.

Notes, blog drafts and reports already do the right thing: they live in Netlify
Blobs and are read at request time. Nothing is redeployed when a note is added.

## The fix worth making, once deploys work again

Store the page the same way the notes are stored.

- The refresh task POSTs the rebuilt HTML to a new authenticated endpoint
  instead of writing a file and redeploying.
- `site.js` reads the page from the blob store, falling back to the file on disk
  if the store is empty.
- A deploy is then only needed when the CODE changes, which is rare.

What that buys, all at once:
- the page updates in seconds, not in a build
- the deploy leaves the twice-daily critical path entirely
- no permission-stall risk on the page refresh
- build credits stop being consumed by content changes
- the 2:30pm run can genuinely be a subtraction pass, cheaply

**This cannot be built and shipped right now.** Shipping it needs a deploy, and
deploys are blocked. It is the first thing to do once they are not.

## What Ben has to decide

Adding credits or a payment method is his call and costs money. I am not going
to guess Netlify's current prices; the number is on the billing page for the
`ben-ostzvtq` team. Three options as I see them:

1. **Add a payment method / upgrade.** Unblocks everything today. Given the page
   is the one place he looks, and it has now been stale three days, this is the
   recommendation.
2. **Wait for the monthly reset.** Free, and the page stays frozen until it
   happens. Not acceptable for something he checks daily.
3. **Cut consumption first.** Do the blob-page change above, which removes most
   deploys permanently. Cannot be done until deploys work, so it does not solve
   today, but it stops this recurring.

1 then 3 is the sensible order.
