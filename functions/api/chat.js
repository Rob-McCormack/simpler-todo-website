/**
 * POST /api/chat — minimal Claude proxy.
 * Env: ANTHROPIC_API_KEY (Pages secret, plain string).
 * Optional: ANTHROPIC_MODEL
 */

const MODEL = "claude-3-5-haiku-20241022";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestGet() {
  return json({ ok: true });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const key = typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
    if (!key) {
      return json({ error: "ANTHROPIC_API_KEY is not set on this Pages project." }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "Missing message." }, 400);
    }

    const model = env.ANTHROPIC_MODEL || MODEL;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "Assistant returned non-JSON." }, 502);
    }

    if (!res.ok) {
      return json({ error: data.error?.message || `Anthropic error (${res.status})` }, 502);
    }

    let text = "";
    for (const block of data.content || []) {
      if (block.type === "text" && block.text) text += block.text;
    }
    return json({ answer: text.trim() || "(empty)" });
  } catch (e) {
    console.error("chat api", e);
    return json({ error: "Server error." }, 500);
  }
}
