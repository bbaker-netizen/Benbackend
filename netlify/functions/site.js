import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isSignedIn } from './_auth.js';
import { listCleared } from './done.js';

// The root of the site is a function, not a static file, because the page holds
// client names, job values and team performance. Nobody sees a line of it before
// the password is right.
//
// What it serves is command-centre.html, which the twice-daily refresh task
// overwrites in place. That file is the dashboard and nothing else. The chat is
// injected here, from chat-widget.html, so the refresh task never has to rebuild
// it and can never break it.

const LOGIN = `<!DOCTYPE html>
<html lang="en-CA"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nuvo Command Centre</title>
<style>
  :root { color-scheme: light dark; --navy:#143f5c; --sand:#cfb39c; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center;
    background:#f5f5f7; color:#454242; font-family:Epilogue,system-ui,-apple-system,"Segoe UI",sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#0e1418; color:#f2efec; } }
  .card { width:min(360px,90vw); text-align:center; }
  .mark { font-size:26px; font-weight:700; letter-spacing:.17em; color:var(--navy); }
  @media (prefers-color-scheme: dark) { .mark { color:#7fb2d4; } }
  .sub { font-size:10px; font-weight:600; letter-spacing:.2em; text-transform:uppercase;
    color:var(--sand); margin-bottom:26px; }
  input { width:100%; font:inherit; font-size:16px; padding:13px 15px; border-radius:10px;
    border:1px solid rgba(20,63,92,.2); background:#fff; color:#454242; margin-bottom:10px; }
  @media (prefers-color-scheme: dark) { input { background:#18222a; color:#f2efec; border-color:rgba(255,255,255,.14); } }
  button { width:100%; font:inherit; font-size:15px; font-weight:700; padding:13px;
    border-radius:50px; border:none; background:var(--navy); color:#fff; cursor:pointer; }
  .err { color:#d03b3b; font-size:14px; min-height:20px; margin-top:10px; }
</style></head><body>
<div class="card">
  <div class="mark">NUVO</div>
  <div class="sub">Construction</div>
  <form id="f">
    <input id="p" type="password" placeholder="Password" autocomplete="current-password" autofocus>
    <button type="submit">Open</button>
  </form>
  <div class="err" id="e"></div>
</div>
<script>
document.getElementById('f').addEventListener('submit', function (ev) {
  ev.preventDefault();
  var e = document.getElementById('e');
  e.textContent = '';
  fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('p').value })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ok) location.reload(); else e.textContent = d.error || 'Wrong password';
  }).catch(function () { e.textContent = 'Could not reach the server.'; });
});
</script>
</body></html>`;

// The bundler and the includedFiles setting can each land a file in a different
// place. Try the lot rather than betting on one and serving a 500 at 6:30am.
function candidates(name) {
  const here = new URL('./', import.meta.url);
  return [
    new URL(name, here),                                  // bundled beside the function
    new URL(`../../${name}`, here),                       // repo root, relative to the function
    path.join(process.cwd(), name),                       // repo root, relative to the task root
    path.join('/var/task', name)
  ];
}

async function load(name) {
  for (const c of candidates(name)) {
    try {
      const text = await readFile(c, 'utf8');
      return { text, from: String(c) };
    } catch (e) {
      // Keep going. Only the last failure is worth reporting.
    }
  }
  return null;
}

// Read once per cold start. The task redeploys the whole app, so a new page
// always arrives with a new deploy and there is no stale cache to worry about.
let cachedPage = null;
let cachedWidget = null;

