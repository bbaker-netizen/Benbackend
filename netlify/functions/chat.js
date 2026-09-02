import { isSignedIn, json } from './_auth.js';
import { runJobTreadQuery } from './jobtread.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_BASE = `You are Ben Pond's assistant. Ben is Director of Nuvo Construction, a
residential renovation and custom build company in St Albert, Alberta. He is usually
standing on a site reading this on a phone.

How to answer:
- Lead with the answer. One line if one line will do.
- Short sentences, often fragments. Plain trade language. No corporate tone.
- Canadian spelling. Never use em dashes, hashtags or emoji.
- Make the decision for him where you reasonably can, and say what you decided.
- One thing at a time. Never hand him ten options.
- Never put a new recurring task on him.
- If you do not know, say so plainly. Leave a blank rather than inventing a fact.
- Under 200 words unless he asks for depth.

You are given the Command Centre page he is looking at, as context. You also have a
jobtread_query tool for live data. Use it whenever he asks about anything the page
cannot answer, such as a date range, a channel breakdown, or a specific job. Do not
guess at numbers you could look up.

You cannot send email, post anything, or change anything. If he asks you to, say so in
one line and offer to draft the text instead.`;

// Pave needs the organization id on nearly every query. Look it up once per cold
// start and hand it to the model, rather than spending two of its five tool
// rounds rediscovering it every time Ben asks a question.
//
// Nuvo has one organization, 22NkB8CHiFWy. The grant key in Netlify answers
// queries against it perfectly well but returns null for currentGrant.organization,
// so the obvious lookup finds nothing. Hence the ladder, and hence the constant at
// the bottom of it. Set JOBTREAD_ORGANIZATION_ID in Netlify to override.
const KNOWN_ORG_ID = '22NkB8CHiFWy';

let orgIdCache;

async function probe(query, pick) {
  try {
    const r = await runJobTreadQuery(query);
    const id = pick(r);
    return typeof id === 'string' && id ? id : null;
  } catch (e) {
    return null;
  }
}

async function organizationId() {
  if (orgIdCache !== undefined) return orgIdCache;

  orgIdCache =
    (process.env.JOBTREAD_ORGANIZATION_ID || '').trim() ||
    (await probe(
      { currentGrant: { organization: { id: {} } } },
      (r) => r?.currentGrant?.organization?.id
    )) ||
    (await probe(
      { currentGrant: { user: { memberships: { nodes: { organization: { id: {} } } } } } },
      (r) => r?.currentGrant?.user?.memberships?.nodes?.[0]?.organization?.id
    )) ||
    KNOWN_ORG_ID;

  return orgIdCache;
}

function systemPrompt(orgId) {
  if (!orgId) return SYSTEM_BASE;
  return SYSTEM_BASE + `

Nuvo's JobTread organization id is ${orgId}. Use it. Do not go looking for it.

Pave is a JSON graph API. Select a scalar with an empty object, put arguments
under "$", and alias a field to a schema type with "_". A query looks like:

{ "organization": { "$": { "id": "${orgId}" }, "jobs": { "count": {} } } }

{ "organization": { "$": { "id": "${orgId}" },
  "openJobs": { "_": "jobs", "$": { "where": ["closedOn", "=", null] }, "count": {} } } }

Ask for counts and sums rather than pulling rows you then have to add up, and
keep the field list short. A 413 means the query cost too much, not that it was
too long.`;
}

const TOOLS = [
  {
    name: 'jobtread_query',
    description:
      'Run a read-only Pave query against JobTread and return the JSON result. ' +
      'Use for live figures: jobs, leads, lead sources, dates, values, comments, ' +
      'daily logs. Pass the query object exactly as Pave expects, WITHOUT the ' +
      'grantKey, which is added server side. Keep queries narrow: a 413 error means ' +
      'the query cost too much, so ask for fewer fields or a smaller page.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          description: 'The Pave query object, e.g. { organization: { $: { id: "..." }, ... } }'
        }
      },
      required: ['query']
    }
  }
];

async function callAnthropic(messages, useTools, system) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1400,
      system,
      messages,
      ...(useTools ? { tools: TOOLS } : {})
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 400)}`);
  }
  return res.json();
}

function textOf(reply) {
  return (reply.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export default async (request) => {
  if (!isSignedIn(request)) return json({ error: 'Not signed in' }, 401);
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY is not set in Netlify.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  const question = String(body.question || '').slice(0, 4000).trim();
  const page = String(body.page || '').slice(0, 14000);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!question) return json({ error: 'No question' }, 400);

  const messages = [];
  for (const m of history) {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') {
      messages.push({ role: m.role, content: m.text.slice(0, 4000) });
    }
  }
  messages.push({
    role: 'user',
    content:
      `--- COMMAND CENTRE PAGE ---\n${page}\n--- END PAGE ---\n\nBen asks:\n${question}`
  });

  const hasJobTread = Boolean(process.env.JOBTREAD_GRANT_KEY);
  const used = [];
  const toolErrors = [];

  try {
    const system = systemPrompt(hasJobTread ? await organizationId() : null);
    let reply = await callAnthropic(messages, hasJobTread, system);

    for (let round = 0; round < MAX_TOOL_ROUNDS && reply.stop_reason === 'tool_use'; round++) {
      const calls = (reply.content || []).filter((b) => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: reply.content });

      const results = [];
      for (const call of calls) {
        let out;
        try {
          out = await runJobTreadQuery(call.input?.query || {});
          used.push('JobTread');
          if (out && out.error) toolErrors.push(String(out.error));
        } catch (e) {
          out = { error: String(e.message || e) };
          toolErrors.push(out.error);
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(out).slice(0, 40000)
        });
      }

      // Last round. Feed the results back with the tools taken away, so the model
      // has to answer in words. Otherwise it keeps reaching for the tool, the loop
      // ends on a tool call carrying no text, and Ben gets a blank.
      const lastRound = round === MAX_TOOL_ROUNDS - 1;
      if (lastRound) {
        messages.push({
          role: 'user',
          content: results.concat([{
            type: 'text',
            text: 'That is all the looking up you get. Answer now with what you have. ' +
                  'If you could not get the figure, say so plainly in one line and say why.'
          }])
        });
        reply = await callAnthropic(messages, false, system);
        break;
      }

      messages.push({ role: 'user', content: results });
      reply = await callAnthropic(messages, hasJobTread, system);
    }

    let answer = textOf(reply);
    if (!answer) {
      // Never a blank. Say what went wrong, because a silent failure is the one
      // thing that stops him trusting the page.
      answer = toolErrors.length
        ? 'I could not get that out of JobTread. ' + toolErrors[toolErrors.length - 1]
        : 'No answer came back. Try asking that a different way.';
    }

    return json({
      answer,
      usedLiveData: used.length > 0
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};

export const config = { path: '/api/chat' };
