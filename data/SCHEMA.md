# Platform fee file schema (v1)

One JSON file per platform at `data/platforms/<slug>.json`. Validate with:

```
node scripts/validate.js data/platforms/<slug>.json
```

The validator checks structure, runs the calculator engine on your `worked_example`, and compares
its output to your `expected` numbers. A file must PASS before it ships.

## Rules of accuracy

- Only state fees you read on an **official** page of the platform (help center, pricing page, seller
  policy). Put every page you used in `sources` with its URL and the date you read it.
- If a fee cannot be verified on an official page, leave it out and say so in `content.notes`.
- Percentages are plain numbers: `13.6` means 13.6%. Money is in the platform's currency (USD unless noted).
- `last_verified` is the date you checked the sources (YYYY-MM-DD).
- Compute `worked_example.expected` by hand from the official fee schedule. If the validator disagrees
  with you, re-check the arithmetic and the rule; fix whichever is wrong.

## Top-level fields

| field | type | required | notes |
|---|---|---|---|
| schema_version | 1 | yes | |
| slug | string | yes | lowercase, hyphens; equals the filename |
| name | string | yes | "eBay" |
| category | string | yes | one of: marketplace, resale-app, payment-processor, creator-platform, freelance, gig, hosting, crowdfunding, events, publishing |
| region | string | yes | "United States" (fees differ by country; US only unless noted) |
| currency | string | yes | "USD" |
| tagline | string | yes | ≤ 110 chars, used as meta description seed |
| fee_summary | string | yes | 1–2 sentences: the fee stack in plain words |
| last_verified | string | yes | YYYY-MM-DD |
| sources | array | yes | ≥1 of `{title, url (https), accessed (YYYY-MM-DD)}` |
| inputs | array | yes | see Inputs |
| fees | array | yes | see Fee rules; ≥1 |
| worked_example | object | yes | `{inputs: {...}, expected: {total_fees, net_payout, profit}, explanation}` |
| content | object | yes | see Content |
| related | array | no | slugs of 2–4 similar platforms |

## Inputs

Each input: `{id, label, type, role, default, help, options?, step?, min?}`

- `type`: `money` | `percent` | `number` | `select` | `toggle`
- `role` (required): `price` | `shipping_charged` | `cost` | `shipping_cost` | `orders_per_month` | `target_profit` | `other`
  - exactly one input has role `price` (the amount the fee is charged on: sale price, invoice amount, pledge, nightly rate…)
  - include `cost` (role) so the page can show profit; include `shipping_charged` and `shipping_cost` when shipping is part of the sale
  - include `target_profit` (money, default e.g. 20) so the page can show "price needed for $X profit"
  - `orders_per_month` (number) is required if any fee rule has `"monthly": true`
- `select` needs `options: [{id, label, note?}]` and `default` = an option id
- `toggle` default is true/false
- Keep inputs to what changes the fee. 3–7 inputs is typical.

## Fee rules

Each rule: `{id, label, paid_by?, basis, pct?, fixed?, tiers?, pct_by?, fixed_by?, pct_input?, per_unit?, min?, max?, when?, monthly?, note?}`

