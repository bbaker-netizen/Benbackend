# Nuvo Command Centre, setup

Ten minutes, once. Do it at a desk, not on a site.

Step 1 below is how the site was first put up, by hand. It is now deployed from
this repository instead. See `README.md`. Steps 2 to 4 still stand, and the
environment variables in step 2 are still the four the app needs.

---

## 1. Put the site up

1. Go to **app.netlify.com**
2. Click **Add new project**, then **Deploy manually**
3. Drag the whole **nuvo-app** folder onto the drop zone
4. Wait for the green tick

You now have a URL like `random-name-12345.netlify.app`. It will not work yet. That is expected.

Rename it if you like: **Site configuration**, **Change site name**. Something like `nuvo-command-centre`.

---

## 2. Paste in the four settings

Still in Netlify: **Site configuration**, then **Environment variables**, then **Add a variable** for each of these.

| Key | Value |
|---|---|
| `SITE_PASSWORD` | `cedar-stud-joist-94` |
| `SESSION_SECRET` | `feda8acdff9504ea7031ecb18bfc48792ea9b580b1f16de405897e65ad8d6123` |
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
| `JOBTREAD_GRANT_KEY` | your JobTread grant key |

Change the password to whatever you want. Keep the session secret exactly as it is, it is random on purpose.

Then **Deploys**, **Trigger deploy**, **Deploy site**. Settings only take effect on a fresh deploy.

---

## 3. Cap the spend before you use it

At **console.anthropic.com**, find the billing or limits section and set a monthly cap. **$50** is right. Do this before you start using it, not after.

---

## 4. Check it works

Open your URL. You should see a password box. Put the password in.

Then tap the **Ask** button, bottom right, and try:

> Lead source breakdown for the last six months, by channel

If a real answer comes back with numbers, everything is wired.

---

## If something is wrong

| What you see | What it means |
|---|---|
| Password box will not accept the password | `SITE_PASSWORD` not set, or you did not redeploy |
| "ANTHROPIC_API_KEY is not set" | Same, the key is missing or you did not redeploy |
| Chat answers but never uses live figures | `JOBTREAD_GRANT_KEY` missing or wrong |
| Anything else | Send me the message and I will fix it |

---

## What this can and cannot do

**Can:** read the page, pull live JobTread figures, filter by date and channel, draft text for you, remember the conversation while the panel is open.

**Cannot:** send email, post anything, write to JobTread, or remember anything after you close it. Those are phase two and we agreed to earn them first.

**Sign out** is at the bottom of the page.

---

## One rule

Do not put the URL anywhere public and do not share the password by text. This page has client names, job values and your team's performance on it. Treat it like your books, because it is.

If the password ever gets loose, change `SITE_PASSWORD` in Netlify and redeploy. Everyone is signed out instantly.
