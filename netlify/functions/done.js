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
//
// APPEND ONLY, since 15 September 2026. Every item used to hold ONE record with
// ONE verb, overwritten on each touch. That is why there was never a log: the
// previous answer was gone the moment he gave a new one.
//
// An item now holds a thread of events and its current state is DERIVED from
// that thread. Nothing he says is ever overwritten, and "where is this at" is
// answerable by reading the item rather than remembering.
//
// The shape the scheduled tasks read is unchanged. The commitment sweep and The
// One Thing both call GET here and expect {cleared, snoozed, dueToday}; those
// keys mean exactly what they meant before. `updated` is new and additive.

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

// Old records predate the event log and carry a single verb. Read them as a
// one event thread so the rest of the code only ever handles one shape.
function normalise(rec) {
  if (!rec) return null;
  if (Array.isArray(rec.events)) return rec;
  return {
    ...rec,
    events: [{
      at: rec.at,
      via: rec.via || 'page',
      kind: rec.kind || 'done',
      text: rec.note || '',
      ...(rec.until ? { until: rec.until } : {})
    }],
    lastAt: rec.at,
    priority: 0,
    status: null
  };
}

// Current state is whatever the thread last said. Walk it forward rather than
// trusting a stored flag, so a reopen after a done genuinely reopens and the
// order of events is the single source of truth.
function derive(rec) {
  let kind = 'open';
  let until = null;
  let status = rec.status || null;
  let priority = 0;

  for (const e of rec.events || []) {
    if (e.kind === 'done') { kind = 'done'; until = null; }
    else if (e.kind === 'snooze') { kind = 'snooze'; until = e.until || null; }
    else if (e.kind === 'reopen') { kind = 'open'; until = null; }
    else if (e.kind === 'bump') priority += Number(e.bump) || 0;
    else if (e.kind === 'status') status = e.status || null;
  }

  return { ...rec, kind, until, status, priority, at: rec.at, lastAt: rec.lastAt || rec.at };
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
      const raw = await s.get(b.key, { type: 'json' });
      if (!raw) continue;
      const rec = derive(normalise(raw));
      // Age off LAST touch, not first. An item he is still talking about is
      // still live, however long ago it first appeared.
      // A snooze outlives the 45 day window if its date is further out.
      const fresh = Date.parse(rec.lastAt) > cutoff || isSnoozed(rec, Date.now());
      if (fresh) out.push(rec);
    }
    return out.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
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
    // `cleared` is DONE only. It used to be "not snoozed", which was the same
    // thing while done and snooze were the only two verbs. It is not the same
    // thing now: an open item carrying a comment would have been struck
    // through as if he had finished it.
    cleared: all.filter((r) => r.kind === 'done'),
    hidden: all.filter((r) => isSnoozed(r, now)).map((r) => r.id),
    // Still open, but he has said something about it. The page draws the note,
    // the status and the priority on the item itself.
    updated: all.filter((r) => r.kind === 'open' &&
      ((r.events || []).some((e) => e.kind === 'comment') || r.priority || r.status))
  };
}

// Snoozes that came due on or before today. The One Thing surfaces these on the
// morning they land, which is the whole point of snoozing rather than deleting.
export async function listDueSnoozes() {
  const now = Date.now();
  return (await listAll()).filter((r) => r.kind === 'snooze' && !isSnoozed(r, now));
}

