import { getStore } from '@netlify/blobs';
import { who, json } from './_auth.js';
import { diffSentences, describeEdit } from './_diff.js';

// Blog drafts.
//
// Before this, the blog task wrote straight into WordPress and Ben found out
// what it had written by going to WordPress. The draft now lands here first, he
// reads it where he already is, and WordPress only ever sees things he approved.
//
// Two halves, and it matters which is which:
//
//   This function owns the record. It stores the draft, Ben's edits, the diff
//   between them, the approve or the reject and the reason.
//
//   The scheduled task owns everything outside Netlify. WordPress is reached
//   through Ellie's account over Zapier, which a Netlify function has no
//   credentials for and should not have. So approving does not publish from
//   here. It marks the draft approved, and the next task run creates the
//   WordPress draft and posts the URL back. Same for voice lessons: this
//   function computes the diff, the task writes claude/voice-lessons.md, because
//   that file lives in git and a function cannot commit.
//
// If a draft sits approved with no wpUrl for more than a day, the task is not
// running. That is a real failure and The One Thing should say so, not this.

const STORE = 'nuvo-blog';
const MAX_BODY = 60000;

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

function key(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

async function readAll() {
  const s = store();
  const { blobs } = await s.list();
  const out = [];
  for (const b of blobs) {
    try {
      const rec = await s.get(b.key, { type: 'json' });
      if (rec) out.push(rec);
    } catch (e) {
      // skip
    }
  }
  return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function listDrafts() {
  try {
    return await readAll();
  } catch (e) {
    return [];
  }
}

// The task's work queue, in one call: what to publish, what to learn from, and
// what he threw out and why.
export async function blogWork() {
  const all = await listDrafts();
  return {
    toPublish: all.filter((d) => d.state === 'approved' && !d.wpUrl),
    toLearnFrom: all.filter((d) => (d.edits || []).some((e) => !e.lessonWritten)),
    rejected: all.filter((d) => d.state === 'rejected' && !d.lessonWritten)
  };
}

export default async (request) => {
  const caller = who(request);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  if (request.method === 'GET') {
    const drafts = await listDrafts();
    if (caller === 'task' && new URL(request.url).searchParams.get('work') === '1') {
      return json(await blogWork());
    }
    return json({
      drafts,
      pending: drafts.filter((d) => d.state === 'pending').length
    });
  }

  if (request.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  const action = String(body.action || '').trim();

  // The blog task landing a new draft. Task only: Ben approves drafts, he does
  // not write them here, and if he wants to write one he has a chat that can.
  if (action === 'create') {
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    const title = String(body.title || '').trim().slice(0, 300);
    const text = String(body.body || '').trim().slice(0, MAX_BODY);
    if (!title || !text) return json({ error: 'A draft needs a title and a body' }, 400);
    const rec = {
      id: 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      title,
      body: text,
      // Frozen. Every diff is against what the task wrote, not against his last
      // save, so five small edits still read as one lesson about the whole post.
      originalTitle: title,
      original: text,
      source: String(body.source || '').slice(0, 300) || null,
      state: 'pending',
      createdAt: new Date().toISOString(),
      edits: []
    };
    try {
      await store().setJSON(rec.id, rec);
    } catch (e) {
      return json({ error: 'Could not save that. ' + String(e.message || e) }, 502);
    }
    return json({ ok: true, draft: rec });
  }

  if (!body.id) return json({ error: 'No id' }, 400);
  const k = key(body.id);
  let rec;
  try {
    rec = await store().get(k, { type: 'json' });
  } catch (e) {
    rec = null;
  }
  if (!rec) return json({ error: 'No such draft' }, 404);

  const now = new Date().toISOString();

  if (action === 'save') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    const title = String(body.title || rec.title).trim().slice(0, 300);
    const text = String(body.body || '').trim().slice(0, MAX_BODY);
    if (!text) return json({ error: 'A draft cannot be emptied. Reject it instead.' }, 400);
    if (text === rec.body && title === rec.title) return json({ ok: true, draft: rec, unchanged: true });

    // The diff is against the original, and it is computed here rather than by
    // the task, so the lesson survives even if the post is later edited again.
    const changes = diffSentences(rec.original, text);
    rec.edits = (rec.edits || []).concat([{
      at: now,
      titleWas: rec.originalTitle !== title ? rec.originalTitle : null,
      titleNow: rec.originalTitle !== title ? title : null,
      changes,
      shape: describeEdit(changes),
      lessonWritten: false
    }]).slice(-20);
    rec.title = title;
    rec.body = text;
    rec.editedAt = now;
  } else if (action === 'approve') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    if (rec.state === 'approved') return json({ ok: true, draft: rec, unchanged: true });
    rec.state = 'approved';
    rec.decidedAt = now;
    rec.reason = null;
  } else if (action === 'reject') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    // The reason is not optional. A rejection with no reason teaches the blog
    // task nothing and Ben will be rejecting the same post again next month.
    const reason = String(body.reason || '').trim().slice(0, 500);
    if (!reason) return json({ error: 'Say in one line why, or it will write the same thing again.' }, 400);
    rec.state = 'rejected';
    rec.decidedAt = now;
    rec.reason = reason;
  } else if (action === 'reopen') {
    if (caller !== 'page') return json({ error: 'Not allowed' }, 403);
    rec.state = 'pending';
    rec.decidedAt = null;
    rec.reason = null;
  } else if (action === 'published') {
    // The task reporting back that WordPress now has it, as a draft, under
    // Ellie's account. Never published live from here by anyone.
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    rec.wpUrl = String(body.wpUrl || '').slice(0, 500) || null;
    rec.wpAt = now;
    rec.state = 'published';
  } else if (action === 'lesson-written') {
    if (caller !== 'task') return json({ error: 'Not allowed' }, 403);
    rec.edits = (rec.edits || []).map((e) => ({ ...e, lessonWritten: true }));
    rec.lessonWritten = true;
  } else {
    return json({ error: 'Unknown action' }, 400);
  }

  try {
    await store().setJSON(k, rec);
  } catch (e) {
    return json({ error: 'Could not save that. ' + String(e.message || e) }, 502);
  }
  return json({ ok: true, draft: rec });
};

export const config = { path: '/api/blog' };
