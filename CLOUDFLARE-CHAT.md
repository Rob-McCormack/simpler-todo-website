# Chat page + Claude on Cloudflare Pages

Official references:

- [Pages Functions overview](https://developers.cloudflare.com/pages/functions/)
- [Functions routing (`/functions` folder)](https://developers.cloudflare.com/pages/functions/routing/)
- [Wrangler config for Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Secrets for Pages](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables) (same place as “Variables and Secrets” in the dashboard)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)

## What this repo does

- `public/chat.html` — simple browser UI; it `POST`s JSON to `/api/chat`.
- `functions/api/chat.js` — Pages Function at `/api/chat`; it calls Anthropic with `ANTHROPIC_API_KEY`.

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
   - Or `GET https://YOUR_DOMAIN/api/chat` → should return JSON `{"ok":true}`

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

1. **GET** `https://YOUR_DOMAIN/api/chat` in the browser — you should see JSON `{"ok":true,...}`.
   - If **GET is also 502**, the **Function** isn’t running or the **build output** is wrong (e.g. build output directory must be **`public`**).
2. **POST** returns **JSON** errors from our Worker (e.g. missing key, bad model) — if you still get **HTML** 502, **Workers & Pages** → your project → **Logs** / **Real-time logs** while submitting the form.
3. Confirm **`ANTHROPIC_API_KEY`** is on the **Pages** project (**Variables and Secrets** → **Production**), then **redeploy** after saving.
