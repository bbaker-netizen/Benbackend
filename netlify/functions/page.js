import { getStore } from '@netlify/blobs';
import { taskAuthorised, json } from './_auth.js';

// The page used to ship by rebuilding and redeploying the whole app to change one
// file. When the deploy route broke on 10 September the page froze on 2 September,
// while the refresh task went on building a correct page twice a day and throwing
// it away, because the only way onto the site was a deploy it could not do.
//
// This is the other way on. The refresh task POSTs the finished page here and it
// is stored in a blob. site.js serves the blob. No deploy, no build, no cache to
// wait for. Content is no longer coupled to code.
//
// The bundled command-centre.html stays as the seed and the fallback. If this
// store is ever empty or unreachable, site.js serves that instead, so a problem
// here can make the page old but can never make it blank.

const STORE = 'nuvo-page';
const MAX_BYTES = 2 * 1024 * 1024;

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

// What the refresh task wrote last. site.js calls this on every request. Never
// throws: an unreachable store must fall back to the bundled page, not a 500.
export async function currentPage() {
  try {
    const rec = await store().get('current', { type: 'json' });
    if (rec && typeof rec.html === 'string' && rec.html.trim()) return rec;
  } catch (e) {
    // Fall through to the bundled page.
  }
  return null;
}

// Zapier's custom request does not always send what it was told to. Accept JSON,
// form encoding, or a raw body, so a transport quirk is never mistaken for a
// broken page.
async function readBody(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (type.includes('application/json')) return request.json();
  if (type.includes('form')) {
    const f = await request.formData();
    return { html: f.get('html'), run: f.get('run') };
  }
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { html: text };
  }
}

// The two ways a page can be the wrong thing, both of which have happened before.
const HAS_WRAP = /class\s*=\s*["'][^"']*\bwrap\b[^"']*["']/i;
const HAS_CHAT = /class\s*=\s*["'][^"']*\b(sheet-send|sheet-body|sheet-head|abaskplus)\b/i;

export default async (request) => {
  // Status check for the tasks: is there a page, and when was it built. No html,
  // so a check costs nothing.
  if (request.method === 'GET') {
    if (!taskAuthorised(request)) return json({ error: 'Not authorised' }, 401);
    const rec = await currentPage();
    if (!rec) return json({ ok: true, live: false, source: 'bundled' });
    return json({ ok: true, live: true, builtAt: rec.builtAt, run: rec.run, bytes: rec.bytes });
  }

  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);

  // Only the scheduled task writes the page. A signed-in browser session cannot,
  // because nothing on the page should ever be able to replace the page.
  if (!taskAuthorised(request)) return json({ error: 'Not authorised' }, 401);

  let body;
  try {
    body = await readBody(request);
  } catch (e) {
    return json({ error: 'Bad request, could not read the body' }, 400);
  }

  const html = String((body && body.html) || '');
  const run = String((body && body.run) || '').trim().slice(0, 80);
  const bytes = Buffer.byteLength(html, 'utf8');

  if (bytes > MAX_BYTES) return json({ error: `Page is ${bytes} bytes, over the 2MB limit` }, 413);
  if (!html.trim()) return json({ error: 'Empty page' }, 422);
  if (!HAS_WRAP.test(html)) return json({ error: 'Page has no .wrap container, so the chat would have no context. Not stored.' }, 422);
  if (HAS_CHAT.test(html)) return json({ error: 'Page contains a chat. The chat is injected by site.js; a page with its own ships two. Not stored.' }, 422);

  const builtAt = new Date().toISOString();

  try {
    const s = store();
    // Keep the last good page one step back, so a bad build can be rolled back
    // by hand without a deploy.
    const prev = await s.get('current', { type: 'json' });
    if (prev && prev.html) await s.setJSON('previous', prev);
    await s.setJSON('current', { html, run, builtAt, bytes });
  } catch (e) {
    return json({ error: 'Could not store the page. ' + String(e.message || e) }, 502);
  }

  return json({ ok: true, builtAt, bytes, run });
};

export const config = { path: '/api/page' };
