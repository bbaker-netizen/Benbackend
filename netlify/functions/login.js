import { passwordOk, cookieHeader, clearHeader, json } from './_auth.js';

// Deliberately slow and quiet. No hint about whether the password was close.
export default async (request) => {
  if (request.method === 'GET' && new URL(request.url).searchParams.get('out') === '1') {
    return new Response(null, {
      status: 302,
      headers: { location: '/', 'set-cookie': clearHeader() }
    });
  }

  if (request.method !== 'POST') return json({ ok: false }, 405);

  let password = '';
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      password = (await request.json()).password;
    } else {
      password = (await request.formData()).get('password');
    }
  } catch (e) {
    return json({ ok: false, error: 'Bad request' }, 400);
  }

  // Small fixed delay blunts brute forcing without annoying a real person.
  await new Promise((r) => setTimeout(r, 400));

  if (!passwordOk(password)) return json({ ok: false, error: 'Wrong password' }, 401);

  return json({ ok: true }, 200, { 'set-cookie': cookieHeader() });
};

export const config = { path: '/api/login' };
