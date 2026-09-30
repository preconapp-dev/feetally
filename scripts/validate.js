#!/usr/bin/env node
/* Validate platform fee files against data/SCHEMA.md and run the worked example through the engine.
 * Usage: node scripts/validate.js data/platforms/ebay.json [more files...]
 *        node scripts/validate.js --all
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FeeCalc = require(path.join(__dirname, '..', 'src', 'calc.js'));

const CATEGORIES = ['marketplace', 'resale-app', 'payment-processor', 'creator-platform', 'freelance', 'gig', 'hosting', 'crowdfunding', 'events', 'publishing'];
const INPUT_TYPES = ['money', 'percent', 'number', 'select', 'toggle'];
const ROLES = ['price', 'shipping_charged', 'cost', 'shipping_cost', 'orders_per_month', 'target_profit', 'other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function wordCount(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }

function validate(file) {
  const errors = [], warnings = [];
  let p;
  try { p = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { file, errors: ['Invalid JSON: ' + e.message], warnings }; }

  const req = ['schema_version', 'slug', 'name', 'category', 'region', 'currency', 'tagline', 'fee_summary', 'last_verified', 'sources', 'inputs', 'fees', 'worked_example', 'content'];
  req.forEach(k => { if (p[k] === undefined || p[k] === null || p[k] === '') errors.push(`missing field: ${k}`); });
  if (errors.length) return { file, errors, warnings };

  if (p.schema_version !== 1) errors.push('schema_version must be 1');
  const base = path.basename(file, '.json');
  if (p.slug !== base) errors.push(`slug "${p.slug}" must equal filename "${base}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) errors.push('slug must be lowercase letters, digits and hyphens');
  if (!CATEGORIES.includes(p.category)) errors.push(`category must be one of ${CATEGORIES.join(', ')}`);
  if (!DATE_RE.test(p.last_verified)) errors.push('last_verified must be YYYY-MM-DD');
  if (p.tagline.length > 160) warnings.push('tagline longer than 160 chars');
  if (!Array.isArray(p.sources) || !p.sources.length) errors.push('sources must be a non-empty array');
  else p.sources.forEach((s, i) => {
    if (!s.title) errors.push(`sources[${i}].title missing`);
    if (!/^https:\/\//.test(s.url || '')) errors.push(`sources[${i}].url must be https`);
    if (!DATE_RE.test(s.accessed || '')) errors.push(`sources[${i}].accessed must be YYYY-MM-DD`);
  });

  // inputs
  const ids = new Set();
  let priceCount = 0;
  const inputs = Array.isArray(p.inputs) ? p.inputs : [];
  if (!inputs.length) errors.push('inputs must be a non-empty array');
  inputs.forEach((inp, i) => {
    const tag = `inputs[${i}]`;
    if (!inp.id) errors.push(`${tag}.id missing`);
    if (ids.has(inp.id)) errors.push(`${tag}.id duplicate: ${inp.id}`);
    ids.add(inp.id);
    if (!inp.label) errors.push(`${tag}.label missing`);
    if (!INPUT_TYPES.includes(inp.type)) errors.push(`${tag}.type invalid: ${inp.type}`);
    if (!ROLES.includes(inp.role)) errors.push(`${tag}.role invalid: ${inp.role}`);
    if (inp.role === 'price') priceCount++;
    if (inp.type === 'select') {
      if (!Array.isArray(inp.options) || !inp.options.length) errors.push(`${tag}.options required for select`);
      else {
        const oids = new Set();
        inp.options.forEach((o, j) => {
          if (!o.id || !o.label) errors.push(`${tag}.options[${j}] needs id and label`);
          if (oids.has(o.id)) errors.push(`${tag}.options[${j}].id duplicate`);
          oids.add(o.id);
        });
        if (!oids.has(inp.default)) errors.push(`${tag}.default "${inp.default}" is not an option id`);
      }
    } else if (inp.type === 'toggle') {
      if (typeof inp.default !== 'boolean') errors.push(`${tag}.default must be true/false for toggle`);
    } else if (inp.default !== undefined && typeof inp.default !== 'number') errors.push(`${tag}.default must be a number`);
    if (!inp.help && inp.type !== 'select' && inp.type !== 'toggle') warnings.push(`${tag} (${inp.id}) has no help text`);
  });
  if (priceCount !== 1) errors.push(`exactly one input must have role "price" (found ${priceCount})`);
  const hasCost = inputs.some(i => i.role === 'cost');
  if (!hasCost) warnings.push('no input with role "cost": page cannot show profit');
  const hasTarget = inputs.some(i => i.role === 'target_profit');
  if (!hasTarget) warnings.push('no input with role "target_profit": page cannot show price-for-target');

  // fees
  const fees = Array.isArray(p.fees) ? p.fees : [];
  if (!fees.length) errors.push('fees must be a non-empty array');
  const fids = new Set();
  let anyMonthly = false;
  fees.forEach((f, i) => {
    const tag = `fees[${i}]`;
    if (!f.id) errors.push(`${tag}.id missing`);
    if (fids.has(f.id)) errors.push(`${tag}.id duplicate: ${f.id}`);
    fids.add(f.id);
    if (!f.label) errors.push(`${tag}.label missing`);
    if (f.paid_by && !['seller', 'buyer'].includes(f.paid_by)) errors.push(`${tag}.paid_by must be seller or buyer`);
    const b = f.basis || 'price';
    if (!(['price', 'price_plus_shipping', 'none'].includes(b) || b.startsWith('input:'))) errors.push(`${tag}.basis invalid: ${b}`);
    if (b.startsWith('input:') && !ids.has(b.slice(6))) errors.push(`${tag}.basis refers to unknown input ${b}`);
    if (b === 'price_plus_shipping' && !inputs.some(x => x.role === 'shipping_charged')) warnings.push(`${tag} uses price_plus_shipping but no shipping_charged input exists`);
    ['pct', 'fixed', 'min', 'max'].forEach(k => { if (f[k] !== undefined && typeof f[k] !== 'number') errors.push(`${tag}.${k} must be a number`); });
    if (f.tiers) {
      if (!Array.isArray(f.tiers) || !f.tiers.length) errors.push(`${tag}.tiers must be a non-empty array`);
      else f.tiers.forEach((t, j) => { ['min', 'max', 'pct', 'fixed'].forEach(k => { if (t[k] !== undefined && typeof t[k] !== 'number') errors.push(`${tag}.tiers[${j}].${k} must be a number`); }); });
    }
    ['pct_by', 'fixed_by'].forEach(k => {
      if (!f[k]) return;
      const m = f[k];
      if (!m.input || !ids.has(m.input)) errors.push(`${tag}.${k}.input unknown: ${m.input}`);
      else {
        const inp = inputs.find(x => x.id === m.input);
        if (inp.type !== 'select') errors.push(`${tag}.${k}.input must be a select input`);
        else {
          const known = new Set(inp.options.map(o => o.id));
          Object.keys(m.values || {}).forEach(oid => { if (!known.has(oid)) errors.push(`${tag}.${k}.values has unknown option "${oid}"`); });
          inp.options.forEach(o => { if (!(m.values && Object.prototype.hasOwnProperty.call(m.values, o.id)) && m.default === undefined) warnings.push(`${tag}.${k} has no value for option "${o.id}" (treated as 0)`); });
        }
      }
    });
    if (f.pct_input && !ids.has(f.pct_input)) errors.push(`${tag}.pct_input unknown input: ${f.pct_input}`);
    if (f.per_unit && (!f.per_unit.input || !ids.has(f.per_unit.input) || typeof f.per_unit.rate !== 'number')) errors.push(`${tag}.per_unit needs {input (existing), rate (number)}`);
    if (f.when) {
      if (!f.when.input || !ids.has(f.when.input)) errors.push(`${tag}.when.input unknown: ${f.when && f.when.input}`);
      const keys = ['equals', 'in', 'gt', 'gte', 'lt', 'truthy'];
      if (!keys.some(k => Object.prototype.hasOwnProperty.call(f.when, k))) errors.push(`${tag}.when needs one of ${keys.join('/')}`);
    }
    if (f.monthly) anyMonthly = true;
    const hasAmount = f.pct !== undefined || f.fixed !== undefined || f.tiers || f.pct_by || f.fixed_by || f.pct_input || f.per_unit;
    if (!hasAmount) errors.push(`${tag} has no pct/fixed/tiers/pct_by/fixed_by/pct_input/per_unit`);
  });
  if (anyMonthly && !inputs.some(i => i.role === 'orders_per_month')) errors.push('a monthly fee exists but no input has role "orders_per_month"');

  // worked example
  const we = p.worked_example || {};
  if (!we.inputs || typeof we.inputs !== 'object') errors.push('worked_example.inputs missing');
  if (!we.expected || typeof we.expected !== 'object') errors.push('worked_example.expected missing');
  if (!we.explanation || wordCount(we.explanation) < 15) errors.push('worked_example.explanation must be at least 15 words');
  if (we.inputs) Object.keys(we.inputs).forEach(k => { if (!ids.has(k)) errors.push(`worked_example.inputs has unknown input "${k}"`); });

  // content
  const c = p.content || {};
  if (wordCount(c.intro) < 120) errors.push(`content.intro must be at least 120 words (has ${wordCount(c.intro)})`);
  if (!Array.isArray(c.how_fees_work) || c.how_fees_work.length < 3) errors.push('content.how_fees_work needs at least 3 items');
  if (!Array.isArray(c.tips) || c.tips.length < 3) errors.push('content.tips needs at least 3 items');
  if (!Array.isArray(c.faq) || c.faq.length < 4) errors.push('content.faq needs at least 4 items');
  else c.faq.forEach((f, i) => { if (!f.q || !f.a) errors.push(`content.faq[${i}] needs q and a`); });
  if (c.notes === undefined) errors.push('content.notes must exist (may be empty string)');
  if (!Array.isArray(c.changelog)) errors.push('content.changelog must be an array (may be empty)');
  if (p.related && !Array.isArray(p.related)) errors.push('related must be an array of slugs');

  // run engine
  if (!errors.length) {
    try {
      const res = FeeCalc.compute(p, we.inputs || {});
      ['total_fees', 'net_payout', 'profit'].forEach(k => {
        if (we.expected[k] === undefined) { warnings.push(`worked_example.expected.${k} not given`); return; }
        const diff = Math.abs(res[k] - we.expected[k]);
        if (diff > 0.011) errors.push(`worked example mismatch: ${k} engine=${res[k].toFixed(2)} expected=${Number(we.expected[k]).toFixed(2)} (lines: ${res.lines.map(l => l.label + '=' + l.amount.toFixed(2)).join(', ')})`);
      });
      if (res.total_fees === 0) warnings.push('engine computed $0 total fees for the worked example');
      const d = FeeCalc.compute(p, {});
      if (d.net_payout <= 0 && d.gross > 0) warnings.push('with default inputs the net payout is <= 0; check defaults');
    } catch (e) { errors.push('engine error: ' + e.message); }
  }
  return { file, errors, warnings };
}

function main() {
  let files = process.argv.slice(2);
  if (files.includes('--all')) {
    const dir = path.join(__dirname, '..', 'data', 'platforms');
    files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));
  }
  if (!files.length) { console.error('usage: node scripts/validate.js <file.json> [...] | --all'); process.exit(2); }
  let failed = 0;
  files.forEach(f => {
    const r = validate(f);
    const name = path.relative(process.cwd(), f);
    if (r.errors.length) { failed++; console.log(`FAIL ${name}`); r.errors.forEach(e => console.log('  error: ' + e)); }
    else console.log(`PASS ${name}`);
    r.warnings.forEach(w => console.log('  warn: ' + w));
  });
  console.log(`\n${files.length - failed}/${files.length} passed`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();
module.exports = { validate };
