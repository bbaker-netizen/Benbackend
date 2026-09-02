import { getStore } from '@netlify/blobs';
import { who, json } from './_auth.js';

// Scheduled reports.
//
// Three rules, and they are the reason this tab exists rather than a list in a
// document:
//
//   Every report carries an owner, a purpose and a decision it informs. A report
//   that informs no decision is not a report, it is a habit, and it will not be
//   accepted here without one.
//
//   Any report Ben has not opened in 30 days pauses itself, and he is told once.
//   Once, not every week. A pause is reversible in one tap.
//
//   Never more than five active. The sixth request is not refused and it is not
//   quietly queued: he is asked which of the five to drop. Deciding what to stop
//   reading is the whole value of a cap.

const STORE = 'nuvo-reports';
const MAX_ACTIVE = 5;
const STALE_DAYS = 30;

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

function key(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function staleSince(rec) {
  return Date.parse(rec.lastOpened || rec.activatedAt || rec.createdAt || 0);
}

// The pause is applied when the list is read, not by a nightly job. A job that
// has to run for the rule to hold is a rule that silently stops holding.
async function readAll() {
  const s = store();
  const { blobs } = await s.list();
  const out = [];
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  for (const b of blobs) {
    let rec;
    try {
      rec = await s.get(b.key, { type: 'json' });
    } catch (e) {
      continue;
    }
    if (!rec) continue;
    if (rec.state === 'active' && staleSince(rec) < cutoff) {
      rec.state = 'paused';
      rec.pausedAt = new Date().toISOString();
      rec.pausedReason = 'Not opened in ' + STALE_DAYS + ' days';
      rec.pausedNotified = false;
      try {
        await s.setJSON(b.key, rec);
      } catch (e) {
        // If the write fails the pause still shows on this read. It will be
        // retried on the next one.
      }
    }
    out.push(rec);
  }
  const rank = { requested: 0, active: 1, paused: 2, dropped: 3 };
  return out.sort((a, b) =>
    (rank[a.state] ?? 9) - (rank[b.state] ?? 9) ||
    Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}

export async function listReports() {
  try {
    return await readAll();
  } catch (e) {
    return [];
  }
}

// What The One Thing needs: reports it must tell him about exactly once, and
// requests waiting to be built.
export async function reportsWork() {
  const all = await listReports();
  return {
    toBuild: all.filter((r) => r.state === 'requested'),
    toAnnouncePaused: all.filter((r) => r.state === 'paused' && !r.pausedNotified),
    active: all.filter((r) => r.state === 'active')
  };
}

export default async (request) => {
  const caller = who(request);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  const all = await readAll();
  const activeCount = all.filter((r) => r.state === 'active' || r.state === 'requested').length;

  if (request.method === 'GET') {
    if (caller === 'task' && new URL(request.url).searchParams.get('work') === '1') {
      return json(await reportsWork());
    }
    return json({ reports: all, activeCount, max: MAX_ACTIVE });
  }

  if (request.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  const action = String(body.action || '').trim();

  // Ben asking for something new, in his own words. He does not fill in owner,
  // purpose and decision here: the task works them out from the request and from
  // what it knows about the business, and shows him what it decided. If it
  // cannot name a decision the report informs, it comes back and asks rather
  // than inventing one.
  if (action === 'request') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    const text = String(body.request || '').trim().slice(0, 2000);
    if (!text) return json({ error: 'Say what you want to know' }, 400);

    const dropId = String(body.drop || '').trim();
    if (activeCount >= MAX_ACTIVE && !dropId) {
      return json({
        needsDrop: true,
        max: MAX_ACTIVE,
        active: all
          .filter((r) => r.state === 'active' || r.state === 'requested')
          .map((r) => ({ id: r.id, name: r.name || r.requestText, decision: r.decision || null }))
      }, 409);
    }

    if (dropId) {
      const dk = key(dropId);
      try {
        const d = await store().get(dk, { type: 'json' });
        if (d) {
          d.state = 'dropped';
          d.droppedAt = new Date().toISOString();
          d.droppedFor = text.slice(0, 200);
          await store().setJSON(dk, d);
        }
      } catch (e) {
        return json({ error: 'Could not drop that one. ' + String(e.message || e) }, 502);
      }
    }

    const rec = {
      id: 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      requestText: text,
      name: null,
      owner: null,
      purpose: null,
      decision: null,
      schedule: null,
      state: 'requested',
      createdAt: new Date().toISOString(),
      runs: []
    };
    try {
      await store().setJSON(rec.id, rec);
    } catch (e) {
      return json({ error: 'Could not save that. ' + String(e.message || e) }, 502);
    }
    return json({ ok: true, report: rec, dropped: dropId || null });
  }

  if (!body.id) return json({ error: 'No id' }, 400);
  const k = key(body.id);
  let rec;
  try {
    rec = await store().get(k, { type: 'json' });
  } catch (e) {
    rec = null;
  }
  if (!rec) return json({ error: 'No such report' }, 404);

  const now = new Date().toISOString();

  if (action === 'open') {
    // The 30 day clock is reset here and only here. Opening the tab does not
    // count; opening the report does.
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    rec.lastOpened = now;
  } else if (action === 'resume') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    if (activeCount >= MAX_ACTIVE) {
      return json({ error: 'Five are already running. Drop one first.' }, 409);
    }
    rec.state = 'active';
    rec.activatedAt = now;
    rec.lastOpened = now;
    rec.pausedAt = null;
    rec.pausedReason = null;
  } else if (action === 'drop') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    rec.state = 'dropped';
    rec.droppedAt = now;
  } else if (action === 'define') {
    // The task turning a plain English request into a real report. This is where
    // owner, purpose and decision become mandatory: a report cannot go active
    // without all three, and the task is the one that has to supply them.
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    const name = String(body.name || '').trim().slice(0, 200);
    const owner = String(body.owner || '').trim().slice(0, 120);
    const purpose = String(body.purpose || '').trim().slice(0, 500);
    const decision = String(body.decision || '').trim().slice(0, 500);
    if (!name || !owner || !purpose || !decision) {
      return json({
        error: 'A report needs a name, an owner, a purpose and the decision it informs. ' +
               'If you cannot name the decision, ask Ben rather than inventing one.'
      }, 400);
    }
    if (rec.state !== 'active' && activeCount >= MAX_ACTIVE) {
      return json({ error: 'Five are already active. Ben has to drop one first.' }, 409);
    }
    rec.name = name;
    rec.owner = owner;
    rec.purpose = purpose;
    rec.decision = decision;
    rec.schedule = String(body.schedule || '').trim().slice(0, 200) || null;
    rec.state = 'active';
    rec.activatedAt = now;
    if (!rec.lastOpened) rec.lastOpened = now;
  } else if (action === 'run') {
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    rec.lastRun = now;
    rec.lastSummary = String(body.summary || '').trim().slice(0, 600) || null;
    rec.lastOutput = String(body.output || '').trim().slice(0, 40000) || null;
    rec.runs = (rec.runs || []).concat([{ at: now, summary: rec.lastSummary }]).slice(-12);
  } else if (action === 'paused-notified') {
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    rec.pausedNotified = true;
  } else {
    return json({ error: 'Unknown action' }, 400);
  }

  try {
    await store().setJSON(k, rec);
  } catch (e) {
    return json({ error: 'Could not save that. ' + String(e.message || e) }, 502);
  }
  return json({ ok: true, report: rec });
};

export const config = { path: '/api/reports' };
