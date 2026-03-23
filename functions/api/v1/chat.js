/**
 * /api/v1/chat — POST with form body (preferred) or JSON.
 * GET works = Worker is deployed; if only POST returns HTML 502, try form encoding + CORS below.
 */

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";
const UPSTREAM_MS = 45_000;

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
      "cache-control": "no-store",
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

  if (request.method === "GET") {
    return json({ ok: true, route: "/api/v1/chat" });
  }

  if (request.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  try {
    const url = new URL(request.url);
    if (url.searchParams.get("__health") === "1") {
      return json({ ok: true, ping: "post-without-upstream" });
    }

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

    const rawBody = await request.text();
    const message = parseMessageFromBody(request, rawBody);
    if (message === null) {
      return json({ error: "Invalid body (use form field message=… or JSON {message})." }, 400);
    }
    if (!message) {
      return json({ error: "Missing message." }, 400);
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
          messages: [{ role: "user", content: message }],
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
  } catch (e) {
    console.error("chat onRequest", e);
    return json({ error: "Unexpected server error." }, 500);
  }
}
