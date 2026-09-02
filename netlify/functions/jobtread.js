// Thin, guarded passthrough to JobTread's Pave API.
// The grant key lives in Netlify and never touches the browser.

const ENDPOINT = 'https://api.jobtread.com/pave';

export async function runJobTreadQuery(query) {
  const grantKey = process.env.JOBTREAD_GRANT_KEY;
  if (!grantKey) throw new Error('JOBTREAD_GRANT_KEY is not set');

  // Inject the key into the query root. Never let a caller supply its own.
  const body = { query: { ...query } };
  body.query.$ = { ...(body.query.$ || {}), grantKey };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    // 413 from JobTread is a query COST budget, not a size limit. Say so, so the
    // model narrows the query rather than retrying the same thing.
    if (res.status === 413) {
      throw new Error(
        'JobTread rejected the query as too expensive (413). Ask for fewer fields, ' +
        'a smaller page size, or a narrower date range, then try again.'
      );
    }
    throw new Error(`JobTread ${res.status}: ${text.slice(0, 400)}`);
  }

  // Guard the model's context. Better an honest refusal than a silent half answer.
  if (text.length > 60000) {
    return {
      error: 'Response too large to read in one go. Narrow the query, ' +
             'fewer fields or a smaller page, and ask again.',
      bytes: text.length
    };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: 'JobTread returned something that was not JSON.', raw: text.slice(0, 500) };
  }
}