- `paid_by`: `seller` (default; reduces the seller's payout) or `buyer` (added on top of the price; shown for information)
- `basis`: what the percentage applies to
  - `price` – the role=price input only
  - `price_plus_shipping` – price + shipping charged to buyer
  - `input:<id>` – another money input
  - `none` – flat fees with no percentage
- `pct` and `fixed`: percentage of basis plus a fixed amount, e.g. `{"pct": 2.9, "fixed": 0.30}`
- `tiers`: pick the first tier whose `[min, max]` (inclusive) contains the basis amount; each tier has its own `pct`/`fixed`.
  Poshmark: `[{"max": 14.99, "fixed": 2.95}, {"min": 15, "pct": 20}]`
- `pct_by` / `fixed_by`: look the number up from a select input: `{"input": "category", "values": {"most": 13.6, "guitars": 6.7}, "default": 13.6}`
- `pct_input`: take the percentage from a percent input (e.g. a promoted-listing ad rate the seller chooses)
- `per_unit`: add `rate × value-of-input` to the fixed part: `{"input": "file_size_mb", "rate": 0.15}`
- `min` / `max`: clamp the resulting fee amount (Amazon's $0.30 minimum referral fee → `"min": 0.30`)
- `when`: apply the rule only if a condition holds: `{"input": "plan", "equals": "individual"}`, `{"input": "plan", "in": ["a","b"]}`, `{"input": "international", "equals": true}`, `{"input": "promoted_rate", "gt": 0}`
- `monthly`: true for subscriptions; the engine divides by `orders_per_month` to show the per-order share
- Order rules the way the platform lists them (commission first, then payment processing, then optional extras).

## Worked example

```json
"worked_example": {
  "inputs": {"sale_price": 45, "item_cost": 15},
  "expected": {"total_fees": 9.00, "net_payout": 36.00, "profit": 21.00},
  "explanation": "A $45 sale is $15 or more, so Poshmark takes 20% = $9.00. You receive $36.00; after the $15 you paid for the item, profit is $21.00."
}
```

Inputs you omit take their defaults. `net_payout` = price + shipping charged − seller fees. `profit` = net_payout − cost − shipping_cost.

## Content

All prose is for a US seller reading on a phone: short paragraphs, specific numbers, no filler.

```json
"content": {
  "intro": "2–3 paragraphs (150–250 words) explaining what the platform is, who sells there, and the fee stack with the real numbers.",
  "how_fees_work": ["4–7 short paragraphs or bullets, one fee component each, with the exact figure and when it applies"],
  "tips": ["3–5 practical ways to lower fees or price correctly, specific to this platform"],
  "faq": [{"q": "…", "a": "…"}],   // 5–7 questions people actually search, e.g. "Does eBay charge a fee on shipping?"
  "notes": "Anything unverified, regional, or recently changed (or empty string)",
  "changelog": [{"date": "YYYY-MM-DD", "change": "What changed in the fee schedule (recent, official)"}]
}
```

## Full example

```json
{
  "schema_version": 1,
  "slug": "poshmark",
  "name": "Poshmark",
  "category": "resale-app",
  "region": "United States",
  "currency": "USD",
  "tagline": "Poshmark fee calculator: see the $2.95 flat fee or 20% commission and your exact payout.",
  "fee_summary": "Poshmark keeps a flat $2.95 on sales under $15 and 20% on sales of $15 or more. Buyers pay shipping, so it does not affect your fee.",
  "last_verified": "2026-09-29",
  "sources": [{"title": "Poshmark Fee Policy", "url": "https://poshmark.com/fee-policy", "accessed": "2026-09-29"}],
  "inputs": [
    {"id": "sale_price", "label": "Sale price", "type": "money", "role": "price", "default": 45, "help": "What the buyer pays for the item, before shipping and tax."},
    {"id": "item_cost", "label": "What the item cost you", "type": "money", "role": "cost", "default": 15, "help": "Purchase price or sourcing cost."},
    {"id": "target_profit", "label": "Target profit", "type": "money", "role": "target_profit", "default": 20, "help": "We'll show the price you need to list at."}
  ],
  "fees": [
    {"id": "commission", "label": "Poshmark commission", "basis": "price",
     "tiers": [{"max": 14.99, "fixed": 2.95}, {"min": 15, "pct": 20}],
     "note": "Flat $2.95 under $15; 20% at $15 and above."}
  ],
  "worked_example": {
    "inputs": {"sale_price": 45, "item_cost": 15},
    "expected": {"total_fees": 9.00, "net_payout": 36.00, "profit": 21.00},
    "explanation": "A $45 sale is $15 or more, so Poshmark takes 20% = $9.00. You receive $36.00; after the $15 item cost, profit is $21.00."
  },
  "content": {
    "intro": "…",
    "how_fees_work": ["…"],
    "tips": ["…"],
    "faq": [{"q": "…", "a": "…"}],
    "notes": "",
    "changelog": []
  },
  "related": ["mercari", "depop", "ebay"]
}
```

A payment-processor example (Stripe-style) uses a select for the transaction type and toggles for surcharges:

```json
"inputs": [
  {"id": "amount", "label": "Transaction amount", "type": "money", "role": "price", "default": 100, "help": "What the customer pays."},
  {"id": "txn_type", "label": "Transaction type", "type": "select", "role": "other", "default": "online",
   "options": [{"id": "online", "label": "Online card payment"}, {"id": "in_person", "label": "In-person (Terminal)"}, {"id": "keyed", "label": "Manually keyed"}]},
  {"id": "international", "label": "International card", "type": "toggle", "role": "other", "default": false},
  {"id": "currency_conversion", "label": "Currency conversion", "type": "toggle", "role": "other", "default": false},
  {"id": "cost", "label": "Your cost of goods", "type": "money", "role": "cost", "default": 0, "help": "Optional, to see profit."}
],
"fees": [
  {"id": "processing", "label": "Processing fee", "basis": "price",
   "pct_by": {"input": "txn_type", "values": {"online": 2.9, "in_person": 2.7, "keyed": 3.4}},
   "fixed_by": {"input": "txn_type", "values": {"online": 0.30, "in_person": 0.05, "keyed": 0.30}}},
  {"id": "intl", "label": "International card surcharge", "basis": "price", "pct": 1.5, "when": {"input": "international", "equals": true}},
  {"id": "fx", "label": "Currency conversion", "basis": "price", "pct": 1, "when": {"input": "currency_conversion", "equals": true}}
]
```
