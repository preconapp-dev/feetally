# Platform fee file schema (v1)

One JSON file per platform at `data/platforms/<slug>.json`. The file drives a live
calculator page AND the written content of that page. Every number must come from
the platform's official fee/pricing page (or help center) unless marked otherwise.

Validate with: `node scripts/validate.js data/platforms/<slug>.json`
(exit code 0 = pass; the validator also runs your worked example through the real engine).

## Top level

| field | type | required | notes |
|---|---|---|---|
| `schema_version` | number | yes | always `1` |
| `slug` | string | yes | lowercase, hyphens, must equal filename stem, e.g. `ebay`, `amazon-pay` |
| `name` | string | yes | display name, e.g. `eBay` |
| `category` | string | yes | one of `marketplace`, `resale-app`, `payment-processor`, `creator-platform`, `freelance`, `gig`, `hosting`, `crowdfunding`, `events` |
| `page_type` | string | yes | `fee-calculator` (default for most) or `payout-calculator` (royalty/share models like YouTube, Twitch, KDP, Turo) |
| `region` | string | yes | `United States` unless the platform is global-only |
| `currency` | string | yes | `USD` |
| `last_verified` | string | yes | ISO date you checked the official page, e.g. `2026-09-29` |
| `fee_summary` | string | yes | ≤ 60 words, plain English, the whole fee stack in one breath |
| `seo` | object | yes | `{ "title": ≤ 60 chars (omit to auto-generate), "description": 120–155 chars }` |
| `sources` | array | yes | 1–6 items `{ "title", "url" (https, official domain preferred), "accessed": ISO date }` |
| `verification` | string | yes | `official` if every fee came from the platform's own pages; `mixed` if any fee came from a secondary source (then say which in `caveats`) |
| `caveats` | array of strings | no | short warnings shown under the calculator ("Category-specific rates apply to …", "Fees differ outside the US") |
| `inputs` | array | yes | see Inputs |
| `fees` | array | yes | see Fees (≥ 1 seller-paid fee) |
| `worked_example` | object | yes | see Worked example |
| `content` | object | yes | see Content |
| `related` | array of slugs | yes | 2–4 other platforms a reader would compare with |
| `changelog` | array | no | `{ "date": ISO, "change": "…" }` recent official fee changes, newest first |

## Inputs

Each input renders as a field in the calculator. Order matters (top to bottom).

```json
{ "id": "sale_price", "role": "price", "label": "Sale price", "type": "money", "default": 50, "help": "What the buyer pays for the item, before shipping and tax." }
```

| field | notes |
|---|---|
| `id` | unique in file, snake_case |
| `role` | `price` (required, exactly one), `shipping_charged`, `item_cost`, `shipping_cost`, `orders_per_month`, `other` |
| `type` | `money`, `percent`, `number`, `select`, `toggle` |
| `label`, `help` | short; `help` is one sentence |
| `default` | number for money/percent/number, option `id` for select, `true/false` for toggle |
| `options` | select only: `[ { "id": "most", "label": "Most categories", "note": "13.6% + $0.30" } ]` (≤ 12 options) |
| `min`, `max`, `step` | optional numeric bounds |
| `show_if` | optional `{ "input": "<id>", "equals": <value> }` or `{ "input": "<id>", "in": [ … ] }` |

Standard ids/roles to reuse when they apply: `sale_price` (price), `shipping_charged`,
`item_cost`, `shipping_cost`, `orders_per_month`. Only include `shipping_charged` if the
seller actually receives the shipping amount (eBay, Etsy: yes; Poshmark: no, the buyer pays
the label directly). For payment processors use `sale_price` with label "Transaction amount".

## Fees

Each fee is one line in the breakdown. Evaluated top to bottom, independently.

```json
{
  "id": "final_value_fee",
  "label": "Final value fee",
  "paid_by": "seller",
  "basis": "price_plus_shipping",
  "pct": 13.6,
  "fixed": 0.30,
  "pct_by": { "input": "category", "values": { "most": 13.6, "books": 15.3 } },
  "fixed_by": { "input": "plan", "values": { "none": 0.30, "basic": 0.30 } },
  "tiers": [ { "max": 14.99, "fixed": 2.95 }, { "min": 15, "pct": 20 } ],
  "per_unit": { "input": "file_size_mb", "rate": 0.15 },
  "min": null,
  "max": null,
  "when": { "input": "international", "equals": true },
  "monthly": false,
  "note": "13.6% of the total amount of the sale (item + shipping + sales tax) plus $0.30 per order, for most categories."
}
```

