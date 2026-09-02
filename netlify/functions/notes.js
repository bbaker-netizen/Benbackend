import { getStore } from '@netlify/blobs';
import { isSignedIn, taskAuthorised, who, json } from './_auth.js';

// The sticky note pad.
//
// The rule that shapes everything here: a note is never deleted. Not by Ben, not
// by the task, not by age. He can close one, and a closed note drops out of the
// pad into a list he has to ask for, but the record stays. That is deliberate.
// The value of this pad is not the note he wrote this morning, it is the fourth
// time in six weeks he has written a version of the same note, and a pad that
// forgets cannot show him that.
//
// So: no DELETE method, and no expiry sweep. If this ever grows past what a list
// call can carry, page it. Do not start deleting.

const STORE = 'nuvo-notes';
const INSIGHT_KEY = 'zz-insight';   // sorts last, filtered out of the pad
const MAX_TEXT = 4000;
const MAX_NOTES = 500;              // what one list call returns, newest first

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

function id() {
  return 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function readAll() {
  const s = store();
  const { blobs } = await s.list();
  const notes = [];
  let insight = null;
  for (const b of blobs) {
    let rec;
    try {
      rec = await s.get(b.key, { type: 'json' });
    } catch (e) {
      continue; // one unreadable note must not take the pad down
    }
    if (!rec) continue;
    if (rec.kind === 'insight') { insight = rec; continue; }
    notes.push(rec);
  }
  notes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { notes: notes.slice(0, MAX_NOTES), insight };
}

// What the daily refresh reads. Open notes only, oldest first, because the note
// he wrote three weeks ago and has not closed is the one most likely to have
// come due.
export async function listOpenNotes() {
  try {
    const { notes } = await readAll();
    return notes.filter((n) => n.status === 'open').reverse();
  } catch (e) {
    return [];
  }
}

export async function listAllNotes() {
  try {
    return await readAll();
  } catch (e) {
    return { notes: [], insight: null };
  }
}

export default async (request) => {
  const caller = who(request);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  if (request.method === 'GET') {
    const { notes, insight } = await listAllNotes();
    return json({
      notes,
      insight,
      open: notes.filter((n) => n.status === 'open').length,
      closed: notes.filter((n) => n.status !== 'open').length
    });
  }

  if (request.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  // The weekly line. Task only, because it is the one thing on this tab Ben did
  // not write himself and it has to be obvious which is which. An empty string
  // clears it, which is what the task sends on a week with no real pattern:
  // saying nothing is a valid answer and must not need a special case.
  if (Object.prototype.hasOwnProperty.call(body, 'insight')) {
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    const text = String(body.insight || '').trim().slice(0, 600);
    try {
      if (!text) await store().delete(INSIGHT_KEY);
      else await store().setJSON(INSIGHT_KEY, { kind: 'insight', text, at: new Date().toISOString() });
    } catch (e) {
      return json({ error: 'Could not write that. ' + String(e.message || e) }, 502);
    }
    return json({ ok: true, insight: text || null });
  }

  // A new note. One field, because that is the whole point: he is standing on a
  // site with one hand free.
  if (!body.id) {
    const text = String(body.text || '').trim().slice(0, MAX_TEXT);
    if (!text) return json({ error: 'Nothing to save' }, 400);
    const rec = {
      id: id(),
      text,
      at: new Date().toISOString(),
      status: 'open',
      via: caller === 'task' ? 'task' : 'page'
    };
    try {
      await store().setJSON(rec.id, rec);
    } catch (e) {
      return json({ error: 'Could not save that. ' + String(e.message || e) }, 502);
    }
    return json({ ok: true, note: rec });
  }

  // Changing an existing note. Read, merge, write: never blind-write, because
  // the task and the page both touch these and the task must not stamp on an
  // edit Ben made thirty seconds earlier.
  const key = String(body.id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  let rec;
  try {
    rec = await store().get(key, { type: 'json' });
  } catch (e) {
    rec = null;
  }
  if (!rec || rec.kind === 'insight') return json({ error: 'No such note' }, 404);

  if (typeof body.text === 'string') {
    const text = body.text.trim().slice(0, MAX_TEXT);
    if (!text) return json({ error: 'A note cannot be emptied. Close it instead.' }, 400);
    rec.text = text;
    rec.editedAt = new Date().toISOString();
  }

  if (body.status === 'closed' || body.status === 'open') {
    rec.status = body.status;
    rec.closedAt = body.status === 'closed' ? new Date().toISOString() : null;
  }

  // The task saying "I put this on today's page". Recorded so the pad can show
  // him it was acted on, and so the task does not surface the same note every
  // morning until he closes it.
  if (body.surfaced) {
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    rec.surfacedAt = new Date().toISOString();
    rec.surfacedAs = String(body.as || '').slice(0, 120) || null;
    rec.surfacedCount = (rec.surfacedCount || 0) + 1;
  }

  try {
    await store().setJSON(key, rec);
  } catch (e) {
    return json({ error: 'Could not save that. ' + String(e.message || e) }, 502);
  }
  return json({ ok: true, note: rec });
};

export const config = { path: '/api/notes' };
