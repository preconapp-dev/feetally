# Brief for fee-data researchers

You are producing platform fee files for FeeTally, a free fee-calculator website for US sellers. Today is 2026-09-29.

## Deliverable
For each platform assigned to you, write `data/platforms/<slug>.json` following `schema/PLATFORM_SCHEMA.md` exactly, then run
`node scripts/validate.js data/platforms/<slug>.json` and fix every error until it prints PASS (warnings are fine but fix the easy ones).
Never edit `engine/`, `scripts/`, or `schema/`. Never write anything outside `data/platforms/`.

## Research rules
1. Fees must come from the platform's OFFICIAL fee/pricing/help pages. Fetch them directly with WebFetch (guess the URL from the domain: /fees, /pricing, /help/selling/fees, seller help center). Use WebSearch only to locate the official page or to confirm a 2025–2026 change. Prefer 2026 pages; note "as of <month year>" in notes when the page states it.
2. If an official page cannot be fetched, use ONE reputable secondary source (the platform's own blog, a major seller-tools site) and set `verification: "mixed"` with a caveat naming what is unverified. Never invent a number. If a platform's fees truly cannot be established, skip it and say so in your final report.
3. Model the US fee structure for a typical individual/small-business seller. Category-specific rates: model the most common categories as a `select` (≤ 12 options) with `pct_by`; mention in `caveats` that other categories differ. Optional programs (promoted listings, ads, offsite ads) become inputs defaulting to 0/off.
4. Percent fields are percentages (13.6 means 13.6%). Money is USD. Round nothing in the data; the engine rounds display values.
5. The worked example is computed BY HAND from the official schedule; the validator runs it through the engine and must match to the cent. If it fails, your fee model is wrong (or your arithmetic) — fix the model, do not fudge the expected numbers.
6. `related`: use only slugs from the master list below (they will exist).

## Writing rules (the page copy)
- US spelling, present tense, 2026. Specific numbers. No hype, no "in today's fast-paced world", no filler sentences.
- `intro`: 2–3 paragraphs (120–220 words): what the platform is and who sells there; the shape of the fee stack; anything notable that changed in 2025–2026.
- `how_fees_work`: 3–8 items, one fee rule each, with the exact rate and what it applies to (e.g. whether shipping and sales tax are included in the fee basis, when it is charged, minimums).
- `tips`: 3–6 concrete, platform-specific ways to keep more of the sale.
- `faq`: 4–8 questions sellers actually search (fees on shipping? when is the fee taken? monthly fee? international? refunds? taxes/1099-K?) — answer directly in the first sentence.
- `caveats`: 0–4 short warnings shown under the calculator.
- `changelog`: any official fee changes dated 2024–2026 you can cite, newest first (optional).

## Master slug list (for `related`)
marketplaces: ebay, amazon, walmart-marketplace, etsy, tiktok-shop, facebook-marketplace, shopify, mercari, offerup, bonanza, reverb, discogs
resale apps: poshmark, depop, grailed, vinted, stockx, goat, whatnot, vestiaire-collective, thredup, tcgplayer, chairish, ruby-lane
payment processors: stripe, paypal, square, venmo, cash-app, braintree, authorize-net, clover, toast, amazon-pay, zettle, sumup
creator & freelance: gumroad, patreon, substack, ko-fi, buy-me-a-coffee, fiverr, upwork, twitch, youtube, kick, amazon-kdp, bandcamp
gig, hosting, events, crowdfunding: airbnb, vrbo, turo, rover, taskrabbit, doordash, uber-eats, eventbrite, kickstarter, gofundme, indiegogo

## page_type
`fee-calculator` for anything where the seller sets a price and the platform deducts fees.
`payout-calculator` for revenue-share models where the platform collects the money and pays a share (youtube, twitch, kick, amazon-kdp, turo, airbnb host payout, rover, doordash/uber-eats merchant payout). The engine is the same; only wording differs. For these, the `price` input is the gross amount (e.g. "Gross ad revenue", "Trip price", "Order subtotal") and fees are the platform's share.

## Final report (keep it short)
List each slug with PASS/skipped, the official URLs used, anything you could not verify, and any modelling compromise (e.g. "category select covers 8 of eBay's ~30 category rates").
