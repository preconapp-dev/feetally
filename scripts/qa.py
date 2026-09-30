#!/usr/bin/env python3
"""Headless QA: serve docs/, open key pages on phone + desktop, capture console errors and screenshots."""
import http.server, json, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/qa'
os.makedirs(SHOTS, exist_ok=True)
PORT = int(os.environ.get("QA_PORT", "8765"))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DOCS, **k)
    def log_message(self, *a): pass

srv = socketserver.TCPServer(('127.0.0.1', PORT), Quiet); srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{PORT}/'
pages = ['', 'ebay-fee-calculator/', 'stripe-fee-calculator/', 'poshmark-fee-calculator/', 'amazon-fee-calculator/', 'compare/', 'price-after-fees-calculator/', 'marketplaces/', 'about/', 'privacy/']
problems = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for label, vp, dark in (('phone', {'width': 390, 'height': 844}, False), ('desktop', {'width': 1280, 'height': 900}, False), ('phone-dark', {'width': 390, 'height': 844}, True)):
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if 'phone' in label else 1, color_scheme='dark' if dark else 'light')
        for path in pages:
            if dark and path not in ('', 'ebay-fee-calculator/'): continue
            pg = ctx.new_page(); errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            resp = pg.goto(base + path, wait_until='networkidle')
            if resp.status != 200: problems.append((path, 'HTTP %s' % resp.status))
            # check for broken links (same-origin) quickly on first pass
            if label == 'desktop':
                hrefs = pg.eval_on_selector_all('a[href]', 'els => els.map(e => e.getAttribute("href"))')
                for h in hrefs:
                    if h.startswith('http') or h.startswith('mailto:') or h.startswith('#'): continue
                    target = pg.evaluate('h => new URL(h, location.href).pathname', h)
                    fs = os.path.join(DOCS, target.lstrip('/'))
                    if target.endswith('/'): fs = os.path.join(fs, 'index.html')
                    if not os.path.exists(fs): problems.append((path, 'broken link ' + h))
            name = (path.strip('/').replace('/', '_') or 'home')
            pg.screenshot(path=os.path.join(SHOTS, f'{name}-{label}.png'), full_page=(path in ('ebay-fee-calculator/', '')))
            if errs: problems.append((path, label, errs))
            # sanity: results text present on calculator pages
            if path.endswith('-fee-calculator/'):
                txt = pg.inner_text('#calc-results')
                if 'You keep' not in txt: problems.append((path, 'no results rendered'))
            pg.close()
        ctx.close()
    # numeric check: eBay worked example via the UI
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    pg = ctx.new_page(); pg.goto(base + 'ebay-fee-calculator/?sale_price=60&shipping_charged=8&item_cost=20&shipping_cost=6', wait_until='networkidle')
    print('EBAY RESULTS:\n', pg.inner_text('#calc-results')[:600])
    pg.goto(base + 'compare/#resale-apps', wait_until='networkidle'); pg.wait_for_timeout(300)
    print('COMPARE ROWS:', pg.locator('table.compare-table tbody tr').count())
    b.close()
srv.shutdown()
print('PROBLEMS:', json.dumps(problems, indent=1) if problems else 'none')