// If the page file is ever missing, say so plainly. A blank screen or a stale
// page presented as current is worse than an honest empty one, and the chat
// still works, so Ben is not stranded.
function fallbackPage(detail) {
  return `<!DOCTYPE html>
<html lang="en-CA"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nuvo Command Centre</title>
<style>
  :root { color-scheme: light dark; --navy:#143f5c; --sand:#cfb39c; --surface-1:#fff;
    --offwhite:#f0ede8; --ink-1:#454242; --ink-muted:#928d8a; --grid:#e0e0df;
    --border:rgba(20,63,92,.12); --critical:#d03b3b; --success-text:#006300; }
  @media (prefers-color-scheme: dark) { :root { --navy:#7fb2d4; --surface-1:#18222a;
    --offwhite:#1e2930; --ink-1:#f2efec; --ink-muted:#8f8a86; --grid:#2a3740;
    --border:rgba(255,255,255,.10); } }
  body { margin:0; padding:0 0 90px; background:#f5f5f7; color:var(--ink-1);
    font-family:Epilogue,system-ui,-apple-system,"Segoe UI",sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#0e1418; } }
  .brandbar { background:#143f5c; border-bottom:3px solid var(--sand); }
  .wrap { max-width:680px; margin:0 auto; padding:15px 16px; }
  .mark { font-size:20px; font-weight:700; letter-spacing:.17em; color:#fff; }
  h1 { font-size:22px; margin:22px 0 8px; }
  p { line-height:1.55; }
  a { color:var(--navy); }
</style></head><body>
<div class="brandbar"><div class="wrap"><span class="mark">NUVO</span></div></div>
<div class="wrap">
  <h1>The page did not get built</h1>
  <p>The refresh task did not leave a command centre page on this deploy, so there
  is nothing current to show you. Rather than show you yesterday's numbers as if
  they were today's, here is nothing, honestly.</p>
  <p>The chat still works. Tap Ask, bottom right, and it will pull live figures
  out of JobTread for you.</p>
  <p style="color:var(--ink-muted);font-size:13px">${detail}</p>
  <p><a href="/api/login?out=1">Sign out</a></p>
</div>
</body></html>`;
}

// The chat goes in last, just inside the closing body tag, so it is appended to
// document.body and never inside .wrap. The widget reads .wrap innerText as its
// context; anything inside .wrap would feed the conversation back into itself.
//
// The cleared list rides in ahead of it. The refresh task rebuilds the page from
// the ledger and the mailbox twice a weekday and will happily put back something
// Ben cleared an hour ago. This is what stops that, and it is enforced here on
// the server rather than trusted to the task.
function inject(page, widget, cleared) {
  const bits = [];
  if (cleared) {
    bits.push(
      '<script>window.__NUVO_CLEARED__ = ' +
      JSON.stringify(cleared).replace(/</g, '\\u003c') +
      ';</script>'
    );
  }
  if (widget) bits.push(widget);
  if (!bits.length) return page;
  const blob = bits.join('\n');
  const i = page.toLowerCase().lastIndexOf('</body>');
  if (i === -1) return page + '\n' + blob + '\n';
  return page.slice(0, i) + blob + '\n' + page.slice(i);
}

export default async (request) => {
  if (!isSignedIn(request)) {
    return new Response(LOGIN, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  if (cachedWidget === null) {
    const w = await load('chat-widget.html');
    cachedWidget = w ? w.text : '';
  }

  if (cachedPage === null) {
    cachedPage = await load('command-centre.html');
  }

  // Not cached. What Ben has cleared changes between requests, and a stale
  // cleared list is the exact failure this exists to prevent.
  const cleared = await listCleared();

  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-nuvo-chat': cachedWidget ? 'on' : 'missing',
    'x-nuvo-cleared': String(cleared.length)
  };

  if (!cachedPage) {
    return new Response(inject(fallbackPage('command-centre.html was not found in this deploy.'), cachedWidget, cleared), {
      status: 200,
      headers: { ...headers, 'x-nuvo-page': 'missing' }
    });
  }

  return new Response(inject(cachedPage.text, cachedWidget, cleared), {
    status: 200,
    headers: { ...headers, 'x-nuvo-page': 'ok' }
  });
};

export const config = { path: '/' };