| field | notes |
|---|---|
| `id`, `label` | required; label is what the reader sees |
| `paid_by` | `seller` (default) or `buyer`. Buyer fees are informational and do not reduce payout |
| `basis` | `price` (item price only), `price_plus_shipping`, `input:<id>` (any money input), `fee:<id>` (amount of an earlier fee, e.g. a processing fee on a service fee) |
| `pct` | percent of basis, e.g. `13.6` means 13.6% |
| `fixed` | flat dollars per order |
| `pct_by` / `fixed_by` | choose pct/fixed from a select input's chosen option id; overrides `pct`/`fixed` when the option is present in `values` |
| `tiers` | array of `{ "min", "max", "pct", "fixed" }` matched on the basis amount (first match wins; `min` inclusive, `max` inclusive); overrides `pct`/`fixed` |
| `per_unit` | adds `rate × value of another number input` (e.g. KDP delivery fee per MB) |
| `min` / `max` | clamp the computed fee amount (e.g. minimum $0.80 fee) |
| `when` | only apply the fee when the condition holds: `{ "input", "equals" }`, `{ "input", "in": [...] }`, or `{ "input", "gt": n }` |
| `monthly` | `true` if this is a per-month fee (store subscription, plan fee). It is divided by the `orders_per_month` input to show a per-order share |
| `note` | one sentence citing the rule as the platform states it |

Keep fee ids stable and descriptive: `final_value_fee`, `payment_processing`, `listing_fee`, `transaction_fee`, `service_fee`, `commission`, `plan_fee`, `international_fee`, `currency_conversion`, `promoted_listing`, `delivery_fee`, `platform_share`.

Model rules literally. If the platform charges 3% + $0.25 payment processing on the total including shipping, that is one fee with `basis: "price_plus_shipping", pct: 3, fixed: 0.25`. If a fee only applies with an option, put the option in a `select`/`toggle` input and use `when` or `pct_by`.

## Worked example

Numbers you computed BY HAND from the official schedule. The validator runs the engine on
`inputs` and must reproduce `expected` to the cent, which is how we catch modelling errors.

```json
"worked_example": {
  "inputs": { "sale_price": 45, "item_cost": 15 },
  "expected": { "total_fees": 9.00, "net_payout": 36.00, "profit": 21.00 },
  "explanation": "A $45 sale is $15 or more, so Poshmark keeps 20% ($9.00). You receive $36.00; after your $15 cost, profit is $21.00."
}
```

`inputs` may omit inputs that keep their defaults. `expected` keys: `total_fees` (seller-paid, per order),
`net_payout` (subtotal received minus seller fees), `profit` (net payout minus item cost and shipping cost). Include at least `total_fees` and `net_payout`.

## Content

All prose is for the page. Write for a US seller who wants the number and a clear explanation. No hype, no filler, US spelling, 2026 present tense. Cite the fee as the platform states it. Do not invent fees. Do not mention competitors' fees except in `content.compare_note`.

```json
"content": {
  "intro": "2–3 paragraphs, 120–220 words total, separated by \n\n. What the platform is, who sells there, and the shape of its fee stack.",
  "how_fees_work": [ "3–8 items. Each item is 1–3 sentences that explain one fee line or rule, including the exact rate and what it applies to." ],
  "tips": [ "3–6 short, concrete ways to keep more of the sale on this platform (pricing, plan choice, shipping, avoiding optional fees)." ],
  "faq": [ { "q": "…?", "a": "1–3 sentences." } ],
  "compare_note": "Optional one or two sentences on when another platform in `related` would net more."
}
```

FAQ: 4–8 questions real sellers search for ("Does eBay charge fees on shipping?", "When does eBay take its fee?", "Is there a monthly fee?"). Answer each directly in the first sentence.

## Minimal complete example

```json
{
  "schema_version": 1,
  "slug": "poshmark",
  "name": "Poshmark",
  "category": "resale-app",
  "page_type": "fee-calculator",
  "region": "United States",
  "currency": "USD",
  "last_verified": "2026-09-29",
  "fee_summary": "Poshmark keeps a flat $2.95 on sales under $15 and 20% on sales of $15 or more. Buyers pay shipping directly, so it never passes through your payout.",
  "seo": { "description": "Free Poshmark fee calculator: enter your sale price and cost to see Poshmark's $2.95 or 20% fee, your net payout, and profit margin. Updated for 2026." },
  "sources": [ { "title": "Poshmark – Fee policy", "url": "https://poshmark.com/fee_policy", "accessed": "2026-09-29" } ],
  "verification": "official",
  "caveats": [],
  "inputs": [
    { "id": "sale_price", "role": "price", "label": "Sale price", "type": "money", "default": 45, "help": "The price the buyer pays for the item." },
    { "id": "item_cost", "role": "item_cost", "label": "Your cost", "type": "money", "default": 15, "help": "What you paid for the item, including any supplies." }
  ],
  "fees": [
    { "id": "commission", "label": "Poshmark fee", "paid_by": "seller", "basis": "price",
      "tiers": [ { "max": 14.99, "fixed": 2.95 }, { "min": 15, "pct": 20 } ],
      "note": "Flat $2.95 on sales under $15; 20% of the sale price on sales of $15 or more." }
  ],
  "worked_example": {
    "inputs": { "sale_price": 45, "item_cost": 15 },
    "expected": { "total_fees": 9.00, "net_payout": 36.00, "profit": 21.00 },
    "explanation": "A $45 sale is $15 or more, so Poshmark keeps 20% ($9.00). You receive $36.00; after your $15 cost, profit is $21.00."
  },
  "content": {
    "intro": "…", "how_fees_work": [ "…" ], "tips": [ "…" ], "faq": [ { "q": "…", "a": "…" } ]
  },
  "related": [ "mercari", "depop", "ebay" ]
}
```
