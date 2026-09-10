import { getStore } from '@netlify/blobs';
import { who, json } from './_auth.js';

// Who is away, for the next 45 days.
//
// WHY IT IS STORED RATHER THAN FETCHED LIVE. NuvoCrew is an MCP connector. A
// Netlify function cannot reach it, the same way it could not reach Outlook
// before Graph was wired up. But leave is nothing like email: nobody books time
// off and starts it twenty minutes later. A roster refreshed daily is as good
// as a live one, so a scheduled task pulls it and posts it here.
//
// WHAT ROLLS. The stored roster is the whole forward book, not a 45 day slice.
// The PAGE filters to 45 days from whatever today is in the browser. So the
// window rolls off by itself between refreshes, and a stale pull still shows a
// correct window, just missing anything booked since.
//
// FRESHNESS IS PART OF THE ANSWER. Every response carries updatedAt and how
// many days old that is. An empty leave board and a broken pipe look identical
// otherwise, and this system has already been bitten by exactly that.

const STORE = 'nuvo-leave';
const KEY = 'roster';
const MAX_ROWS = 400;

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export async function readRoster() {
  try {
    return (await store().get(KEY, { type: 'json' })) || null;
  } catch (e) {
    return null;
  }
}

export default async (request) => {
  const caller = who(request);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  if (request.method === 'GET') {
    const r = await readRoster();
    if (!r) {
      return json({
        ok: true,
        empty: true,
        message:
          'No leave roster has been loaded yet. It is pulled from NuvoCrew by a ' +
          'scheduled task; until that has run there is nothing to show.',
        leave: []
      });
    }
    const ageDays = r.updatedAt
      ? Math.floor((Date.now() - Date.parse(r.updatedAt)) / 86400000)
      : null;
    return json({
      ok: true,
      updatedAt: r.updatedAt,
      ageDays,
      source: r.source || 'NuvoCrew',
      account: r.account || null,
      horizonTo: r.horizonTo || null,
      counted: r.counted || null,
      leave: r.leave || []
    });
  }

  if (request.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);

  // Task only. This is a mirror of an HR system, not something the page edits.
  // Leave is booked and approved in NuvoCrew and nowhere else.
  if (caller !== 'task') return json({ error: 'Not allowed' }, 403);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  if (!Array.isArray(body.leave)) return json({ error: 'leave must be an array' }, 400);

  const rows = body.leave.slice(0, MAX_ROWS).map((x) => ({
    id: String(x.id || '').slice(0, 80),
    name: String(x.name || 'Unknown').slice(0, 120),
    title: String(x.title || '').slice(0, 120) || null,
    dept: String(x.dept || '').slice(0, 120) || null,
    start: String(x.start || '').slice(0, 10),
    end: String(x.end || '').slice(0, 10),
    hours: Number(x.hours) || 0,
    type: String(x.type || 'leave').slice(0, 40),
    status: String(x.status || '').slice(0, 40),
    // Kept, but the page hides it behind a tap. Leave reasons carry medical and
    // family detail and do not belong on a board that is open on a phone on a
    // site.
    reason: String(x.reason || '').slice(0, 500) || null,
    note: String(x.note || '').slice(0, 500) || null
  })).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.start) && /^\d{4}-\d{2}-\d{2}$/.test(x.end));

  const rec = {
    updatedAt: new Date().toISOString(),
    source: String(body.source || 'NuvoCrew leave management').slice(0, 200),
    account: String(body.account || '').slice(0, 200) || null,
    horizonTo: /^\d{4}-\d{2}-\d{2}$/.test(String(body.horizonTo || '')) ? body.horizonTo : null,
    counted: Number(body.counted) || rows.length,
    leave: rows.sort((a, b) => a.start.localeCompare(b.start))
  };

  try {
    await store().setJSON(KEY, rec);
  } catch (e) {
    return json({ error: 'Could not save the roster. ' + String(e.message || e) }, 502);
  }

  return json({ ok: true, stored: rows.length, updatedAt: rec.updatedAt, today: ymd(Date.now()) });
};

export const config = { path: '/api/leave' };