export function keyFor(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function refuse(message) {
  const e = new Error(message);
  e.bad = true; // a caller's fault, not the store's. 400 rather than 502.
  return e;
}

// The one place an event is validated and appended. The page posts here through
// the handler below; the chat calls it directly, with via: 'chat'.
//
// Pulled out of the handler on 22 September 2026 so that a thing Ben clears by
// TELLING the chat and a thing he clears by TAPPING land as the same kind of
// event in the same thread. Two routes writing two shapes is how the page and
// the email end up disagreeing about what he has dealt with.
export async function recordEvent({ id, label, note, until, action, bump, status, via }) {
  const cleanId = String(id || '').trim().slice(0, 120);
  if (!cleanId) throw refuse('No id');

  const cleanNote = String(note || '').trim().slice(0, 2000);
  const cleanUntil = String(until || '').trim().slice(0, 10);
  if (cleanUntil && !/^\d{4}-\d{2}-\d{2}$/.test(cleanUntil)) {
    throw refuse('Snooze date must be YYYY-MM-DD');
  }

  // No action means the old caller: the page's Done button, the email reply
  // parser, anything written before today. Those sent {id, label, note} for done
  // and added {until} for snooze, and they must keep behaving EXACTLY as they
  // did. Two scheduled tasks post here and neither knows about actions.
  const act = String(action || (cleanUntil ? 'snooze' : 'done')).trim().toLowerCase();
  const ALLOWED = ['done', 'snooze', 'reopen', 'comment', 'bump', 'status'];
  if (!ALLOWED.includes(act)) throw refuse('Unknown action: ' + act);
  if (act === 'snooze' && !cleanUntil) throw refuse('Snooze needs a date');

  const cleanStatus = String(status || '').trim().slice(0, 40);
  // Bump is a nudge, not a rank. Clamped so one fat-fingered tap cannot pin an
  // item to the top of the page forever.
  const cleanBump = Math.max(-3, Math.min(3, Math.round(Number(bump) || 0)));
  if (act === 'bump' && !cleanBump) throw refuse('Bump needs a direction');
  if (act === 'comment' && !cleanNote) throw refuse('Nothing to say');

  const event = {
    at: new Date().toISOString(),
    via: via || 'page',
    kind: act,
    text: cleanNote,
    ...(act === 'snooze' ? { until: cleanUntil } : {}),
    ...(act === 'bump' ? { bump: cleanBump } : {}),
    ...(act === 'status' ? { status: cleanStatus } : {})
  };

  // Read, append, write. Two taps in the same second could in principle lose the
  // earlier one, and that is a real hole. It is also one person on one phone,
  // and the alternative is a lock that can strand the store. If it ever bites,
  // the fix is one blob per event rather than a lock.
  const s = store();
  const key = keyFor(cleanId);
  const prev = normalise(await s.get(key, { type: 'json' }));
  const record = {
    id: cleanId,
    // Keep the first label we were given. The rebuilt page rewords items, and
    // the log should still read like the thing he acted on.
    label: (prev && prev.label) || String(label || '').trim().slice(0, 300),
    // `at` is FIRST touch now, not last, so the log can say when this started.
    // Everything that cares about freshness reads lastAt instead.
    at: (prev && prev.at) || event.at,
    lastAt: event.at,
    via: event.via,
    // Top-level `note` stays the latest note. The daily email and the Friday
    // sweep read it and predate the thread.
    note: cleanNote || (prev && prev.note) || '',
    events: [...((prev && prev.events) || []), event].slice(-100)
  };
  await s.setJSON(key, record);
  return derive(record);
}

export default async (request) => {
  if (request.method === 'GET') {
    if (!taskAuthorised(request)) return json({ error: 'Not authorised' }, 401);
    const all = await listAll();
    return json({
      cleared: all.filter((r) => r.kind === 'done'),
      snoozed: all.filter((r) => r.kind === 'snooze'),
      dueToday: await listDueSnoozes(),
      // New and additive. Items still open that Ben has commented on, bumped or
      // given a status. The refresh task reads this so his words survive the
      // rebuild instead of being flattened by the next regenerated page.
      updated: all.filter((r) => r.kind === 'open' &&
        ((r.events || []).some((e) => e.kind === 'comment') || r.priority || r.status))
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

  const key = keyFor(id);

  // Undo. He is reading this one handed on a site, so a mis-tap has to be
  // recoverable. Without this the only way back is waiting 45 days.
  //
  // Undo deletes the whole thread, which is right: it means "I never touched
  // this". To take back one verb and keep the log, reopen instead.
  if (request.method === 'DELETE') {
    try {
      await store().delete(key);
    } catch (e) {
      return json({ error: 'Could not undo that. ' + String(e.message || e) }, 502);
    }
    return json({ ok: true, undone: id });
  }

  let record;
  try {
    record = await recordEvent({
      id,
      label,
      note,
      until,
      action: body.action,
      bump: body.bump,
      status: body.status,
      via: byTask ? 'email-reply' : 'page'
    });
  } catch (e) {
    const msg = String(e.message || e);
    return json({ error: e.bad ? msg : 'Could not record that. ' + msg }, e.bad ? 400 : 502);
  }

  // `cleared` is what every existing caller reads out of this response. It has
  // always been the record with its kind on it, and derive() puts the kind back.
  return json({ ok: true, cleared: record });
};

export const config = { path: '/api/done' };
