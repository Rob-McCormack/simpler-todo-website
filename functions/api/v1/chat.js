/**
 * /api/v1/chat
 *
 * Browser POST often returns Cloudflare HTML 502 while curl POST works — Bot Fight / WAF treats
 * browser POSTs differently. The page uses GET ?message=… (same logic as POST; URLs can appear
 * in logs — prefer POST from curl/scripts, or relax Bots in Cloudflare for /api/*).
 */

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";
const UPSTREAM_MS = 45_000;
const MAX_MESSAGE = 2000;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      pragma: "no-cache",
      ...CORS_HEADERS,
    },
  });
}

function parseMessageFromBody(request, rawBody) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    return (params.get("message") || "").trim();
  }
  try {
    const body = rawBody ? JSON.parse(rawBody) : {};
    return typeof body.message === "string" ? body.message.trim() : "";
  } catch {
    return null;
  }
}

async function completeChat(env, message) {
  const key = typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
  if (!key) {
    return json(
      {
        error:
          "ANTHROPIC_API_KEY is not set (Pages → Settings → Variables and Secrets → Production).",
      },
      503,
    );
  }

  const trimmed = (message || "").trim();
  if (!trimmed) {
    return json({ error: "Missing message." }, 400);
  }
  if (trimmed.length > MAX_MESSAGE) {
    return json({ error: `Message too long (max ${MAX_MESSAGE} characters).` }, 400);
  }

  const model = (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.trim()) || DEFAULT_MODEL;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), UPSTREAM_MS);

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: "You are a helpful assistant for SimplerToDo. Be brief.",
        messages: [{ role: "user", content: trimmed }],
      }),
    });
  } catch (e) {
    clearTimeout(tid);
    const aborted = e && (e.name === "AbortError" || e.name === "TimeoutError");
    console.error("chat upstream fetch", e);
    return json(
      { error: aborted ? "Claude API took too long. Try again." : "Could not reach Claude API." },
      502,
    );
  }
  clearTimeout(tid);

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Claude returned non-JSON (check API key and model)." }, 502);
  }

  if (!res.ok) {
    return json({ error: data.error?.message || `Claude API HTTP ${res.status}` }, 502);
  }

  let text = "";
  for (const block of data.content || []) {
    if (block.type === "text" && block.text) text += block.text;
  }
  return json({ answer: text.trim() || "(empty)" });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "access-control-max-age": "86400",
      },
    });
  }

  const url = new URL(request.url);

  if (request.method === "GET") {
    const msg = (url.searchParams.get("message") || "").trim();
    if (msg) {
      try {
        return await completeChat(env, msg);
      } catch (e) {
        console.error("chat GET", e);
        return json({ error: "Unexpected server error." }, 500);
      }
    }
    return json({ ok: true, route: "/api/v1/chat", hint: "Add ?message=… for chat (browser-friendly)." });
  }

  if (request.method !== "POST") {
    return json({ error: "Use GET ?message=… or POST." }, 405);
  }

  try {
    if (url.searchParams.get("__health") === "1") {
      return json({ ok: true, ping: "post-without-upstream" });
    }

    const rawBody = await request.text();
    const message = parseMessageFromBody(request, rawBody);
    if (message === null) {
      return json({ error: "Invalid body (form message=… or JSON {message})." }, 400);
    }

    return await completeChat(env, message);
  } catch (e) {
    console.error("chat POST", e);
    return json({ error: "Unexpected server error." }, 500);
  }
}
