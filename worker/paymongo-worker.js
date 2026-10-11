/**
 * Optional Cloudflare Worker — PayMongo v2 HOSTED CHECKOUT TEST MODE ONLY.
 * Do not publish any API keys in the frontend or this source code.
 * Required Worker secrets/vars:
 * PAYMONGO_TEST_SECRET_KEY: sk_test_... (SECRET)
 * ALLOWED_ORIGIN: https://<username>.github.io (PLAIN ENV VAR)
 * RETURN_BASE_URL: https://<username>.github.io/<optional-repo> (PLAIN ENV VAR)
 * DEMO_ACCESS_TOKEN: unique strong code, given only to testers (SECRET)
 * PAYMONGO_WEBHOOK_SECRET: endpoint signing secret (Cloudflare encrypted SECRET)
 * DB: D1 binding with existing checkout_sessions, payments, and webhook_events tables
 *
 * The access token is supplied by testers separately — NEVER commit it to JS.
 */
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/api/webhook")
      return handlePaymongoWebhook(request, env);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
    const cors = {
      "Access-Control-Allow-Origin": origin === allowed ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Demo-Token",
      Vary: "Origin",
    };
    const reply = (data, status) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    const path = new URL(request.url).pathname;
    if (path !== "/api/checkout") return reply({ error: "Not found" }, 404);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    if (!allowed || origin !== allowed)
      return reply({ error: "Origin not allowed" }, 403);
    if (!env.PAYMONGO_TEST_SECRET_KEY?.startsWith("sk_test_"))
      return reply({ error: "Test key is not configured" }, 503);
    if (!env.RETURN_BASE_URL?.startsWith("https://"))
      return reply({ error: "Return URL is not configured" }, 503);
    if (
      !env.DEMO_ACCESS_TOKEN ||
      request.headers.get("X-Demo-Token") !== env.DEMO_ACCESS_TOKEN
    )
      return reply({ error: "Valid demo access token required" }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ error: "Invalid JSON" }, 400);
    }
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    if (
      name.length < 2 ||
      name.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 120
    )
      return reply({ error: "Invalid name or email format" }, 400);
    if (!env.DB || typeof env.DB.prepare !== "function")
      return reply({ error: "Checkout storage is not configured" }, 503);
    const base = env.RETURN_BASE_URL.replace(/\/$/, "");
    const attributes = {
      line_items: [
        {
          name: "Sample website service package - TEST",
          amount: 150000,
          currency: "PHP",
          quantity: 1,
        },
      ],
      payment_method_types: ["card"],
      success_url: `${base}/payment-demo/return.html?status=returned`,
      cancel_url: `${base}/payment-demo/return.html?status=canceled`,
      reference_number: `DEMO-${crypto.randomUUID().slice(0, 18)}`,
      metadata: { application: "portfolio-demo", usage: "sandbox" },
    };
    try {
      const basic = btoa(`${env.PAYMONGO_TEST_SECRET_KEY}:`);
      const upstream = await fetch(
        "https://api.paymongo.com/v2/checkout_sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ data: { attributes } }),
        },
      );
      const json = await upstream.json();
      if (!upstream.ok)
        return reply(
          {
            error: "PayMongo test session request failed",
            details: json.errors?.map((e) => e.code).slice(0, 3) || [],
          },
          502,
        );
      const session_id = json?.data?.id;
      const response_attributes = json?.data?.attributes;
      const reference_number = response_attributes?.reference_number;
      const has_reference_number =
        response_attributes != null &&
        Object.prototype.hasOwnProperty.call(
          response_attributes,
          "reference_number",
        );
      const livemode = response_attributes?.livemode;
      const checkout_url = response_attributes?.checkout_url;
      const invalid_fields = [];
      if (typeof session_id !== "string" || !session_id.trim())
        invalid_fields.push("session_id");
      if (livemode !== false) invalid_fields.push("livemode");
      // PayMongo v2 may omit the reference; an explicitly different value is invalid.
      if (
        has_reference_number &&
        reference_number !== attributes.reference_number
      )
        invalid_fields.push("reference_number");
      let valid_checkout_url = false;
      if (typeof checkout_url === "string") {
        try {
          const checkout = new URL(checkout_url);
          valid_checkout_url =
            checkout.origin === "https://checkout.paymongo.com" &&
            checkout.username === "" &&
            checkout.password === "";
        } catch {
          // Only fixed field names are reported below, never the URL or parser error.
        }
      }
      if (!valid_checkout_url) invalid_fields.push("checkout_url");
      if (invalid_fields.length) {
        console.warn("PayMongo checkout response validation failed", {
          invalid_fields,
        });
        return reply({ error: "Invalid session response" }, 502);
      }
      try {
        const stored = await env.DB.prepare(
          "INSERT INTO checkout_sessions " +
            "(reference_number, session_id, expected_amount, currency, livemode, status, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
          .bind(
            attributes.reference_number,
            session_id,
            150000,
            "PHP",
            0,
            "pending",
          )
          .run();
        if (stored?.success !== true)
          return reply({ error: "Unable to store checkout session" }, 503);
      } catch {
        return reply({ error: "Unable to store checkout session" }, 503);
      }
      return reply({ checkout_url }, 200);
    } catch {
      return reply({ error: "Temporary backend error" }, 502);
    }
  },
};

