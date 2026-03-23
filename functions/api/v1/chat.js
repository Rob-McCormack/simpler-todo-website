/**
 * POST /api/v1/chat — JSON { message } → { answer } or { error }.
 * (Path avoids /api/chat which some Cloudflare WAF/bot rules treat differently than GET.)
 * Env: ANTHROPIC_API_KEY (Pages → Variables and Secrets → Production).
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
    return json({ ok: true, route: "/api/v1/chat" });
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
            "ANTHROPIC_API_KEY is not set on this Pages project (Variables and Secrets → Production).",
        },
        503,
      );
    }

    const rawBody = await request.text();
    let body;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "Missing message." }, 400);
    }

    const model = (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.trim()) || DEFAULT_MODEL;

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
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
      });
    } catch (e) {
      console.error("chat fetch", e);
      return json({ error: "Could not reach Claude API." }, 502);
    }

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
