import { who, json } from './_auth.js';
import { graphConfigured, searchMail, readMail, listEvents, mailbox } from './_graph.js';

// /api/mail. Live mailbox reads, on demand.
//
// This is the endpoint behind both halves of what Ben asked for on 3 September:
// the chat going and looking when he asks about an email, and the refresh
// button that answers "what has come in since this page was built".
//
// It reads. It never marks read, never moves, never flags, never replies. There
// is no code path here that writes to the mailbox, and there must never be one.

const NOT_CONFIGURED = {
  error: 'not-configured',
  message:
    'Live mail is built but not connected yet. It needs a Microsoft app registration ' +
    'and three values set on the site: MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET. ' +
    'The ten minute runbook is in claude/graph-mail-setup.md.'
};

export default async (request) => {
  const caller = who(request);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  // Say it plainly rather than returning an empty list. An empty inbox and an
  // unconnected one look identical to a caller, and that is exactly the
  // confusion that made the chat answer a mail question it could not answer.
  if (!graphConfigured()) return json(NOT_CONFIGURED, 503);

  const url = new URL(request.url);
  const p = url.searchParams;

  try {
    if (p.get('id')) {
      return json({ ok: true, mailbox: mailbox(), message: await readMail(p.get('id')) });
    }
    if (p.get('calendar') === '1') {
      return json({ ok: true, mailbox: mailbox(), events: await listEvents({ hours: p.get('hours') }) });
    }

    const messages = await searchMail({
      q: p.get('q'),
      sinceHours: p.get('hours'),
      from: p.get('from'),
      folder: p.get('folder'),
      limit: p.get('limit')
    });

    return json({
      ok: true,
      mailbox: mailbox(),
      checkedAt: new Date().toISOString(),
      count: messages.length,
      messages
    });
  } catch (e) {
    // The reason matters. A 403 is a policy problem, a 400 is usually a bad
    // query, and both used to surface as "could not reach mail", which sends
    // whoever is fixing it to the wrong place.
    return json({ error: 'mail-failed', message: String(e.message || e) }, 502);
  }
};

export const config = { path: '/api/mail' };
