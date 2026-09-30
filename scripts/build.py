#!/usr/bin/env python3
"""Build the FeeTally static site into docs/ (served by GitHub Pages or Cloudflare Pages).

Usage: python3 scripts/build.py
"""
import datetime as dt
import html
import json
import os
import shutil
import subprocess
import sys

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from tools_content import TOOLS  # noqa: E402

OUT = os.path.join(ROOT, "docs")
EXPLICIT_INDEX = False  # --explicit-index: link to .../index.html (for hosts that do not serve directory indexes)
DATA = os.path.join(ROOT, "data")
TODAY = dt.date.today()  # replaced in main() by the newest last_verified so builds are reproducible
YEAR = TODAY.year


# ----------------------------------------------------------------------------- helpers
def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def nicedate(s):
    try:
        d = dt.date.fromisoformat(s)
        return d.strftime("%b %-d, %Y")
    except Exception:
        return s


def money(x):
    try:
        x = float(x)
    except Exception:
        return str(x)
    return "-$%s" % format(-x, ",.2f") if x < 0 else "$%s" % format(x, ",.2f")


def pct_str(x):
    x = float(x)
    s = ("%.4f" % x).rstrip("0").rstrip(".")
    return s + "%"


def short_summary(p):
    """Short description for tiles: the tagline after 'X fee calculator:' if present."""
    t = p["tagline"]
    if ":" in t:
        t = t.split(":", 1)[1].strip()
    return t[0].upper() + t[1:] if t else p["fee_summary"]


def input_label(p, input_id):
    for i in p["inputs"]:
        if i["id"] == input_id:
            return i["label"]
    return input_id


def option_label(p, input_id, opt_id):
    for i in p["inputs"]:
        if i["id"] == input_id and i.get("options"):
            for o in i["options"]:
                if o["id"] == opt_id:
                    return o["label"]
    return str(opt_id)


def describe_rule(p, f):
    """Turn a fee rule into (rate, applies) strings for the fee table."""
    parts = []
    if f.get("tiers"):
        tier_strs = []
        for t in f["tiers"]:
            amt = []
            if t.get("pct") not in (None, 0):
                amt.append(pct_str(t["pct"]))
            if t.get("fixed") not in (None, 0):
                amt.append(money(t["fixed"]))
            amt_s = " + ".join(amt) if amt else "$0"
            lo, hi = t.get("min"), t.get("max")
            if lo is not None and hi is not None:
                rng = "%s–%s" % (money(lo), money(hi))
            elif hi is not None:
                rng = "up to %s" % money(hi)
            elif lo is not None:
                rng = "%s and up" % money(lo)
            else:
                rng = "all amounts"
            tier_strs.append("%s (%s)" % (amt_s, rng))
        parts.append("; ".join(tier_strs))
    else:
        amt = []
        if f.get("pct_by"):
            vals = f["pct_by"].get("values", {})
            pv = sorted({float(v) for v in vals.values()})
            if len(pv) == 1:
                amt.append(pct_str(pv[0]))
            elif pv:
                amt.append("%s–%s by %s" % (pct_str(pv[0]), pct_str(pv[-1]), input_label(p, f["pct_by"]["input"])))
        elif f.get("pct_input"):
            amt.append("your chosen %s" % input_label(p, f["pct_input"]))
        elif f.get("pct") not in (None, 0):
            amt.append(pct_str(f["pct"]))
        if f.get("fixed_by"):
            vals = f["fixed_by"].get("values", {})
            fv = sorted({float(v) for v in vals.values()})
            if len(fv) > 1 and 0 in fv:
                fv = [v for v in fv if v != 0]
            if len(fv) == 1:
                amt.append(money(fv[0]))
            elif fv:
                amt.append("%s–%s by %s" % (money(fv[0]), money(fv[-1]), input_label(p, f["fixed_by"]["input"])))
        elif f.get("fixed") not in (None, 0):
            amt.append(money(f["fixed"]))
        if f.get("per_unit"):
            amt.append("%s × %s" % (money(f["per_unit"]["rate"]), input_label(p, f["per_unit"]["input"])))
        parts.append(" + ".join(amt) if amt else "—")
    rate = " ".join(parts)
    if f.get("monthly"):
        rate += " per month"
    if f.get("min") is not None:
        rate += ", min %s" % money(f["min"])
    if f.get("max") is not None:
        rate += ", max %s" % money(f["max"])

    basis = f.get("basis", "price")
    price_lbl = next((i["label"] for i in p["inputs"] if i["role"] == "price"), "price").lower()
    if basis == "price":
        applies = price_lbl
    elif basis == "price_plus_shipping":
        applies = "%s + shipping charged" % price_lbl
    elif basis.startswith("input:"):
        applies = input_label(p, basis[6:])
    else:
        applies = "per order" if not f.get("monthly") else "per month"
    w = f.get("when")
    if w:
        lbl = input_label(p, w["input"])
        if "equals" in w:
            v = w["equals"]
            if isinstance(v, bool):
                applies += "; only when \u201c%s\u201d is %s" % (lbl, "on" if v else "off")
            else:
                applies += "; %s: %s" % (lbl, option_label(p, w["input"], v))
        elif "in" in w:
            applies += "; %s: %s" % (lbl, ", ".join(option_label(p, w["input"], x) for x in w["in"]))
        elif "gt" in w:
            applies += "; when %s > %s" % (lbl, w["gt"])
        elif "gte" in w:
            applies += "; when %s ≥ %s" % (lbl, w["gte"])
        elif "lt" in w:
            applies += "; when %s < %s" % (lbl, w["lt"])
    if f.get("note"):
        applies += ". " + f["note"]
    return {"label": f["label"], "rate": rate, "applies": applies, "paid_by": f.get("paid_by", "seller")}


