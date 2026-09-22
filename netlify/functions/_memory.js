import { getStore } from '@netlify/blobs';

// What Ben tells the chat, kept.
//
// 22 September 2026. The complaint this fixes, in his words: the chat "doesn't
// see anything and doesn't know anything that's updated". Two reasons for that.
// The page's struck-through items read as live text to the model, which is
// handled in chat.js. And nothing he said survived the tab: the widget's history
// was a plain array in the browser. He would tell it a job had moved and it knew
// nothing about it an hour later.
//
// This is the second half. One short note per subject, server side, loaded into
// every conversation.
//
// NOT a transcript. A transcript of every chat would be mostly noise and would
// crowd out the page. What is kept is the standing position on a subject: what
// he decided, what is done, what is waiting and on whom.

const STORE = 'nuvo-memory';
const MAX_AGE_DAYS = 60;
const MAX_NOTES = 60; // what a conversation carries. Past this the oldest drop.
const MAX_TEXT = 600;
const MAX_WAS = 3; // superseded versions kept per subject

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

// A subject is the thing the note is about: "winklmeier pour", "corey year ends".
// It is the key, so saying something new about a subject REPLACES the old note
// rather than stacking a second one beside it. That is the whole point: he says
// "Corey's booked for Thursday", then on Thursday "that's done", and what the
// chat carries is the second one, not both.
export function keyFor(subject) {
  return String(subject || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function fresh(rec, now) {
  if (!rec || !rec.at) return false;
  return Date.parse(rec.at) > now - MAX_AGE_DAYS * 86400000;
}

// Newest first. A failure here returns nothing rather than throwing: a chat that
// answers without its memory is worse than one with it, and far better than one
// that will not answer at all.
export async function listNotes() {
  try {
    const s = store();
    const { blobs } = await s.list();
    const now = Date.now();
    const out = [];
    for (const b of blobs) {
      const rec = await s.get(b.key, { type: 'json' });
      if (fresh(rec, now)) out.push(rec);
    }
    out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return out.slice(0, MAX_NOTES);
  } catch (e) {
    return [];
  }
}

// Replaces the note on this subject, keeping up to three superseded versions so
// the trail is not silently lost. Nothing is ever deleted on an update, because
// "I already told you that" is the complaint, and losing what he told you is how
// you earn it.
export async function addNote({ subject, text, itemId }) {
  const key = keyFor(subject);
  if (!key) throw new Error('A note needs a subject.');
  const body = String(text || '').trim().slice(0, MAX_TEXT);
  if (!body) throw new Error('A note needs something in it.');

  const s = store();
  let prior = null;
  try {
    prior = await s.get(key, { type: 'json' });
  } catch (e) {
    prior = null;
  }

  const was = [];
  if (prior && prior.text && prior.text !== body) {
    was.push({ text: prior.text, at: prior.at });
    for (const old of prior.was || []) {
      if (was.length < MAX_WAS) was.push(old);
    }
  }

  const rec = {
    key,
    subject: String(subject || '').trim().slice(0, 120),
    text: body,
    at: new Date().toISOString(),
    ...(itemId ? { itemId: String(itemId).slice(0, 120) } : {}),
    ...(was.length ? { was } : {})
  };

  await s.setJSON(key, rec);
  return rec;
}

export async function forgetNote(subject) {
  const key = keyFor(subject);
  if (!key) return false;
  try {
    await store().delete(key);
    return true;
  } catch (e) {
    return false;
  }
}
