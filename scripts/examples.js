#!/usr/bin/env node
/* Print engine results for every platform's worked example and defaults, as JSON (used by build.py). */
'use strict';
const fs = require('fs');
const path = require('path');
const FeeCalc = require(path.join(__dirname, '..', 'src', 'calc.js'));
const dir = path.join(__dirname, '..', 'data', 'platforms');
const out = {};
fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
  const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const ex = FeeCalc.compute(p, p.worked_example.inputs || {});
  const def = FeeCalc.compute(p, {});
  out[p.slug] = {
    example: { gross: ex.gross, total_fees: ex.total_fees, net_payout: ex.net_payout, profit: ex.profit, lines: ex.lines },
    defaults: { gross: def.gross, total_fees: def.total_fees, net_payout: def.net_payout, effective_fee_pct: def.effective_fee_pct }
  };
});
process.stdout.write(JSON.stringify(out));
