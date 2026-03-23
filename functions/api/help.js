/**
 * POST /api/help — Claude proxy with KV rate limit (5/day per IP, UTC).
 * Env: ANTHROPIC_API_KEY (required) — Pages encrypted secret or wrangler pages secret.
 * Optional: ANTHROPIC_MODEL, HELP_RATE_LIMIT (KV). Without KV, rate limiting is skipped (Anthropic spend cap still applies).
 */

const MAX_PER_DAY = 5;
const MAX_MESSAGE_LEN = 2000;
const KV_TTL_SECONDS = 172800; // 2 days — auto-expire old daily keys

const HELP_DOCS = `
SimplerToDo — official help (for support answers only)

What it is
- SimplerToDo is a free, open-source, keyboard-friendly to-do app with five sections (Today, Next, Waiting, Someday, Done), tags, and reports.
- The web app is at https://app.simplertodo.com/ — marketing site at https://simplertodo.com/

Data & privacy
- Your tasks stay on your device only. There is no account, no server sync, and SimplerToDo does not collect or store your task data on company servers.
- You can export your data anytime from the app.

Export
- Supported export formats include plain text, rich text, Markdown, and JSON (as described on the website).

Features (high level)
- Sections to organize work; tags for filtering; fast search and reports; keyboard shortcuts for power users.

Open source
- The project is open source; details and links are on the marketing site and GitHub as referenced there.

Support
- For questions not covered here: simplertasks@gmail.com
`.trim();

const SYSTEM_PROMPT = `You are the official SimplerToDo help assistant.

Rules:
- Answer ONLY using the documentation below. If the documentation does not contain the answer, say you are not sure and tell the user to email simplertasks@gmail.com for help.
- Reply in plain text only. Do not use markdown, headings, bullet symbols, numbered lists with markdown syntax, code blocks, or asterisks for emphasis.
- Keep answers short and friendly.

Documentation:
${HELP_DOCS}`;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getClientIp(request) {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function rateLimitKey(ip, date) {
  return `help:${ip}:${date}`;
}

/**
 * Pages "Variables and Secrets" → string on env.
 * Secrets Store → binding with same name; value via await binding.get()
 * @see https://developers.cloudflare.com/secrets-store/integrations/workers/
 */
async function resolveAnthropicApiKey(env) {
  const v = env.ANTHROPIC_API_KEY;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v.get === "function") {
    try {
      const s = await v.get();
      return typeof s === "string" ? s.trim() : "";
    } catch (e) {
      console.error("help api: ANTHROPIC_API_KEY.get() failed", e);
      return "";
    }
  }
  return "";
}

async function handlePost(context) {
  const { request, env } = context;

  const apiKey = await resolveAnthropicApiKey(env);
  if (!apiKey) {
    // Dashboard: Pages project → Settings → Variables and Secrets → Production (not only Build).
    // Redeploy after adding. Real-time logs show binding names (not values) to verify env is wired.
    console.error(
      "help api: ANTHROPIC_API_KEY missing or empty. env keys:",
      env && typeof env === "object" ? Object.keys(env).join(", ") : "(no env)",
    );
    return jsonResponse({ error: "Help assistant is not configured." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return jsonResponse({ error: "Missing message." }, 400);
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return jsonResponse({ error: `Message too long (max ${MAX_MESSAGE_LEN} characters).` }, 400);
  }

  let kv = env.HELP_RATE_LIMIT;
  let count = 0;
  let rateLimitKeyStr = "";
  if (kv) {
    try {
      const ip = getClientIp(request);
      const date = utcDateKey();
      rateLimitKeyStr = rateLimitKey(ip, date);
      const rawCount = await kv.get(rateLimitKeyStr);
      count = parseInt(rawCount || "0", 10);
      if (Number.isNaN(count) || count < 0) count = 0;
      if (count >= MAX_PER_DAY) {
        return jsonResponse(
          {
            error: "Daily question limit reached. Try again tomorrow (UTC) or use the FAQ and email below.",
            remaining: 0,
          },
          429,
        );
      }
    } catch (e) {
      console.error("help api: KV read failed; continuing without rate limit", e);
      kv = null;
    }
  } else {
    console.warn(
      "help api: HELP_RATE_LIMIT KV not bound — rate limiting disabled. Add KV in wrangler.toml (see repo comment).",
    );
  }

  // Default: widely available Haiku. Override with ANTHROPIC_MODEL env (e.g. claude-haiku-4-5).
  const model = env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

  let anthropicRes;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: message }],
      }),
    });
  } catch (e) {
    console.error("help api: Anthropic fetch failed", e);
    return jsonResponse({ error: "Could not reach assistant. Try again." }, 502);
  }

  const anthropicText = await anthropicRes.text();
  let anthropicJson;
  try {
    anthropicJson = JSON.parse(anthropicText);
  } catch {
    return jsonResponse(
      { error: "The help assistant returned an invalid response. Please try again or email simplertasks@gmail.com." },
      502,
    );
  }

  if (!anthropicRes.ok) {
    const errMsg =
      anthropicJson.error?.message ||
      anthropicJson.message ||
      `Assistant error (${anthropicRes.status}).`;
    return jsonResponse(
      {
        error: errMsg,
      },
      502,
    );
  }

  const blocks = anthropicJson.content || [];
  let answer = "";
  for (const block of blocks) {
    if (block.type === "text" && block.text) {
      answer += block.text;
    }
  }
  answer = answer.trim();
  if (!answer) {
    return jsonResponse({ error: "Empty reply from assistant. Please try again." }, 502);
  }

  if (kv) {
    try {
      const next = count + 1;
      await kv.put(rateLimitKeyStr, String(next), { expirationTtl: KV_TTL_SECONDS });
      return jsonResponse({
        answer,
        remaining: Math.max(0, MAX_PER_DAY - next),
      });
    } catch (e) {
      console.error("help api: KV write failed; returning answer without updating count", e);
    }
  }

  return jsonResponse({
    answer,
    remaining: null,
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "GET") {
    return jsonResponse({ ok: true, path: "/api/help" }, 200);
  }
  if (request.method === "POST") {
    try {
      return await handlePost(context);
    } catch (e) {
      console.error("help api: unhandled error", e);
      return jsonResponse(
        {
          error:
            "Something went wrong. Please try again or email simplertasks@gmail.com.",
        },
        500,
      );
    }
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
      },
    });
  }
  return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
}
