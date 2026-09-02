// Sentence level diff, used for one thing: working out what Ben changed when he
// edits a blog draft, so the change can be turned into a voice lesson.
//
// Word level diff would be noise ("he moved a comma"). Whole document diff would
// be useless ("the post changed"). Sentences are the unit a lesson is actually
// written in: he cut this claim, he replaced this phrase with that one.

const MAX_UNITS = 400; // a long post, past which the lesson is not the problem

export function sentences(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((para) => para.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_UNITS);
}

// Longest common subsequence over sentences. O(n*m) on sentence counts, which
// for a blog post is a few hundred at worst.
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const keepA = new Array(n).fill(false);
  const keepB = new Array(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { keepA[i] = true; keepB[j] = true; i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return { keepA, keepB };
}

// Changed runs, as pairs. { was: '', now: 'x' } is an addition, { was: 'x',
// now: '' } is a cut, both filled is a rewrite. Unchanged sentences are dropped
// entirely, because a lesson is only ever about what he changed.
export function diffSentences(before, after) {
  const a = sentences(before);
  const b = sentences(after);
  if (!a.length && !b.length) return [];
  const { keepA, keepB } = lcs(a, b);

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && keepA[i] && keepB[j] && a[i] === b[j]) { i++; j++; continue; }
    const was = [];
    const now = [];
    while (i < a.length && !keepA[i]) was.push(a[i++]);
    while (j < b.length && !keepB[j]) now.push(b[j++]);
    if (!was.length && !now.length) { i++; j++; continue; }
    out.push({ was: was.join(' '), now: now.join(' ') });
  }
  return out;
}

// A one line shape of the edit, so the report and the ledger can say something
// useful without carrying the whole document around.
export function describeEdit(changes) {
  if (!changes.length) return 'no change';
  const cuts = changes.filter((c) => c.was && !c.now).length;
  const adds = changes.filter((c) => !c.was && c.now).length;
  const rewrites = changes.filter((c) => c.was && c.now).length;
  const bits = [];
  if (rewrites) bits.push(rewrites + (rewrites === 1 ? ' rewrite' : ' rewrites'));
  if (cuts) bits.push(cuts + (cuts === 1 ? ' cut' : ' cuts'));
  if (adds) bits.push(adds + (adds === 1 ? ' addition' : ' additions'));
  return bits.join(', ');
}
