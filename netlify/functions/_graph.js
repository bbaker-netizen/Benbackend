// Microsoft Graph, read only.
//
// WHY THIS EXISTS. Until now the app could reach exactly two places: Anthropic
// and JobTread. Everything else in Ben's system, mail and calendar included,
// arrived only when a scheduled Claude session ran and wrote it into the page.
// So between the 6:30am and 2:30pm rebuilds the app was blind to his inbox, and
// when he asked the chat about an email it had no way to look. It answered
// anyway, which is worse than refusing.
//
// JobTread is live because it is a plain HTTPS API with a key in Netlify env.
// Graph is the same shape, so mail and calendar can be live the same way, with
// no scheduled task in the loop.
//
// WHAT THIS IS ALLOWED TO DO. Read. Nothing else, ever. The app registration
// must hold Mail.Read and Calendars.Read and NOT Mail.ReadWrite, Mail.Send or
// anything that writes. Ben's standing rule since July is that the Outlook
// connector is strictly read only, and this must not become the exception.
//
// SCOPE, AND WHY IT MATTERS MORE THAN ANYTHING ELSE HERE. Application
// permissions in Graph are tenant wide by default. Mail.Read granted app-only,
// with no further restriction, reads EVERY mailbox at Nuvo, not Ben's. That is
// not what this is for and it must be constrained in Exchange with an
// application access policy scoped to Ben alone. See
// claude/graph-mail-setup.md. If that policy is missing, this code still works,
// which is exactly the danger: nothing here can detect the over-grant.

const LOGIN = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';

export function graphConfigured() {
  return Boolean(
    process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET
  );
}

export function mailbox() {
  return (process.env.MS_MAILBOX || 'ben@nuvoconstruction.com').trim();
}

// One token per cold start, reused until it is nearly expired. A client
// credentials token lasts about an hour, so this turns most requests into one
// round trip instead of two.
let tokenCache = null;

async function token() {
  if (tokenCache && tokenCache.expires > Date.now() + 60000) return tokenCache.value;

  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const r = await fetch(`${LOGIN}/${encodeURIComponent(process.env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Microsoft sign in did not return JSON. ' + text.slice(0, 200));
  }
  if (!r.ok || !data.access_token) {
    // Say which of the three it is. "Invalid client" and "no such tenant" are
    // different problems with different fixes and the raw error names them.
    throw new Error(
      'Microsoft sign in failed. ' + (data.error_description || data.error || r.status)
    );
  }

  tokenCache = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

async function graph(path) {
  const t = await token();
  const r = await fetch(GRAPH + path, {
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error('Graph did not return JSON. ' + text.slice(0, 200));
  }
  if (!r.ok) {
    const msg = (data.error && (data.error.message || data.error.code)) || r.status;
    // The two failures worth naming, because the fix is different for each.
    if (r.status === 403) {
      throw new Error(
        'Graph refused that (403). Usually the application access policy does not ' +
        'include this mailbox, or the Mail.Read permission has not been granted ' +
        'admin consent. ' + msg
      );
    }
    if (r.status === 404) {
      throw new Error(`Graph could not find the mailbox ${mailbox()}. Check MS_MAILBOX. ` + msg);
    }
    throw new Error('Graph error ' + r.status + '. ' + msg);
  }
  return data;
}

// Only the fields worth carrying. Bodies are deliberately NOT selected here:
// a search that drags twenty full bodies back is slow, expensive in tokens, and
// almost never what was wanted. Ask for one body when you need one.
const LIST_FIELDS = 'id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,webLink,conversationId';

function clean(m) {
  return {
    id: m.id,
    subject: m.subject || '(no subject)',
    from: m.from && m.from.emailAddress
      ? { name: m.from.emailAddress.name || '', address: m.from.emailAddress.address || '' }
      : null,
    to: (m.toRecipients || []).map((r) => r.emailAddress && r.emailAddress.address).filter(Boolean),
    at: m.receivedDateTime,
    unread: m.isRead === false,
    attachments: Boolean(m.hasAttachments),
    preview: (m.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    link: m.webLink || null
  };
}

// Graph will not accept $search alongside $filter or $orderby on messages, so
// these are two different calls rather than one flexible one. Getting that
// wrong returns a 400 that reads like a permissions problem, which sends you
// looking in the wrong place for an hour.
export async function searchMail({ q, sinceHours, from, folder, limit } = {}) {
  const top = Math.min(Math.max(Number(limit) || 25, 1), 50);
  const box = encodeURIComponent(mailbox());
  const scope = folder ? `/mailFolders/${encodeURIComponent(folder)}/messages` : '/messages';

  if (q && String(q).trim()) {
    const term = String(q).trim().slice(0, 300).replace(/"/g, '');
    const path =
      `/users/${box}${scope}?$search=${encodeURIComponent('"' + term + '"')}` +
      `&$select=${LIST_FIELDS}&$top=${top}`;
    const d = await graph(path);
    return (d.value || []).map(clean);
  }

  const hours = Math.min(Math.max(Number(sinceHours) || 24, 1), 24 * 30);
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const filters = [`receivedDateTime ge ${since}`];
  if (from && String(from).trim()) {
    const addr = String(from).trim().slice(0, 200).replace(/'/g, "''");
    filters.push(`from/emailAddress/address eq '${addr}'`);
  }
  const path =
    `/users/${box}${scope}?$filter=${encodeURIComponent(filters.join(' and '))}` +
    `&$select=${LIST_FIELDS}&$top=${top}&$orderby=${encodeURIComponent('receivedDateTime desc')}`;
  const d = await graph(path);
  return (d.value || []).map(clean);
}

export async function readMail(id) {
  const box = encodeURIComponent(mailbox());
  const mid = encodeURIComponent(String(id));
  const d = await graph(`/users/${box}/messages/${mid}?$select=${LIST_FIELDS},body`);
  const out = clean(d);
  const raw = (d.body && d.body.content) || '';
  // Plain text out of HTML, roughly. The model does not need the markup and the
  // markup is most of the bytes.
  out.body = raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 12000);
  return out;
}

export async function listEvents({ hours } = {}) {
  const box = encodeURIComponent(mailbox());
  const h = Math.min(Math.max(Number(hours) || 24, 1), 24 * 14);
  const start = new Date().toISOString();
  const end = new Date(Date.now() + h * 3600000).toISOString();
  const d = await graph(
    `/users/${box}/calendarView?startDateTime=${start}&endDateTime=${end}` +
    `&$select=subject,start,end,location,organizer,isAllDay&$top=50&$orderby=${encodeURIComponent('start/dateTime')}`
  );
  return (d.value || []).map((e) => ({
    subject: e.subject || '(no subject)',
    start: e.start && e.start.dateTime,
    end: e.end && e.end.dateTime,
    allDay: Boolean(e.isAllDay),
    where: (e.location && e.location.displayName) || null,
    organizer: e.organizer && e.organizer.emailAddress ? e.organizer.emailAddress.name : null
  }));
}
