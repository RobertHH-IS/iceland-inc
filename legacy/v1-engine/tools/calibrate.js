'use strict';
// Grid search over behavioural parameters against the calibration CHECKS (tools/calibration_checks.js).
// Usage: node tools/calibrate.js '{"lamC":[1,1.2]}'   (a JSON grid; prints the best combinations)
const I = require('../index.js');
const C = require('./calibration_checks.js');
const grid = JSON.parse(process.argv[2] || '{}');
const keys = Object.keys(grid);
const combos = keys.reduce((acc, k) => acc.flatMap((c) => grid[k].map((v) => ({ ...c, [k]: v }))), [{}]);
const res = combos.map((params) => {
  const ck = C.checks(C.scenarios(I, { params }));
  const worst = ck.reduce((a, x) => (x.margin < a.margin ? x : a));
  return { params, fails: ck.filter((x) => !x.pass).map((x) => x.id + '=' + x.result), score: ck.reduce((a, x) => a + x.score, 0), margin: worst.margin, worst: worst.id + '=' + worst.result };
});
res.sort((a, b) => a.score - b.score || b.margin - a.margin);
for (const r of res.slice(0, +(process.argv[3] || 8))) console.log(r.score.toFixed(3), 'margin', r.margin.toFixed(3), JSON.stringify(r.params), r.fails.join(' | ') || ('worst: ' + r.worst));
console.log(combos.length, 'combinations');
