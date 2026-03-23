/**
 * /api/chat — POST JSON { message } → { answer } or { error }.
 * Env: ANTHROPIC_API_KEY (Pages → Variables and Secrets → Production, encrypted).
 * Optional: ANTHROPIC_MODEL
 */

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") {
    return json({ ok: true, route: "/api/chat" });
  }

  if (request.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  try {
    const key = typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
    if (!key) {
      return json(
        {
          error:
            "ANTHROPIC_API_KEY is not set. In Cloudflare: Pages project → Settings → Variables and Secrets → Production → add encrypted secret with that exact name.",
        },
        503,
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "Missing message." }, 400);
    }

    const model = (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.trim()) || DEFAULT_MODEL;

    const fetchOpts = {
      method: "POST",
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
    };

    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      fetchOpts.signal = AbortSignal.timeout(60_000);
    }

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", fetchOpts);
    } catch (e) {
      console.error("chat fetch", e);
      const msg =
        e && (e.name === "TimeoutError" || e.name === "AbortError")
          ? "Request to Claude timed out."
          : "Could not reach Claude API.";
      return json({ error: msg }, 502);
    }

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "Claude returned non-JSON (check model name and API key)." }, 502);
    }

    if (!res.ok) {
      return json(
        {
          error: data.error?.message || `Claude API HTTP ${res.status}`,
        },
        502,
      );
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
