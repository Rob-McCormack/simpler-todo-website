# Chat page + Claude on Cloudflare Pages

Official references:

- [Pages Functions overview](https://developers.cloudflare.com/pages/functions/)
- [Functions routing (`/functions` folder)](https://developers.cloudflare.com/pages/functions/routing/)
- [Wrangler config for Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Secrets for Pages](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables) (same place as “Variables and Secrets” in the dashboard)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)

## What this repo does

- `public/chat.html` — `POST`s **`application/x-www-form-urlencoded`** (`message=…`) to `/api/v1/chat` (avoids some WAF rules that target JSON POST bodies).
- `functions/api/v1/chat.js` — Pages Function at `/api/v1/chat`; it calls Anthropic with `ANTHROPIC_API_KEY`.

(The path is `/api/v1/chat` instead of `/api/chat` so POST is less likely to be blocked by some WAF/bot rules that still allow GET on `/api/chat`.)

## What you do in Cloudflare (checklist)

1. **Connect the repo** to **Workers & Pages → Create → Pages** (if not already).
2. **Build settings**
   - Framework: **None** (or static).
   - **Build command:** leave empty *or* `exit 0` if the dashboard requires a command.
   - **Build output directory:** `public` (must match `pages_build_output_dir` in `wrangler.toml`).
3. **API key (required)**  
   **Workers & Pages** → your **Pages project** → **Settings** → **Variables and Secrets** → **Production** → **Add**:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from [Anthropic Console](https://console.anthropic.com/) → API keys  
   - Turn on **Encrypt** / treat as **Secret** if the UI offers it.
4. **Save** and **trigger a new deployment** (push a commit or **Retry deployment**).
5. **Test**
   - Open `https://YOUR_DOMAIN/chat.html`
   - Or `GET https://YOUR_DOMAIN/api/v1/chat` → should return JSON `{"ok":true,"route":"/api/v1/chat"}`

## Local preview (optional)

From the repo root:

```bash
npx wrangler pages dev public
```

Open the URL Wrangler prints; `/chat.html` and `/api/chat` work together. For local API calls you still need secrets (e.g. `.dev.vars` with `ANTHROPIC_API_KEY=...` next to `wrangler.toml` — do not commit that file).

## Optional: model override

In the same **Variables and Secrets** section you can add plain text:

- `ANTHROPIC_MODEL` — e.g. another Claude model id from Anthropic’s docs.

If unset, the Worker uses `claude-3-5-haiku-20241022`.

## If you see HTTP 502 (HTML error page)

1. **GET** `https://YOUR_DOMAIN/api/v1/chat` — JSON `{"ok":true,...}` means the Function is deployed.
2. If **GET works but POST returns HTML 502**, check **Security** → **Events** / **WAF** / **Bots** in the Cloudflare dashboard for blocks on `POST` to `/api/*`. Temporarily relax **Bot Fight Mode** or add a **WAF exception** for `/api/v1/chat` (or your whole zone’s API path) and test again.
3. **Workers & Pages** → your project → **Logs** while sending a chat message.
4. Confirm **`ANTHROPIC_API_KEY`** is on the **Pages** project → **Variables and Secrets** → **Production**, then **redeploy**.
