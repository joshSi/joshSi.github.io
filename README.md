# joshsi.com

Personal portfolio and tools site. Static HTML + [HTMX](https://htmx.org/) — no build step, no Node.js, no framework dependencies.

## Structure

```
index.html        — Homepage / portfolio
memorize.html     — Memorization practice tool (passages saved in the browser; short share links via memorize.joshsi.com)
groups.html       — Group Maker (balanced groups, backed by groups.joshsi.com)
404.html          — Custom 404 page
css/style.css     — Design system
js/memorize.js    — Memorization tool logic (localStorage sessions; short links from the memorize-api service, long self-contained links as fallback)
js/groups.js      — Group Maker client (talks to the balanced_groups API)
assets/           — Images & favicon
htmx_quiz_app.html — HTMX real-time quiz app
robots.txt        — Crawler policy + sitemap pointer
sitemap.xml       — Sitemap for the static pages
CNAME             — Custom domain config
```

## Local Development

Serve with any static file server:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Deployment

Deployed via Cloudflare Pages. Push to `master` and it's live at [joshsi.com](https://joshsi.com).
