/* FeeTally calculation engine. Runs in the browser and in Node (validator/build).
   Pure functions, no DOM. See schema/PLATFORM_SCHEMA.md for the data format. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FeeEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROLES = ['price', 'shipping_charged', 'item_cost', 'shipping_cost', 'orders_per_month', 'other'];
  var TYPES = ['money', 'percent', 'number', 'select', 'toggle'];

  function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

  function inputById(platform, id) {
    for (var i = 0; i < platform.inputs.length; i++) if (platform.inputs[i].id === id) return platform.inputs[i];
    return null;
  }

  function inputByRole(platform, role) {
    for (var i = 0; i < platform.inputs.length; i++) if (platform.inputs[i].role === role) return platform.inputs[i];
    return null;
  }

  /* Merge user-supplied values over defaults. Returns a plain object id -> value. */
  function resolveInputs(platform, values) {
    var out = {};
    values = values || {};
    platform.inputs.forEach(function (inp) {
      var v = values.hasOwnProperty(inp.id) ? values[inp.id] : inp.default;
      if (inp.type === 'select') {
        var ok = (inp.options || []).some(function (o) { return o.id === v; });
        if (!ok) v = inp.default;
      } else if (inp.type === 'toggle') {
        v = !!v;
      } else {
        v = Number(v);
        if (!isFinite(v)) v = Number(inp.default) || 0;
        if (typeof inp.min === 'number' && v < inp.min) v = inp.min;
        if (typeof inp.max === 'number' && v > inp.max) v = inp.max;
      }
      out[inp.id] = v;
    });
    return out;
  }

  function isVisible(platform, inp, vals) {
    if (!inp.show_if) return true;
    var c = inp.show_if; var v = vals[c.input];
    if (c.hasOwnProperty('equals')) return v === c.equals;
    if (Array.isArray(c['in'])) return c['in'].indexOf(v) !== -1;
    return true;
  }

  function conditionHolds(when, vals) {
    if (!when) return true;
    var v = vals[when.input];
    if (when.hasOwnProperty('equals')) return v === when.equals;
    if (Array.isArray(when['in'])) return when['in'].indexOf(v) !== -1;
    if (when.hasOwnProperty('gt')) return Number(v) > when.gt;
    if (when.hasOwnProperty('gte')) return Number(v) >= when.gte;
    if (when.hasOwnProperty('lt')) return Number(v) < when.lt;
    if (when.hasOwnProperty('truthy')) return !!v === !!when.truthy;
    return true;
  }

  function roleValue(platform, vals, role) {
    var inp = inputByRole(platform, role);
    return inp ? Number(vals[inp.id]) || 0 : 0;
  }

  function basisAmount(platform, vals, basis, feeAmounts) {
    basis = basis || 'price';
    if (basis === 'price') return roleValue(platform, vals, 'price');
    if (basis === 'price_plus_shipping') return roleValue(platform, vals, 'price') + roleValue(platform, vals, 'shipping_charged');
    if (basis.indexOf('input:') === 0) return Number(vals[basis.slice(6)]) || 0;
    if (basis.indexOf('fee:') === 0) return feeAmounts[basis.slice(4)] || 0;
    return roleValue(platform, vals, 'price');
  }

  function pickTier(tiers, amount) {
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      var lo = typeof t.min === 'number' ? t.min : -Infinity;
      var hi = typeof t.max === 'number' ? t.max : Infinity;
      if (amount >= lo && amount <= hi) return t;
    }
    return null;
  }

  function computeFee(platform, fee, vals, feeAmounts) {
    if (!conditionHolds(fee.when, vals)) return null;
    var base = basisAmount(platform, vals, fee.basis, feeAmounts);
    var pct = typeof fee.pct === 'number' ? fee.pct : 0;
    var fixed = typeof fee.fixed === 'number' ? fee.fixed : 0;
    if (fee.pct_by && fee.pct_by.values && fee.pct_by.values.hasOwnProperty(vals[fee.pct_by.input])) pct = Number(fee.pct_by.values[vals[fee.pct_by.input]]);
    if (fee.fixed_by && fee.fixed_by.values && fee.fixed_by.values.hasOwnProperty(vals[fee.fixed_by.input])) fixed = Number(fee.fixed_by.values[vals[fee.fixed_by.input]]);
    if (Array.isArray(fee.tiers) && fee.tiers.length) {
      var t = pickTier(fee.tiers, base);
      if (t) { pct = typeof t.pct === 'number' ? t.pct : 0; fixed = typeof t.fixed === 'number' ? t.fixed : 0; }
      else { pct = 0; fixed = 0; }
    }
    var amount = base * pct / 100 + fixed;
    if (fee.per_unit && fee.per_unit.input) amount += (Number(vals[fee.per_unit.input]) || 0) * (Number(fee.per_unit.rate) || 0);
    if (typeof fee.min === 'number' && amount < fee.min) amount = fee.min;
    if (typeof fee.max === 'number' && amount > fee.max) amount = fee.max;
    var monthlyTotal = null;
    if (fee.monthly) {
      monthlyTotal = amount;
      var opm = roleValue(platform, vals, 'orders_per_month');
      amount = opm > 0 ? amount / opm : 0;
    }
    return {
      id: fee.id,
      label: fee.label,
      paid_by: fee.paid_by === 'buyer' ? 'buyer' : 'seller',
      amount: round2(amount),
      raw: amount,
      pct_applied: pct,
      fixed_applied: fixed,
      base: base,
      monthly_total: monthlyTotal,
      note: fee.note || ''
    };
  }

  /* Main entry point. Returns a result object with line items and totals. */
  function calculate(platform, values) {
    var vals = resolveInputs(platform, values);
    var price = roleValue(platform, vals, 'price');
    var ship = roleValue(platform, vals, 'shipping_charged');
    var itemCost = roleValue(platform, vals, 'item_cost');
    var shipCost = roleValue(platform, vals, 'shipping_cost');
    var subtotal = price + ship;
    var feeAmounts = {};
    var lines = [];
    var sellerFees = 0, buyerFees = 0;
    platform.fees.forEach(function (fee) {
      var line = computeFee(platform, fee, vals, feeAmounts);
      if (!line) return;
      feeAmounts[fee.id] = line.raw;
      lines.push(line);
      if (line.paid_by === 'buyer') buyerFees += line.raw; else sellerFees += line.raw;
    });
    var net = subtotal - sellerFees;
    var profit = net - itemCost - shipCost;
    return {
      inputs: vals,
      price: round2(price),
      shipping_charged: round2(ship),
      subtotal: round2(subtotal),
      lines: lines,
      total_fees: round2(sellerFees),
      buyer_fees: round2(buyerFees),
      net_payout: round2(net),
      profit: round2(profit),
      margin_pct: price > 0 ? round2(profit / price * 100) : 0,
      effective_rate_pct: subtotal > 0 ? round2(sellerFees / subtotal * 100) : 0,
      costs: round2(itemCost + shipCost)
    };
  }

  /* Find the sale price that yields the target profit, holding every other input fixed.
     Bisection: assumes profit is (weakly) increasing in price, which holds for all fee shapes here. */
  function solvePriceForProfit(platform, values, targetProfit) {
    var priceInput = inputByRole(platform, 'price');
    if (!priceInput) return null;
    var lo = 0, hi = 1000;
    var probe = function (p) { var v = Object.assign({}, values); v[priceInput.id] = p; return calculate(platform, v).profit; };
    var guard = 0;
    while (probe(hi) < targetProfit && guard++ < 30) hi *= 2;
    if (probe(hi) < targetProfit) return null;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (probe(mid) >= targetProfit) hi = mid; else lo = mid;
    }
    return round2(Math.ceil(hi * 100) / 100);
  }

  function money(x, currency) {
    var sign = x < 0 ? '-' : '';
    var abs = Math.abs(x);
    var s = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var sym = currency === 'USD' || !currency ? '$' : currency + ' ';
    return sign + sym + s;
  }

  return {
    ROLES: ROLES, TYPES: TYPES,
    resolveInputs: resolveInputs, isVisible: isVisible, calculate: calculate,
    solvePriceForProfit: solvePriceForProfit, money: money, round2: round2,
    inputById: inputById, inputByRole: inputByRole
  };
}));