function webhookReply(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Temporary diagnostics: fixed labels and numeric HTTP status only; never payloads or errors.
function warnWebhook503(stage, operation, upstreamStatus) {
  console.warn("PayMongo webhook HTTP 503", {
    stage,
    operation,
    ...(Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599
      ? { upstream_http_status: upstreamStatus }
      : {}),
  });
}

function webhookId(value, prefix) {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    value.startsWith(prefix) &&
    /^[A-Za-z0-9_]+$/.test(value) &&
    value.length > prefix.length
  );
}

async function readWebhookBody(request) {
  // Bound unauthenticated input without changing any bytes used by the signature.
  const limit = 1024 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

async function verifyPaymongoTestSignature(signatureHeader, rawBody, secret) {
  if (
    typeof signatureHeader !== "string" ||
    typeof secret !== "string" ||
    !secret
  )
    return false;
  const fields = Object.create(null);
  for (const part of signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (
      !["t", "te", "li"].includes(name) ||
      Object.prototype.hasOwnProperty.call(fields, name)
    )
      return false;
    fields[name] = value;
  }
  if (
    !/^\d+$/.test(fields.t || "") ||
    !Number.isSafeInteger(Number(fields.t)) ||
    Number(fields.t) <= 0 ||
    !/^[a-fA-F0-9]{64}$/.test(fields.te || "")
  )
    return false;
  const prefix = new TextEncoder().encode(fields.t + ".");
  const signedPayload = new Uint8Array(prefix.length + rawBody.length);
  signedPayload.set(prefix);
  signedPayload.set(rawBody, prefix.length);
  const signature = Uint8Array.from(fields.te.match(/../g), (pair) =>
    parseInt(pair, 16),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature, signedPayload);
}

function normalizePaymongoEvent(payload) {
  const event = payload?.data;
  // General Events documentation: data.id/type/attributes.
  if (event?.type === "event" && event.attributes && !payload.event_type) {
    if (
      !webhookId(event.id, "evt_") ||
      typeof event.attributes.type !== "string"
    )
      return null;
    return {
      providerEventId: event.id,
      type: event.attributes.type,
      livemode: event.attributes.livemode,
      session: event.attributes.data,
    };
  }
  // Hosted Checkout documentation: event_type=send.webhook; no provider ID shown.
  if (
    payload?.event_type === "send.webhook" &&
    typeof event?.type === "string" &&
    event.resource === "checkout_session"
  ) {
    return {
      providerEventId: null,
      type: event.type,
      livemode: event.livemode,
      session: event.data,
    };
  }
  return null;
}

async function retrievePaymongoResource(path, secret, diagnosticStage) {
  let upstreamStatus;
  try {
    const response = await fetch("https://api.paymongo.com/v1/" + path, {
      method: "GET",
      headers: {
        Authorization: "Basic " + btoa(secret + ":"),
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    upstreamStatus = response.status;
    if (!response.ok) throw new Error("PayMongo verification unavailable");
    return (await response.json())?.data;
  } catch (error) {
    warnWebhook503(diagnosticStage, "retrieve_resource", upstreamStatus);
    throw error;
  }
}

async function handlePaymongoWebhook(request, env) {
  if (request.method !== "POST")
    return webhookReply({ error: "Method not allowed" }, 405);
  if (
    typeof env.PAYMONGO_WEBHOOK_SECRET !== "string" ||
    !env.PAYMONGO_WEBHOOK_SECRET
  ) {
    warnWebhook503("webhook_configuration", "signing_secret_unavailable");
    return webhookReply({ error: "Webhook signing is not configured" }, 503);
  }
  let rawBody;
  try {
    rawBody = await readWebhookBody(request);
    if (rawBody === null)
      return webhookReply({ error: "Webhook payload too large" }, 413);
    if (
      !(await verifyPaymongoTestSignature(
        request.headers.get("Paymongo-Signature"),
        rawBody,
        env.PAYMONGO_WEBHOOK_SECRET,
      ))
    ) {
      return webhookReply({ error: "Invalid webhook signature" }, 401);
    }
  } catch {
    warnWebhook503("signature_verification_exception", "authenticate_webhook");
    return webhookReply({ error: "Unable to authenticate webhook" }, 503);
  }
  let event;
  try {
    // JSON decoding happens only after the HMAC has authenticated the exact bytes.
    const payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        rawBody,
      ),
    );
    event = normalizePaymongoEvent(payload);
  } catch {
    return webhookReply({ error: "Invalid webhook payload" }, 400);
  }
  if (!event)
    return webhookReply({ error: "Unsupported webhook envelope" }, 400);
  if (event.livemode !== false)
    return webhookReply({ error: "TEST events only" }, 422);
  if (event.type !== "checkout_session.payment.paid")
    return webhookReply({ status: "ignored" }, 200);

  const session = event.session;
  if (session?.type !== "checkout_session" || !webhookId(session.id, "cs_")) {
    return webhookReply({ error: "Invalid checkout session" }, 422);
  }
  const attributes = session.attributes;
  if (
    !attributes ||
    (Object.prototype.hasOwnProperty.call(attributes, "livemode") &&
      attributes.livemode !== false) ||
    !Array.isArray(attributes.payments)
  ) {
    return webhookReply({ error: "Invalid checkout session" }, 422);
  }
  const paidPayments = attributes.payments.filter(
    (payment) => payment?.attributes?.status === "paid",
  );
  // Do not guess which payment caused the event if its snapshot is ambiguous.
  if (paidPayments.length !== 1 || !webhookId(paidPayments[0].id, "pay_")) {
    return webhookReply({ error: "Invalid payment snapshot" }, 422);
  }
  const payment = paidPayments[0];
  const paymentAttributes = payment.attributes;
  if (
    paymentAttributes.amount !== 150000 ||
    paymentAttributes.currency !== "PHP" ||
    (Object.prototype.hasOwnProperty.call(paymentAttributes, "livemode") &&
      paymentAttributes.livemode !== false)
  ) {
    return webhookReply(
      { error: "Payment does not match expected transaction" },
      422,
    );
  }
  if (!env.PAYMONGO_TEST_SECRET_KEY?.startsWith("sk_test_")) {
    warnWebhook503("webhook_configuration", "test_key_unavailable");
    return webhookReply({ error: "Test verification is not configured" }, 503);
  }
  if (
    !env.DB ||
    typeof env.DB.prepare !== "function" ||
    typeof env.DB.batch !== "function"
  ) {
    warnWebhook503("webhook_configuration", "database_binding_unavailable");
    return webhookReply({ error: "Webhook storage is not configured" }, 503);
  }
  // A local key is explicit; a missing provider ID is never fabricated.
  const eventKey = event.providerEventId
    ? "paymongo:event:" + event.providerEventId
    : "paymongo:transaction:" +
      event.type +
      ":" +
      session.id +
      ":" +
      payment.id;
  let diagnosticStage = "checkout_database_lookup";
  let diagnosticOperation = "webhook_event_lookup";
  try {
    const existingEvent = await env.DB.prepare(
      "SELECT event_key, provider_event_id, event_type, session_id, payment_id, status FROM webhook_events " +
        "WHERE event_key = ? OR (provider_event_id IS NOT NULL AND provider_event_id = ?)",
    )
      .bind(eventKey, event.providerEventId)
      .first();
    if (existingEvent) {
      if (
        existingEvent.event_type !== event.type ||
        existingEvent.session_id !== session.id ||
        existingEvent.payment_id !== payment.id
      ) {
        return webhookReply({ error: "Conflicting webhook event" }, 409);
      }
      if (existingEvent.status === "processed")
        return webhookReply({ status: "processed", duplicate: true }, 200);
      if (existingEvent.status !== "received")
        return webhookReply({ error: "Conflicting webhook event" }, 409);
    }
    diagnosticOperation = "checkout_session_lookup";
    const storedSession = await env.DB.prepare(
      "SELECT session_id, reference_number, expected_amount, currency, livemode, status " +
        "FROM checkout_sessions WHERE session_id = ?",
    )
      .bind(session.id)
      .first();
    if (!storedSession) {
      warnWebhook503("checkout_database_lookup", "session_not_found");
      return webhookReply({ error: "Checkout session is not available" }, 503);
    }
    if (
      storedSession.expected_amount !== 150000 ||
      storedSession.currency !== "PHP" ||
      storedSession.livemode !== 0 ||
      !["pending", "paid"].includes(storedSession.status) ||
      (Object.prototype.hasOwnProperty.call(attributes, "reference_number") &&
        attributes.reference_number !== storedSession.reference_number)
    ) {
      return webhookReply(
        { error: "Checkout session does not match expected transaction" },
        422,
      );
    }

    let verifiedSession, verifiedPayment;
    try {
      // Both requests use the TEST secret, fixed API origin, and bounded timeouts.
      verifiedSession = await retrievePaymongoResource(
        "checkout_sessions/" + encodeURIComponent(session.id),
        env.PAYMONGO_TEST_SECRET_KEY,
        "paymongo_checkout_session_retrieval",
      );
      verifiedPayment = await retrievePaymongoResource(
        "payments/" + encodeURIComponent(payment.id),
        env.PAYMONGO_TEST_SECRET_KEY,
        "paymongo_payment_retrieval",
      );
    } catch {
      return webhookReply(
        { error: "Payment verification temporarily unavailable" },
        503,
      );
    }
    diagnosticStage = "paymongo_response_verification";
    diagnosticOperation = "verify_resources";
    const verifiedSessionAttributes = verifiedSession?.attributes;
    const verifiedPaymentAttributes = verifiedPayment?.attributes;
    if (
      verifiedSession?.id !== session.id ||
      verifiedSession.type !== "checkout_session" ||
      verifiedSessionAttributes?.livemode !== false ||
      !Array.isArray(verifiedSessionAttributes.payments) ||
      !verifiedSessionAttributes.payments.some(
        (item) => item?.id === payment.id,
      ) ||
      (Object.prototype.hasOwnProperty.call(
        verifiedSessionAttributes,
        "reference_number",
      ) &&
        verifiedSessionAttributes.reference_number !==
          storedSession.reference_number) ||
      verifiedPayment?.id !== payment.id ||
      verifiedPayment.type !== "payment" ||
      verifiedPaymentAttributes?.amount !== storedSession.expected_amount ||
      verifiedPaymentAttributes.currency !== storedSession.currency ||
      verifiedPaymentAttributes.livemode !== false
    ) {
      return webhookReply({ error: "Payment verification mismatch" }, 422);
    }
    if (verifiedPaymentAttributes.status !== "paid") {
      warnWebhook503("paymongo_response_verification", "payment_not_paid");
      return webhookReply(
        { error: "Payment is not yet verified as paid" },
        503,
      );
    }

    // D1 batch is one transaction: a failing statement rolls back every write.
    // Reserve an event as received, and guard each subsequent write against its identity.
    // A received event can be retried; only the final guarded update marks it processed.
    diagnosticStage = "d1_batch_operation";
    diagnosticOperation = "batch_transaction";
    const results = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO webhook_events (event_key, provider_event_id, event_type, session_id, payment_id, status) " +
          "SELECT ?, ?, ?, session_id, ?, 'received' FROM checkout_sessions " +
          "WHERE session_id = ? AND reference_number = ? AND expected_amount = ? AND currency = ? AND livemode = 0 AND status IN ('pending', 'paid') " +
          "ON CONFLICT(event_key) DO NOTHING",
      ).bind(
        eventKey,
        event.providerEventId,
        event.type,
        payment.id,
        session.id,
        storedSession.reference_number,
        150000,
        "PHP",
      ),
      env.DB.prepare(
        "INSERT INTO payments (payment_id, session_id, amount, currency, livemode, status) " +
          "SELECT ?, c.session_id, ?, ?, 0, 'paid' FROM checkout_sessions c JOIN webhook_events e ON e.session_id = c.session_id " +
          "WHERE c.session_id = ? AND c.reference_number = ? AND c.expected_amount = ? AND c.currency = ? AND c.livemode = 0 AND c.status IN ('pending', 'paid') " +
          "AND e.event_key = ? AND e.provider_event_id IS ? AND e.event_type = ? AND e.payment_id = ? AND e.status IN ('received', 'processed') " +
          "ON CONFLICT(payment_id) DO UPDATE SET status = 'paid', " +
          "verified_at = CASE WHEN payments.status = 'paid' THEN payments.verified_at ELSE excluded.verified_at END " +
          "WHERE payments.session_id = excluded.session_id AND payments.amount = excluded.amount " +
          "AND payments.currency = excluded.currency AND payments.livemode = 0 AND payments.status IN ('pending', 'failed', 'paid')",
      ).bind(
        payment.id,
        150000,
        "PHP",
        session.id,
        storedSession.reference_number,
        150000,
        "PHP",
        eventKey,
        event.providerEventId,
        event.type,
        payment.id,
      ),
      env.DB.prepare(
        "UPDATE checkout_sessions SET status = 'paid', paid_at = COALESCE(paid_at, datetime('now')), " +
          "updated_at = CASE WHEN status = 'paid' THEN updated_at ELSE datetime('now') END " +
          "WHERE session_id = ? AND reference_number = ? AND expected_amount = ? AND currency = ? AND livemode = 0 AND status IN ('pending', 'paid') " +
          "AND EXISTS (SELECT 1 FROM payments WHERE payment_id = ? AND session_id = checkout_sessions.session_id " +
          "AND amount = checkout_sessions.expected_amount AND currency = checkout_sessions.currency AND livemode = 0 AND status = 'paid') " +
          "AND EXISTS (SELECT 1 FROM webhook_events WHERE event_key = ? AND provider_event_id IS ? AND event_type = ? " +
          "AND session_id = checkout_sessions.session_id AND payment_id = ? AND status IN ('received', 'processed'))",
      ).bind(
        session.id,
        storedSession.reference_number,
        150000,
        "PHP",
        payment.id,
        eventKey,
        event.providerEventId,
        event.type,
        payment.id,
      ),
      env.DB.prepare(
        "UPDATE webhook_events SET status = 'processed', processed_at = COALESCE(processed_at, datetime('now')), last_error = NULL " +
          "WHERE event_key = ? AND provider_event_id IS ? AND event_type = ? AND session_id = ? AND payment_id = ? AND status IN ('received', 'processed') " +
          "AND EXISTS (SELECT 1 FROM checkout_sessions c JOIN payments p ON p.session_id = c.session_id " +
          "WHERE c.session_id = webhook_events.session_id AND c.reference_number = ? AND c.expected_amount = ? AND c.currency = ? AND c.livemode = 0 AND c.status = 'paid' " +
          "AND p.payment_id = webhook_events.payment_id AND p.amount = c.expected_amount AND p.currency = c.currency AND p.livemode = 0 AND p.status = 'paid')",
      ).bind(
        eventKey,
        event.providerEventId,
        event.type,
        session.id,
        payment.id,
        storedSession.reference_number,
        150000,
        "PHP",
      ),
      env.DB.prepare(
        "SELECT e.event_key FROM webhook_events e JOIN checkout_sessions c ON c.session_id = e.session_id " +
          "JOIN payments p ON p.payment_id = e.payment_id AND p.session_id = c.session_id " +
          "WHERE e.event_key = ? AND e.provider_event_id IS ? AND e.event_type = ? AND e.session_id = ? AND e.payment_id = ? AND e.status = 'processed' " +
          "AND c.reference_number = ? AND c.expected_amount = ? AND c.currency = ? AND c.livemode = 0 AND c.status = 'paid' " +
          "AND p.amount = c.expected_amount AND p.currency = c.currency AND p.livemode = 0 AND p.status = 'paid'",
      ).bind(
        eventKey,
        event.providerEventId,
        event.type,
        session.id,
        payment.id,
        storedSession.reference_number,
        150000,
        "PHP",
      ),
    ]);
    diagnosticStage = "d1_final_verification";
    diagnosticOperation = "verify_batch_results";
    if (
      !Array.isArray(results) ||
      results.length !== 5 ||
      results.some((result) => result?.success !== true) ||
      results[4].results?.length !== 1
    ) {
      const batchSucceeded = Array.isArray(results) && results.length === 5 &&
        results.every((result) => result?.success === true);
      warnWebhook503(
        batchSucceeded ? "d1_final_verification" : "d1_batch_operation",
        batchSucceeded ? "missing_verified_record" : "invalid_batch_result",
      );
      return webhookReply({ error: "Unable to record verified payment" }, 503);
    }
    return webhookReply({ status: "processed" }, 200);
  } catch {
    // Only the fixed stage and operation labels are logged, never the exception.
    warnWebhook503(diagnosticStage, diagnosticOperation);
    return webhookReply({ error: "Unable to record verified payment" }, 503);
  }
}
