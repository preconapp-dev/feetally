# FeeTally

Free seller-fee calculators for marketplaces, resale apps, payment processors, creator and gig platforms.
Static site: JSON fee data → `scripts/build.py` → `docs/` (served by GitHub Pages / Cloudflare Pages).

- Add or update a platform: see `data/SCHEMA.md`, then `node scripts/validate.js --all`.
- Build: `python3 scripts/build.py` (needs Python 3 + Jinja2 and Node).
- Smoke test: `python3 scripts/qa.py /tmp/qa` (needs Playwright + Chromium).
- Operations: `RUNBOOK.md`.
