/* FeeTally calculator engine.
 * Pure function: compute(platform, values) -> result.
 * Works in the browser (window.FeeCalc) and in Node (module.exports).
 * All money in the platform's currency; percentages are plain numbers (13.6 means 13.6%).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FeeCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROLES = ['price', 'shipping_charged', 'cost', 'shipping_cost', 'orders_per_month', 'target_profit', 'other'];

  function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }

  function inputByRole(platform, role) {
    for (var i = 0; i < platform.inputs.length; i++) if (platform.inputs[i].role === role) return platform.inputs[i];
    return null;
  }

  function defaults(platform) {
    var v = {};
    platform.inputs.forEach(function (inp) {
      if (inp.type === 'select') v[inp.id] = inp.default != null ? inp.default : (inp.options[0] && inp.options[0].id);
      else if (inp.type === 'toggle') v[inp.id] = !!inp.default;
      else v[inp.id] = inp.default != null ? inp.default : 0;
    });
    return v;
  }

  function roleValue(platform, values, role) {
    var inp = inputByRole(platform, role);
    return inp ? num(values[inp.id]) : 0;
  }

  function basisAmount(platform, values, basis) {
    basis = basis || 'price';
    if (basis === 'price') return roleValue(platform, values, 'price');
    if (basis === 'price_plus_shipping') return roleValue(platform, values, 'price') + roleValue(platform, values, 'shipping_charged');
    if (basis === 'none') return 0;
    if (basis.indexOf('input:') === 0) return num(values[basis.slice(6)]);
    throw new Error('Unknown basis: ' + basis);
  }

  function conditionMet(cond, values) {
    if (!cond) return true;
    var v = values[cond.input];
    if (Object.prototype.hasOwnProperty.call(cond, 'equals')) return v === cond.equals || String(v) === String(cond.equals);
    if (cond.in) return cond.in.some(function (x) { return x === v || String(x) === String(v); });
    if (Object.prototype.hasOwnProperty.call(cond, 'gt')) return num(v) > cond.gt;
    if (Object.prototype.hasOwnProperty.call(cond, 'gte')) return num(v) >= cond.gte;
    if (Object.prototype.hasOwnProperty.call(cond, 'lt')) return num(v) < cond.lt;
    if (cond.truthy) return !!v;
    return true;
  }

  function lookup(map, values) {
    // map: {input: "category", values: {optionId: number}, default: number}
    if (!map) return null;
    var key = values[map.input];
    if (map.values && Object.prototype.hasOwnProperty.call(map.values, key)) return num(map.values[key]);
    return map.default != null ? num(map.default) : 0;
  }

  function feeAmount(platform, values, rule) {
    if (!conditionMet(rule.when, values)) return null;
    var base = basisAmount(platform, values, rule.basis);
    var pct = 0, fixed = 0;
    if (rule.tiers && rule.tiers.length) {
      var tier = null;
      for (var i = 0; i < rule.tiers.length; i++) {
        var t = rule.tiers[i];
        var lo = t.min != null ? t.min : -Infinity, hi = t.max != null ? t.max : Infinity;
        if (base >= lo && base <= hi) { tier = t; break; }
      }
      if (!tier) return { amount: 0, pct: 0, fixed: 0, base: base };
      pct = num(tier.pct); fixed = num(tier.fixed);
    } else {
      pct = rule.pct != null ? num(rule.pct) : 0;
      fixed = rule.fixed != null ? num(rule.fixed) : 0;
    }
    if (rule.pct_by) pct = lookup(rule.pct_by, values);
    if (rule.fixed_by) fixed = lookup(rule.fixed_by, values);
    if (rule.pct_input) pct = num(values[rule.pct_input]);
    if (rule.per_unit) fixed += num(values[rule.per_unit.input]) * num(rule.per_unit.rate);
    var amount = base * pct / 100 + fixed;
    if (rule.min != null) amount = Math.max(amount, num(rule.min));
    if (rule.max != null) amount = Math.min(amount, num(rule.max));
    if (rule.monthly) {
      var orders = roleValue(platform, values, 'orders_per_month');
      amount = orders > 0 ? amount / orders : amount;
    }
    return { amount: amount, pct: pct, fixed: fixed, base: base };
  }

  function computeCore(platform, values) {
    var price = roleValue(platform, values, 'price');
    var ship = roleValue(platform, values, 'shipping_charged');
    var cost = roleValue(platform, values, 'cost');
    var shipCost = roleValue(platform, values, 'shipping_cost');
    var gross = price + ship;
    var lines = [], sellerTotal = 0, buyerTotal = 0;
    (platform.fees || []).forEach(function (rule) {
      var r = feeAmount(platform, values, rule);
      if (r === null) return;
      var paidBy = rule.paid_by || 'seller';
      var amt = round2(r.amount);
      lines.push({ id: rule.id, label: rule.label, amount: amt, paid_by: paidBy, pct: r.pct, fixed: r.fixed, note: rule.note || '', monthly: !!rule.monthly });
      if (paidBy === 'seller') sellerTotal += amt; else buyerTotal += amt;
    });
    sellerTotal = round2(sellerTotal); buyerTotal = round2(buyerTotal);
    var net = round2(gross - sellerTotal);
    var profit = round2(net - cost - shipCost);
    return {
      price: price, shipping_charged: ship, gross: round2(gross), cost: cost, shipping_cost: shipCost,
      lines: lines, total_fees: sellerTotal, buyer_fees: buyerTotal, net_payout: net, profit: profit,
      margin_pct: price > 0 ? round2(profit / price * 100) : 0,
      effective_fee_pct: gross > 0 ? round2(sellerTotal / gross * 100) : 0,
      buyer_pays: round2(gross + buyerTotal)
    };
  }

  // Find the price that yields a target profit (bisection on the price input).
  function solvePrice(platform, values, targetProfit) {
    var priceInput = inputByRole(platform, 'price');
    if (!priceInput) return null;
    var v = {}; for (var k in values) v[k] = values[k];
    var lo = 0, hi = 10;
    var f = function (p) { v[priceInput.id] = p; return computeCore(platform, v).profit - targetProfit; };
    var guard = 0;
    while (f(hi) < 0 && guard++ < 40) hi *= 2;
    if (f(hi) < 0) return null;
    for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return round2(Math.ceil(hi * 100) / 100);
  }

  function compute(platform, values) {
    var v = defaults(platform);
    for (var k in (values || {})) v[k] = values[k];
    var res = computeCore(platform, v);
    res.breakeven_price = solvePrice(platform, v, 0);
    var tp = inputByRole(platform, 'target_profit');
    res.target_profit = tp ? num(v[tp.id]) : null;
    res.price_for_target = tp ? solvePrice(platform, v, num(v[tp.id])) : null;
    res.values = v;
    return res;
  }

  return { compute: compute, defaults: defaults, solvePrice: solvePrice, ROLES: ROLES, round2: round2 };
});
