'use strict';
// Prints the generated markdown blocks used in docs/SPEC.md (from the BUILT bundle), so the numbers in the
// spec always match the model. Usage: node tools/spec_tables.js <block>   block = bs | tx | calib | params
const I = require('../index.js');
const C = require('./calibration_checks.js');
const m = I.createModel();
const S = m.sectors.map((s) => s.id);
const f = (v, d = 1) => (Math.abs(v) < 0.05 ? '' : v.toFixed(d));
const block = process.argv[2];

if (block === 'bs') {   // balance-sheet matrix: + asset, - liability, % of baseline GDP
  const st = m._state(), NI = m.instruments.length;
  console.log('| Instrument | ' + S.join(' | ') + ' | Sum |\n|---|' + S.map(() => '---:').join('|') + '|---:|');
  m.instruments.forEach((ins, k) => {
    const v = S.map((_, j) => st.bs[j * NI + k]);
    console.log(`| ${ins.label} | ${v.map((x) => f(x)).join(' | ')} | ${Math.abs(v.reduce((a, b) => a + b)) < 1e-9 ? '0' : 'ERR'} |`);
  });
  const nw = S.map((_, j) => { let t = 0; for (let k = 0; k < NI; k++) t += st.bs[j * NI + k]; return t; });
  console.log(`| **Net financial worth** | ${nw.map((x) => '**' + f(x) + '**').join(' | ')} | **0** |`);
  console.log(`| Memo: homes (non-financial) | ${S.map((id) => { const b = m.balanceSheet(id); return b.memo ? f(b.memo[0].baseline) : ''; }).join(' | ')} | |`);
}
if (block === 'tx') {   // transactions-flow matrix at the steady state, % of GDP per year
  const fl = m.flows();
  console.log('| Row | kind | ' + S.join(' | ') + ' | Sum |\n|---|---|' + S.map(() => '---:').join('|') + '|---:|');
  for (const r of fl) {
    const v = S.map((id) => r.baselineEntries[id] || 0);
    console.log(`| ${r.rowLabel} (\`${r.row}\`) | ${r.kind}${r.type === 'financial' ? ', fin.' : r.type === 'capital' ? ', cap.' : r.type === 'other' ? ', other' : ''} | ${v.map((x) => f(x, 2)).join(' | ')} | 0 |`);
  }
  console.log('\nRows with no baseline flow (they move only after a shock): ' +
    ['cons', 'vat', 'g_health', 'g_edu', 'g_other', 'g_inv', 'inv', 'inputs', 'exports', 'imports', 'wages', 'pencon', 'paytax', 'inctax', 'corptax', 'ben_oa', 'ben_fam', 'ben_ue', 'penpay', 'int_dep', 'int_res', 'int_mort', 'int_loan', 'int_bond', 'int_bondI', 'int_bbond', 'int_fxr', 'int_fa', 'div', 'cbrem', 'idx_mort', 'idx_bond', 'penadj', 'penret', 'homes', 'mort_new', 'mort_rep', 'loans', 'bond_iss', 'bond_trade', 'bbond', 'fa_buy', 'rev_fxr', 'rev_fa', 'ageing']
      .filter((id) => !fl.some((r) => r.row === id)).map((x) => '`' + x + '`').join(', '));
}
if (block === 'calib') {
  const ck = C.checks(C.scenarios(I, {}));
  console.log('| Scenario | Target | Result | Verdict |\n|---|---|---|---|');
  for (const x of ck) console.log(`| ${x.scenario} | ${x.target} | ${x.result} | ${x.pass ? 'PASS' : 'FAIL'} |`);
}
if (block === 'params') {
  console.log('| id | value | unit | category | basis | description |\n|---|---:|---|---|---|---|');
  for (const x of m.params) {
    if (['dt', 'tol', 'maxIter'].includes(x.id)) continue;
    const v = typeof x.value === 'number' ? +x.value.toPrecision(4) : x.value;
    console.log(`| \`${x.id}\` | ${v} | ${x.unit} | ${x.category} | ${String(x.basis).replace(/\|/g, '/')} | ${x.description.replace(/\|/g, '/')} |`);
  }
}
if (block === 'update') {   // refresh the generated blocks between <!-- BEGIN:x --> and <!-- END:x --> in docs/SPEC.md
  const fs = require('fs'), path = require('path'), cp = require('child_process');
  const file = path.join(__dirname, '..', '..', 'docs', 'SPEC.md');
  let txt = fs.readFileSync(file, 'utf8');
  for (const b of ['bs', 'tx', 'calib', 'params']) {
    const gen = cp.execFileSync(process.execPath, [__filename, b], { encoding: 'utf8' }).trim();
    txt = txt.replace(new RegExp('(<!-- BEGIN:' + b + ' -->)[\\s\\S]*?(<!-- END:' + b + ' -->)'), '$1\n' + gen + '\n$2');
  }
  fs.writeFileSync(file, txt);
  console.log('updated', file);
}
