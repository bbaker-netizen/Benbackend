import { isSignedIn, json } from './_auth.js';
import { runJobTreadQuery } from './jobtread.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 5;

const SYSTEM = `You are Ben Pond's assistant. Ben is Director of Nuvo Construction, a
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

async function callAnthropic(messages, useTools) {
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
      system: SYSTEM,
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

  try {
    let reply = await callAnthropic(messages, hasJobTread);

    for (let round = 0; round < MAX_TOOL_ROUNDS && reply.stop_reason === 'tool_use'; round++) {
      const calls = (reply.content || []).filter((b) => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: reply.content });

      const results = [];
      for (const call of calls) {
        let out;
        try {
          out = await runJobTreadQuery(call.input?.query || {});
          used.push('JobTread');
        } catch (e) {
          out = { error: String(e.message || e) };
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(out).slice(0, 40000)
        });
      }

      messages.push({ role: 'user', content: results });
      reply = await callAnthropic(messages, hasJobTread);
    }

    const answer = textOf(reply);
    return json({
      answer: answer || 'No answer came back. Try asking that a different way.',
      usedLiveData: used.length > 0
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};

export const config = { path: '/api/chat' };
