# FeeTally operations runbook

FeeTally is a static site. Everything the site shows is generated from JSON files in `data/platforms/`
by `scripts/build.py` into `docs/`, which is what GitHub Pages (or Cloudflare Pages) serves.
No server, no database, no build step on the host: **commit `docs/` and it is live.**

## Layout

```
data/site.json            site name, URL, contact email, AdSense/GA IDs, hub definitions
data/platforms/*.json     one file per platform (fees, inputs, content, sources) — the product
data/SCHEMA.md            the file format and engine semantics; read before adding a platform
data/queue.json           platforms to add next, with notes on why some were skipped
src/calc.js               the calculator engine (browser + Node)
scripts/validate.js       node scripts/validate.js --all   (schema + worked-example check)
scripts/build.py          python3 scripts/build.py         (renders docs/)
scripts/qa.py             python3 scripts/qa.py <dir>      (headless browser smoke test + screenshots)
scripts/tools_content.py  copy and code for the general calculators
templates/, assets/       Jinja templates, CSS, UI JS
content/                  about / privacy / terms fragments
docs/                     BUILD OUTPUT — committed, served as the site
```

## The daily run (scheduled, no human needed)

Goal: keep every rate current, add 1–3 platforms a day from the queue, keep the build green.

1. `git pull`, then `node scripts/validate.js --all`. If anything fails, fix the data file first.
2. **Re-verify rates due for a check.** Pick the 3–5 platforms with the oldest `last_verified`.
   For each, fetch the official pages in its `sources` and compare with `fees`. If a rate changed:
   update the rule, the `content` prose that quotes it, add a `changelog` entry with the official date,
   set `last_verified` to today, and update `sources[].accessed`. If nothing changed, bump
   `last_verified` and `accessed` only. Never change a rate without an official page for it.
3. **Add platforms from `data/queue.json`** (1–3 per day, not more — paced publishing indexes better).
   Follow `data/SCHEMA.md`, write to `data/platforms/<slug>.json`, run the validator until PASS,
   and remove the entry from the queue. Add the new slug to `related` on 2–3 similar platforms.
4. `python3 scripts/build.py`, then `python3 scripts/qa.py /tmp/qa` and confirm `PROBLEMS: none`.
5. Commit everything including `docs/` with a message like `daily: verify ebay, etsy; add cash-app`,
   and push to `main`. Deploy is automatic.
6. Append one line to `LOG.md`: date, what was verified, what was added, anything odd.

Rules of thumb: quality over count; a platform with unverifiable fees is skipped and noted in the
queue, not guessed. Keep taglines ≤ 110 characters. Don't create near-duplicate pages (no
"X profit calculator" alongside "X fee calculator").

## Weekly (needs the owner's computer, ~30 min)

Open Google Search Console, GA4 and AdSense in the saved browser session and record:
indexed pages, top queries, clicks, RPM, and any Policy Center notices. Fix policy notices first.
Note the numbers in `LOG.md`. When the site clears 1,000 sessions/30 days, apply to Mediavine Journey.

## One-time owner setup (in order)

1. GitHub: create repo, push this folder, Settings → Pages → Deploy from branch → `main` / `/docs`.
   The site is live at `https://<user>.github.io/<repo>/` within a minute.
2. Domain: buy it, then either (a) Cloudflare Pages: connect the repo, build command empty,
   output dir `docs`, add the custom domain; or (b) GitHub Pages: add the domain under Settings → Pages
   and set `"cname"` in `data/site.json` so `docs/CNAME` is generated.
3. Set `"url"` in `data/site.json` to the final `https://domain` (canonicals + sitemap use it), rebuild, push.
4. Email: set up forwarding for `contact_email` (Cloudflare Email Routing is free).
5. Google Search Console: add the property, submit `https://domain/sitemap.xml`.
6. GA4: create a property, put the measurement ID in `"ga4_id"`, rebuild, push.
7. AdSense (after ~50 pages are live and indexed): apply, then put the publisher ID (`pub-…`) in
   `"adsense_client"`, rebuild, push. `ads.txt` and the ad slots are generated automatically.
   In AdSense → Privacy & messaging, turn on the EU/UK consent message (free).
8. Save the Google logins in the desktop browser for the weekly pass.

## Deploy notes

- GitHub Pages serves `docs/` from `main`. Relative links are used everywhere, so the site works at
  a sub-path (`user.github.io/repo/`) and at the root of a custom domain without changes.
- Canonical URLs and the sitemap use `site.url`; until the domain is set they point at the placeholder,
  which is fine for a preview but must be fixed before submitting the sitemap to Google.
- `docs/` is deleted and rebuilt on every build; never hand-edit files in it.
