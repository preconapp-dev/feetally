/* FeeTally calculator UI. Depends on calc.js (window.FeeCalc). */
(function () {
  'use strict';
  var dataEl = document.getElementById('platform-data');
  if (!dataEl || !window.FeeCalc) return;
  var platform = JSON.parse(dataEl.textContent);
  var form = document.getElementById('calc-form');
  var out = document.getElementById('calc-results');
  var currency = platform.currency || 'USD';
  var mini = document.createElement('div'); mini.className = 'mini-bar'; mini.innerHTML = '<div class="mb-txt"><span class="mb-k">You keep</span> <strong class="mb-v"></strong> <span class="mb-f"></span></div><a class="mb-go" href="#calc-results">Breakdown ↓</a>'; document.body.appendChild(mini);
  if ('IntersectionObserver' in window) { new IntersectionObserver(function (es) { es.forEach(function (e) { mini.classList.toggle('mb-hide', e.isIntersecting); }); }, { threshold: 0.15 }).observe(out); }
  var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency });
  var money = function (x) { return fmt.format(x); };
  var pct = function (x) { return (Math.round(x * 100) / 100).toLocaleString('en-US') + '%'; };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Read initial values from the URL (?sale_price=50&category=most) so calculations can be shared.
  var params = new URLSearchParams(location.search);
  var initial = FeeCalc.defaults(platform);
  platform.inputs.forEach(function (inp) {
    if (!params.has(inp.id)) return;
    var v = params.get(inp.id);
    if (inp.type === 'toggle') initial[inp.id] = (v === '1' || v === 'true');
    else if (inp.type === 'select') { if (inp.options.some(function (o) { return o.id === v; })) initial[inp.id] = v; }
    else if (isFinite(parseFloat(v))) initial[inp.id] = parseFloat(v);
  });

  function renderForm() {
    var html = '';
    platform.inputs.forEach(function (inp) {
      var id = 'in-' + inp.id;
      if (inp.type === 'toggle') {
        html += '<div class="field"><label class="toggle" for="' + id + '"><span class="lbl">' + esc(inp.label) + '</span>' +
          '<span class="switch"><input type="checkbox" id="' + id + '" data-id="' + esc(inp.id) + '"' + (initial[inp.id] ? ' checked' : '') + '><span class="track"></span></span></label>' +
          (inp.help ? '<span class="help">' + esc(inp.help) + '</span>' : '') + '</div>';
        return;
      }
      html += '<div class="field"><label for="' + id + '">' + esc(inp.label) + '</label>';
      if (inp.type === 'select') {
        html += '<div class="input-wrap"><select id="' + id + '" data-id="' + esc(inp.id) + '">';
        inp.options.forEach(function (o) { html += '<option value="' + esc(o.id) + '"' + (initial[inp.id] === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; });
        html += '</select></div><div class="opt-note" id="note-' + esc(inp.id) + '"></div>';
      } else {
        var prefix = inp.type === 'money' ? '<span class="adorn">' + (currency === 'USD' ? '$' : currency) + '</span>' : '';
        var suffix = inp.type === 'percent' ? '<span class="adorn suffix">%</span>' : '';
        var step = inp.step != null ? inp.step : (inp.type === 'money' ? '0.01' : (inp.type === 'number' ? '1' : '0.1'));
        html += '<div class="input-wrap">' + prefix + '<input type="number" inputmode="decimal" id="' + id + '" data-id="' + esc(inp.id) + '" value="' + esc(initial[inp.id]) + '" min="' + (inp.min != null ? inp.min : 0) + '" step="' + step + '">' + suffix + '</div>';
      }
      if (inp.help) html += '<span class="help">' + esc(inp.help) + '</span>';
      html += '</div>';
    });
    form.innerHTML = html;
  }

  function readValues() {
    var v = {};
    platform.inputs.forEach(function (inp) {
      var el = document.getElementById('in-' + inp.id);
      if (!el) return;
      if (inp.type === 'toggle') v[inp.id] = el.checked;
      else if (inp.type === 'select') v[inp.id] = el.value;
      else { var n = parseFloat(el.value); v[inp.id] = isFinite(n) ? n : 0; }
    });
    return v;
  }

  function updateOptionNotes(values) {
    platform.inputs.forEach(function (inp) {
      if (inp.type !== 'select') return;
      var note = document.getElementById('note-' + inp.id);
      if (!note) return;
      var o = inp.options.filter(function (x) { return x.id === values[inp.id]; })[0];
      note.textContent = (o && o.note) ? o.note : (inp.help || '');
    });
  }

  function priceLabel() {
    var p = platform.inputs.filter(function (i) { return i.role === 'price'; })[0];
    return p ? p.label.toLowerCase() : 'price';
  }

  function render() {
    var values = readValues();
    updateOptionNotes(values);
    var r = FeeCalc.compute(platform, values);
    var hasCostInput = platform.inputs.some(function (i) { return i.role === 'cost'; });
    var hasCost = hasCostInput && (r.cost > 0 || r.shipping_cost > 0);
    var hasShip = platform.inputs.some(function (i) { return i.role === 'shipping_charged'; });
    var html = '<div class="headline"><div><div class="sub">You keep</div><div class="big' + (r.net_payout < 0 ? ' neg' : '') + '">' + money(r.net_payout) + '</div></div>' +
      '<div class="sub">of ' + money(r.gross) + (hasShip && r.shipping_charged ? ' (item + shipping)' : '') + '</div></div>';
    html += '<div class="kpis">' +
      '<div class="kpi"><div class="k">Total fees</div><div class="v">' + money(r.total_fees) + '</div></div>' +
      '<div class="kpi"><div class="k">Effective fee</div><div class="v">' + pct(r.effective_fee_pct) + '</div></div>';
    if (hasCost) {
      html += '<div class="kpi"><div class="k">Profit</div><div class="v' + (r.profit < 0 ? ' neg' : '') + '">' + money(r.profit) + '</div></div>' +
        '<div class="kpi"><div class="k">Margin</div><div class="v' + (r.margin_pct < 0 ? ' neg' : '') + '">' + pct(r.margin_pct) + '</div></div>';
    }
    html += '</div>';
    html += '<ul class="lines">';
    html += '<li><span class="n">' + esc(capitalize(priceLabel())) + '</span><span class="amt">' + money(r.price) + '</span></li>';
    if (hasShip && r.shipping_charged) html += '<li><span class="n">Shipping charged</span><span class="amt">' + money(r.shipping_charged) + '</span></li>';
    var seller = r.lines.filter(function (l) { return l.paid_by === 'seller'; });
    var buyer = r.lines.filter(function (l) { return l.paid_by === 'buyer'; });
    seller.forEach(function (l) {
      html += '<li><span class="n">' + esc(l.label) + (l.monthly ? ' <small>(per-order share)</small>' : '') + '</span><span class="amt fee">−' + money(l.amount) + '</span></li>';
    });
    html += '<li class="total"><span class="n">Net payout</span><span class="amt">' + money(r.net_payout) + '</span></li>';
    if (hasCost) {
      if (r.cost) html += '<li><span class="n">Your cost</span><span class="amt fee">−' + money(r.cost) + '</span></li>';
      if (r.shipping_cost) html += '<li><span class="n">Your shipping cost</span><span class="amt fee">−' + money(r.shipping_cost) + '</span></li>';
      html += '<li class="total"><span class="n">Profit</span><span class="amt' + (r.profit < 0 ? ' fee' : '') + '">' + money(r.profit) + '</span></li>';
    }
    if (buyer.length) {
      html += '<span class="sec">Paid by the buyer (on top)</span>';
      buyer.forEach(function (l) { html += '<li><span class="n">' + esc(l.label) + '</span><span class="amt">+' + money(l.amount) + '</span></li>'; });
      html += '<li class="total"><span class="n">Buyer pays</span><span class="amt">' + money(r.buyer_pays) + '</span></li>';
    }
    html += '</ul>';
    var hints = [];
    if (hasCost && r.breakeven_price != null) hints.push('Break-even ' + esc(priceLabel()) + ': <strong>' + money(r.breakeven_price) + '</strong>');
    if (r.price_for_target != null && r.target_profit != null && r.target_profit > 0) hints.push((hasCost ? 'For ' + money(r.target_profit) + ' profit' : 'To keep ' + money(r.target_profit)) + ', charge <strong>' + money(r.price_for_target) + '</strong>');
    if (hints.length) html += '<p class="hint">' + hints.join(' · ') + '</p>';
    html += '<div class="share-row"><button type="button" class="btn" id="btn-copy">Copy link to this calculation</button><button type="button" class="btn" id="btn-reset">Reset</button></div>';
    out.innerHTML = html;
    mini.querySelector('.mb-v').textContent = money(r.net_payout); mini.querySelector('.mb-f').textContent = '· fees ' + money(r.total_fees);
    // reflect state in URL (no reload)
    var q = new URLSearchParams();
    platform.inputs.forEach(function (inp) {
      var dv = FeeCalc.defaults(platform)[inp.id];
      if (String(values[inp.id]) !== String(dv)) q.set(inp.id, inp.type === 'toggle' ? (values[inp.id] ? '1' : '0') : values[inp.id]);
    });
    var qs = q.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) {}
    document.getElementById('btn-copy').addEventListener('click', function () {
      var url = location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { flash('Link copied'); }, function () { prompt('Copy this link', url); });
      else prompt('Copy this link', url);
    });
    document.getElementById('btn-reset').addEventListener('click', function () {
      initial = FeeCalc.defaults(platform); renderForm(); bind(); render();
    });
  }

  function flash(msg) {
    var b = document.getElementById('btn-copy'); if (!b) return;
    var old = b.textContent; b.textContent = msg; setTimeout(function () { b.textContent = old; }, 1600);
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function bind() {
    form.addEventListener('input', render);
    form.addEventListener('change', render);
  }

  renderForm(); bind(); render();
})();