def rel_factory(page_dir):
    """Return a function that turns a site-root path ('assets/site.css', 'ebay-fee-calculator/') into a relative URL."""
    depth = 0 if page_dir == "" else page_dir.strip("/").count("/") + 1
    prefix = "../" * depth

    def rel(path):
        path = path.lstrip("/")
        if path.startswith("#"):
            return prefix + "index.html" + path if depth else path
        if path == "":
            return (prefix + "index.html") if EXPLICIT_INDEX else (prefix if depth else "./")
        if EXPLICIT_INDEX and "#" in path and path.split("#")[0].endswith("/"):
            a, b = path.split("#", 1)
            return prefix + a + "index.html#" + b
        if EXPLICIT_INDEX and path.endswith("/"):
            return prefix + path + "index.html"
        return prefix + path
    return rel


def write(path, content):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def ad_factory(site):
    def ad(slot):
        if not site.get("adsense_client"):
            return ""
        return ('<div class="ad-slot on"><ins class="adsbygoogle" style="display:block" data-ad-client="%s" '
                'data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>'
                '<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>' % site["adsense_client"])
    return ad


# ----------------------------------------------------------------------------- main
def main():
    site = load_json(os.path.join(DATA, "site.json"))
    base_url = site["url"].rstrip("/")
    platforms = []
    pdir = os.path.join(DATA, "platforms")
    for fn in sorted(os.listdir(pdir)):
        if fn.endswith(".json"):
            platforms.append(load_json(os.path.join(pdir, fn)))
    by_slug = {p["slug"]: p for p in platforms}
    global TODAY, YEAR
    TODAY = dt.date.fromisoformat(max(p["last_verified"] for p in platforms))
    YEAR = TODAY.year

    # engine results via node (single source of truth for arithmetic)
    ex = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "scripts", "examples.js")]))

    # hubs
    hubs = []
    hub_of = {}
    for h in site["hubs"]:
        h = dict(h)
        h["platforms"] = sorted([p for p in platforms if p["category"] in h["categories"]], key=lambda p: p["name"].lower())
        for p in h["platforms"]:
            hub_of[p["slug"]] = h
        hubs.append(h)
    for p in platforms:
        p["short"] = short_summary(p)
        p["url"] = "%s-fee-calculator/" % p["slug"]

    env = Environment(loader=FileSystemLoader(os.path.join(ROOT, "templates")), autoescape=select_autoescape(["html"]))
    env.filters["nicedate"] = nicedate
    env.filters["money"] = money

    # clean output
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "assets"))
    for a in ("site.css", "app.js", "favicon.svg"):
        shutil.copy(os.path.join(ROOT, "assets", a), os.path.join(OUT, "assets", a))
    shutil.copy(os.path.join(ROOT, "src", "calc.js"), os.path.join(OUT, "assets", "calc.js"))
    open(os.path.join(OUT, ".nojekyll"), "w").close()

    ad = ad_factory(site)
    urls = []  # (path, lastmod)

    def render(template, page_dir, ctx):
        rel = rel_factory(page_dir)
        canonical = base_url + "/" + (page_dir + "/" if page_dir else "")
        ctx.update({"site": site, "rel": rel, "year": YEAR, "canonical": canonical, "ad": ad})
        html_out = env.get_template(template).render(**ctx)
        write(os.path.join(page_dir, "index.html") if page_dir else "index.html", html_out)

    # ---- platform pages
    for p in platforms:
        hub = hub_of[p["slug"]]
        page_dir = "%s-fee-calculator" % p["slug"]
        title = "%s Fee Calculator (%d): Fees, Profit & Net Payout | %s" % (p["name"], YEAR, site["name"])
        desc = p["tagline"] if len(p["tagline"]) <= 155 else p["tagline"][:152].rsplit(" ", 1)[0] + "…"
        intro_paras = [s.strip() for s in p["content"]["intro"].split("\n") if s.strip()]
        related = [dict(by_slug[s], short=short_summary(by_slug[s])) for s in p.get("related", []) if s in by_slug and s != p["slug"]]
        if len(related) < 3:
            for q in hub["platforms"]:
                if q["slug"] != p["slug"] and q["slug"] not in [r["slug"] for r in related]:
                    related.append(q)
                if len(related) >= 4:
                    break
        jsonld = [
            {"@context": "https://schema.org", "@type": "WebApplication", "name": "%s Fee Calculator" % p["name"],
             "url": base_url + "/" + page_dir + "/", "applicationCategory": "FinanceApplication", "operatingSystem": "Any",
             "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": p["tagline"],
             "dateModified": p["last_verified"]},
            {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in p["content"]["faq"]]},
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": base_url + "/"},
                {"@type": "ListItem", "position": 2, "name": hub["short"], "item": base_url + "/" + hub["slug"] + "/"},
                {"@type": "ListItem", "position": 3, "name": "%s fee calculator" % p["name"], "item": base_url + "/" + page_dir + "/"}]},
        ]
        platform_json = json.dumps({k: p[k] for k in ("slug", "name", "currency", "inputs", "fees")}, separators=(",", ":")).replace("</", "<\\/")
        render("platform.html", page_dir, {
            "title": title, "description": desc, "p": p, "hub": hub, "fee_rows": [describe_rule(p, f) for f in p["fees"]],
            "example": ex[p["slug"]]["example"], "intro_paras": intro_paras, "related": related[:4],
            "jsonld": json.dumps(jsonld, ensure_ascii=False).replace("</", "<\\/"), "platform_json": platform_json,
        })
        urls.append((page_dir + "/", p["last_verified"]))

    # ---- hub pages
    for h in hubs:
        if not h["platforms"]:
            continue
        title = "%s (%d) | %s" % (h["title"], YEAR, site["name"])
        desc = "%s Free calculators with each platform's exact fees, verified and dated." % h["blurb"]
        jsonld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": h["title"], "url": base_url + "/" + h["slug"] + "/",
                  "hasPart": [{"@type": "WebApplication", "name": "%s Fee Calculator" % p["name"], "url": base_url + "/" + p["url"]} for p in h["platforms"]]}
        render("hub.html", h["slug"], {"title": title, "description": desc[:158], "hub": h, "platforms": h["platforms"],
                                       "jsonld": json.dumps(jsonld, ensure_ascii=False)})
        urls.append((h["slug"] + "/", max(p["last_verified"] for p in h["platforms"])))

    # ---- compare
    compare_data = []
    for p in platforms:
        compare_data.append({"slug": p["slug"], "name": p["name"], "category": p["category"], "hub": hub_of[p["slug"]]["slug"],
                             "url": "../" + p["url"] + ("index.html" if EXPLICIT_INDEX else ""), "currency": p["currency"], "inputs": p["inputs"], "fees": p["fees"]})
    write("assets/compare-data.json", json.dumps(compare_data, separators=(",", ":")))
    jsonld = {"@context": "https://schema.org", "@type": "WebApplication", "name": "Platform Fee Comparison", "url": base_url + "/compare/",
              "applicationCategory": "FinanceApplication", "operatingSystem": "Any", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}
    render("compare.html", "compare", {"title": "Compare Seller Fees Across %d Platforms (%d) | %s" % (len(platforms), YEAR, site["name"]),
                                       "description": "Enter one sale and see what eBay, Etsy, Mercari, Poshmark, Stripe, PayPal and %d other platforms would leave you with, side by side." % (len(platforms) - 6),
                                       "hubs": [h for h in hubs if h["platforms"]], "jsonld": json.dumps(jsonld)})
    urls.append(("compare/", TODAY.isoformat()))

    # ---- general tools
    for t in TOOLS:
        featured = [dict(by_slug[s], short=short_summary(by_slug[s])) for s in t["featured"] if s in by_slug]
        jsonld = [{"@context": "https://schema.org", "@type": "WebApplication", "name": t["title"], "url": base_url + "/" + t["slug"] + "/",
                   "applicationCategory": "FinanceApplication", "operatingSystem": "Any", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
                  {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
                      {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": html.unescape(f["a"])}} for f in t["faq"]]}]
        render("tool.html", t["slug"], {"title": "%s (%d) | %s" % (t["title"], YEAR, site["name"]), "description": t["lead"][:158], "tool": t,
                                        "featured": featured, "jsonld": json.dumps(jsonld, ensure_ascii=False).replace("</", "<\\/")})
        urls.append((t["slug"] + "/", TODAY.isoformat()))

    # ---- home
    jsonld = {"@context": "https://schema.org", "@type": "WebSite", "name": site["name"], "url": base_url + "/",
              "description": site["description"]}
    render("home.html", "", {"title": "%s: Free Seller Fee Calculators for %d Platforms (%d)" % (site["name"], len(platforms), YEAR),
                             "description": site["description"][:158], "hubs": [h for h in hubs if h["platforms"]], "count": len(platforms),
                             "tools": TOOLS, "jsonld": json.dumps(jsonld)})
    urls.insert(0, ("", max(p["last_verified"] for p in platforms)))

    # ---- static pages
    def frag(name):
        with open(os.path.join(ROOT, "content", name), encoding="utf-8") as f:
            return f.read().replace("{{SITE}}", site["name"]).replace("{{EMAIL}}", site["contact_email"]).replace("{{DATE}}", nicedate(TODAY.isoformat()))
    pages = [
        ("about", "About %s: How the Fee Calculators Are Built" % site["name"], "About %s" % site["name"], "Independent, free fee calculators built from each platform's published fee schedule.", frag("about.html")),
        ("privacy", "Privacy Policy | %s" % site["name"], "Privacy policy", "", frag("privacy.html")),
        ("terms", "Terms of Use | %s" % site["name"], "Terms of use", "", frag("terms.html")),
    ]
    for slug, title, h1, lead, body in pages:
        rel = rel_factory(slug)
        render("page.html", slug, {"title": title, "description": (lead or title)[:158], "page": {"h1": h1, "lead": lead, "body": body}, "narrow": True})
        urls.append((slug + "/", TODAY.isoformat()))

    # 404
    rel = rel_factory("x")
    write("404.html", env.get_template("page.html").render(site=site, rel=rel_factory(""), year=YEAR, canonical=base_url + "/404.html", ad=ad,
                                                           title="Page not found | " + site["name"], description="Page not found",
                                                           page={"h1": "Page not found", "lead": "That calculator doesn't exist (yet).",
                                                                 "body": '<p><a href="./">Browse all calculators</a> or <a href="about/#contact">request one</a>.</p>'}, narrow=True))

    # sitemap, robots, ads.txt, CNAME
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, lastmod in urls:
        sm.append("  <url><loc>%s/%s</loc><lastmod>%s</lastmod></url>" % (base_url, path, lastmod))
    sm.append("</urlset>")
    write("sitemap.xml", "\n".join(sm))
    write("robots.txt", "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % base_url)
    if site.get("adsense_client"):
        write("ads.txt", "google.com, %s, DIRECT, f08c47fec0942fa0\n" % site["adsense_client"])
    else:
        write("ads.txt", "# Add the AdSense line here once approved, e.g.\n# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n")
    if site.get("cname"):
        write("CNAME", site["cname"] + "\n")

    print("Built %d platform pages, %d hubs, %d tools, %d static pages -> %s" % (len(platforms), len([h for h in hubs if h["platforms"]]), len(TOOLS), len(pages), OUT))


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--explicit-index" in args:
        EXPLICIT_INDEX = True
    if "--out" in args:
        OUT = os.path.abspath(args[args.index("--out") + 1])
    main()
