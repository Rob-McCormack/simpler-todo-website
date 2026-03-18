# Simpler Todo Website

Website for [simplertodo.com](https://simplertodo.com).

Static landing page (HTML + Tailwind/DaisyUI). No build step.

## Deploy on Cloudflare Pages (simplertodo.com)

1. **Connect the repo**
   - [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
   - Select this repo and branch (e.g. `main`).

2. **Build settings** (static site, no build)
   - **Build command:** `exit 0`
   - **Build output directory:** leave empty (files are at repo root)
   - **Root directory:** leave empty

3. **Deploy**
   - Save and deploy. Pages will serve `index.html` from the root.

4. **Custom domain**
   - In the Pages project → **Custom domains** → **Set up a custom domain** → add `simplertodo.com` (and optionally `www.simplertodo.com`). Follow the DNS steps if the domain is on Cloudflare or elsewhere.

## Translation (i18n) later

The site is plain HTML + JS, so you can add translation later with any JS i18n library (e.g. [i18next](https://www.i18next.com/), [vanilla-i18n](https://github.com/nicksrandall/vanilla-i18n), or a small `data-i18n` script). No need to move to React for that.
