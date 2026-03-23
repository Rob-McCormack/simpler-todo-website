/**
 * Shared handler for /api/v1/chat and /api/v1/c (alias — some WAF rules match "chat" in the path).
 */

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";
const UPSTREAM_MS = 45_000;
const MAX_MESSAGE = 2000;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-chat-b",
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

function decodeB64Url(b64url) {
  if (!b64url || typeof b64url !== "string") return null;
  try {
    const pad = (4 - (b64url.length % 4)) % 4;
    const std = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const bin = atob(std);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function parseMessageFromBody(request, rawBody) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/plain")) {
    return (rawBody || "").trim();
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const b = (params.get("b") || "").trim();
    if (b) {
      const d = decodeB64Url(b);
      return d === null ? null : d.trim();
    }
    return (params.get("message") || params.get("m") || params.get("q") || params.get("t") || "").trim();
  }
  try {
    const body = rawBody ? JSON.parse(rawBody) : {};
    if (typeof body.b === "string" && body.b.trim()) {
      const d = decodeB64Url(body.b.trim());
      return d === null ? null : d.trim();
    }
    if (typeof body.message === "string") return body.message.trim();
    if (typeof body.m === "string") return body.m.trim();
    if (typeof body.q === "string") return body.q.trim();
    if (typeof body.t === "string") return body.t.trim();
    return "";
  } catch {
    return null;
  }
}

async function completeChat(env, message) {
  try {
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

    let raw;
    try {
      raw = await res.text();
    } catch (e) {
      console.error("chat res.text", e);
      return json({ error: "Bad response from Claude." }, 502);
    }

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
    console.error("completeChat", e);
    return json({ error: "Unexpected server error." }, 500);
  }
}

function messageFromB64Param(b, label) {
  const decoded = decodeB64Url(b);
  if (decoded === null) {
    return { error: json({ error: `Invalid ${label} (base64url UTF-8).` }, 400) };
  }
  const msg = decoded.trim();
  if (!msg) {
    return { error: json({ error: "Empty message." }, 400) };
  }
  return { message: msg };
}

function messageFromGet(url, request) {
  const headerB = (request.headers.get("x-chat-b") || "").trim();
  if (headerB) {
    return messageFromB64Param(headerB, "X-Chat-B");
  }
  if (url.searchParams.has("b")) {
    const b = url.searchParams.get("b") ?? "";
    return messageFromB64Param(b, "b");
  }
  const plain = (url.searchParams.get("t") || url.searchParams.get("message") || "").trim();
  return { message: plain };
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
    const parsed = messageFromGet(url, request);
    if (parsed.error) return parsed.error;
    if (parsed.message) {
      try {
        return await completeChat(env, parsed.message);
      } catch (e) {
        console.error("chat GET", e);
        return json({ error: "Unexpected server error." }, 500);
      }
    }
    return json({
      ok: true,
      route: url.pathname,
      hint:
        "If the browser gets HTML 502, Cloudflare blocked the request before the Worker. Try POST JSON {b}, POST text/plain, GET + X-Chat-B, or a WAF skip for this path. /api/v1/c is an alias of this handler.",
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Use GET (hint) or POST." }, 405);
  }

  try {
    if (url.searchParams.get("__health") === "1") {
      return json({ ok: true, ping: "post-without-upstream" });
    }

    const rawBody = await request.text();
    const message = parseMessageFromBody(request, rawBody);
    if (message === null) {
      return json(
        { error: "Invalid body (JSON {b|message|m|q|t}, text/plain, or form)." },
        400,
      );
    }
    if (!message.trim()) {
      return json({ error: "Missing message." }, 400);
    }

    return await completeChat(env, message);
  } catch (e) {
    console.error("chat POST", e);
    return json({ error: "Unexpected server error." }, 500);
  }
}
