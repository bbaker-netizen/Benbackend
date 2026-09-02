import { getStore } from '@netlify/blobs';
import { isSignedIn, json } from './_auth.js';

// Marking a thing done used to be a mailto. It opened Ben's mail app, he sent
// himself an email, and the Friday sweep read it back out of the inbox. That is
// two apps and a round trip for one tap, and it is why the chat was not the one
// place.
//
// Now the page records it here. The record outlives the twice-daily rebuild,
// because site.js reads this store and marks the item done again on whatever
// page the refresh task has just written. Ben never sees a thing he has cleared,
// even if the task puts it back.

const STORE = 'nuvo-cleared';
const MAX_AGE_DAYS = 45; // past that the ledger has caught up and it is noise

// A snooze is not defer-and-nag. Until its date the item is GONE: no count, no
// greyed row, no "3 hidden". On the morning it comes due it surfaces in The One
// Thing and comes back to the page. Hidden means hidden.
function isSnoozed(rec, now) {
  if (!rec || rec.kind !== 'snooze' || !rec.until) return false;
  return Date.parse(rec.until + 'T23:59:59Z') > now;
}

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

// The scheduled tasks have no session, so they carry a token instead. They need
// to WRITE as well as read: Ben can reply DONE to the daily email, and the task
// that reads that reply has to be able to record it.
function taskAuthorised(request) {
  const want = process.env.TASK_TOKEN;
  if (!want) return false;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return got.length === want.length && got === want;
}

// Everything in the store, done and snoozed alike. The scheduled tasks want the
// lot; the page wants them split.
export async function listAll() {
  try {
    const s = store();
    const { blobs } = await s.list();
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
    const out = [];
    for (const b of blobs) {
      const rec = await s.get(b.key, { type: 'json' });
      if (!rec) continue;
      // A snooze outlives the 45 day window if its date is further out.
      const fresh = Date.parse(rec.at) > cutoff || isSnoozed(rec, Date.now());
      if (fresh) out.push(rec);
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  } catch (e) {
    // A missing or unreachable store must never take the page down. An item that
    // reappears is a small annoyance. A blank page is not.
    return [];
  }
}

// What the page needs: struck through, and vanished.
export async function listForPage() {
  const now = Date.now();
  const all = await listAll();
  return {
    cleared: all.filter((r) => r.kind !== 'snooze'),
    hidden: all.filter((r) => isSnoozed(r, now)).map((r) => r.id)
  };
}

// Snoozes that came due on or before today. The One Thing surfaces these on the
// morning they land, which is the whole point of snoozing rather than deleting.
export async function listDueSnoozes() {
  const now = Date.now();
  return (await listAll()).filter((r) => r.kind === 'snooze' && !isSnoozed(r, now));
}

export default async (request) => {
  if (request.method === 'GET') {
    if (!taskAuthorised(request)) return json({ error: 'Not authorised' }, 401);
    const all = await listAll();
    return json({
      cleared: all.filter((r) => r.kind !== 'snooze'),
      snoozed: all.filter((r) => r.kind === 'snooze'),
      dueToday: await listDueSnoozes()
    });
  }

  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ error: 'Use POST or DELETE' }, 405);
  }

  // Either a signed-in person tapping the page, or a scheduled task acting on
  // something Ben replied by email.
  const byTask = taskAuthorised(request);
  if (!byTask && !isSignedIn(request)) return json({ error: 'Not signed in' }, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  const id = String(body.id || '').trim().slice(0, 120);
  const label = String(body.label || '').trim().slice(0, 300);
  const note = String(body.note || '').trim().slice(0, 2000);
  const until = String(body.until || '').trim().slice(0, 10);
  if (!id) return json({ error: 'No id' }, 400);

  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return json({ error: 'Snooze date must be YYYY-MM-DD' }, 400);
  }

  const key = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

  // Undo. He is reading this one handed on a site, so a mis-tap has to be
  // recoverable. Without this the only way back is waiting 45 days.
  if (request.method === 'DELETE') {
    try {
      await store().delete(key);
    } catch (e) {
      return json({ error: 'Could not undo that. ' + String(e.message || e) }, 502);
    }
    return json({ ok: true, undone: id });
  }

  // Record how it was cleared, so the Friday sweep can tell Ben whether he
  // tapped it or replied to the email, and so a bad email parse is traceable.
  const record = {
    id,
    label,
    note,
    at: new Date().toISOString(),
    via: byTask ? 'email-reply' : 'page',
    kind: until ? 'snooze' : 'done',
    ...(until ? { until } : {})
  };

  try {
    await store().setJSON(key, record);
  } catch (e) {
    return json({ error: 'Could not record that. ' + String(e.message || e) }, 502);
  }

  return json({ ok: true, cleared: record });
};

export const config = { path: '/api/done' };
