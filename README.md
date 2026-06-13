# joshsi.com

Personal portfolio and tools site. Static HTML + [HTMX](https://htmx.org/) — no build step, no Node.js, no framework dependencies.

## Structure

```
index.html        — Homepage / portfolio
memorize.html     — Memorization practice tool
404.html          — Custom 404 page
css/style.css     — Design system
js/memorize.js    — Memorization tool logic
assets/           — Images & favicon
htmx_quiz_app.html — HTMX real-time quiz app
CNAME             — Custom domain config
```

## Local Development

Serve with any static file server:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Deployment

Deployed via GitHub Pages. Push to `main` and it's live at [joshsi.com](https://joshsi.com).
