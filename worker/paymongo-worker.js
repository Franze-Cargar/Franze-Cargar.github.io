/**
 * Optional Cloudflare Worker — PayMongo v2 HOSTED CHECKOUT TEST MODE ONLY.
 * Do not publish any API keys in the frontend or this source code.
 * Required Worker secrets/vars:
 * PAYMONGO_TEST_SECRET_KEY: sk_test_... (SECRET)
 * ALLOWED_ORIGIN: https://<username>.github.io (PLAIN ENV VAR)
 * RETURN_BASE_URL: https://<username>.github.io/<optional-repo> (PLAIN ENV VAR)
 * DEMO_ACCESS_TOKEN: unique strong code, given only to testers (SECRET)
 * DB: D1 database binding with the existing checkout_sessions table
 *
 * The access token is supplied by testers separately — NEVER commit it to JS.
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
    const cors = {
      'Access-Control-Allow-Origin': origin === allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Demo-Token',
      'Vary': 'Origin',
    };
    const reply = (data, status) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    const path = new URL(request.url).pathname;
    if (path !== '/api/checkout') return reply({ error: 'Not found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    if (!allowed || origin !== allowed) return reply({ error: 'Origin not allowed' }, 403);
    if (!env.PAYMONGO_TEST_SECRET_KEY?.startsWith('sk_test_')) return reply({ error: 'Test key is not configured' }, 503);
    if (!env.RETURN_BASE_URL?.startsWith('https://')) return reply({ error: 'Return URL is not configured' }, 503);
    if (!env.DEMO_ACCESS_TOKEN || request.headers.get('X-Demo-Token') !== env.DEMO_ACCESS_TOKEN) return reply({ error: 'Valid demo access token required' }, 401);
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return reply({ error: 'Invalid name or email format' }, 400);
    if (!env.DB || typeof env.DB.prepare !== 'function') return reply({ error: 'Checkout storage is not configured' }, 503);
    const base = env.RETURN_BASE_URL.replace(/\/$/, '');
    const attributes = {
      line_items: [{ name: 'Sample website service package - TEST', amount: 150000, currency: 'PHP', quantity: 1 }],
      payment_method_types: ['card'],
      success_url: `${base}/payment-demo/return.html?status=returned`,
      cancel_url: `${base}/payment-demo/return.html?status=canceled`,
      reference_number: `DEMO-${crypto.randomUUID().slice(0, 18)}`,
      metadata: { application: 'portfolio-demo', usage: 'sandbox' }
    };
    try {
      const basic = btoa(`${env.PAYMONGO_TEST_SECRET_KEY}:`);
      const upstream = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ data: { attributes } }),
      });
      const json = await upstream.json();
      if (!upstream.ok) return reply({ error: 'PayMongo test session request failed', details: json.errors?.map(e => e.code).slice(0, 3) || [] }, 502);
      const session_id = json?.data?.id;
      const response_attributes = json?.data?.attributes;
      const reference_number = response_attributes?.reference_number;
      const has_reference_number = response_attributes != null &&
        Object.prototype.hasOwnProperty.call(response_attributes, 'reference_number');
      const livemode = response_attributes?.livemode;
      const checkout_url = response_attributes?.checkout_url;
      const invalid_fields = [];
      if (typeof session_id !== 'string' || !session_id.trim()) invalid_fields.push('session_id');
      if (livemode !== false) invalid_fields.push('livemode');
      // PayMongo v2 may omit the reference; an explicitly different value is invalid.
      if (has_reference_number && reference_number !== attributes.reference_number) invalid_fields.push('reference_number');
      let valid_checkout_url = false;
      if (typeof checkout_url === 'string') {
        try {
          const checkout = new URL(checkout_url);
          valid_checkout_url = checkout.origin === 'https://checkout.paymongo.com' &&
            checkout.username === '' && checkout.password === '';
        } catch {
          // Only fixed field names are reported below, never the URL or parser error.
        }
      }
      if (!valid_checkout_url) invalid_fields.push('checkout_url');
      if (invalid_fields.length) {
        console.warn('PayMongo checkout response validation failed', { invalid_fields });
        return reply({ error: 'Invalid session response' }, 502);
      }
      try {
        const stored = await env.DB.prepare(
          'INSERT INTO checkout_sessions ' +
          '(reference_number, session_id, expected_amount, currency, livemode, status, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
        ).bind(attributes.reference_number, session_id, 150000, 'PHP', 0, 'pending').run();
        if (stored?.success !== true) return reply({ error: 'Unable to store checkout session' }, 503);
      } catch {
        return reply({ error: 'Unable to store checkout session' }, 503);
      }
      return reply({ checkout_url }, 200);
    } catch {
      return reply({ error: 'Temporary backend error' }, 502);
    }
  }
};
