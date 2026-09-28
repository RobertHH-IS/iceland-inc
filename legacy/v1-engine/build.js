'use strict';
// Builds build/iceland-inc-engine.js: ONE classic script whose only top-level statement is
//   var IcelandInc = (function(){ ... return {...}; })();
// Source fragments in src/ are concatenated in file-name order. data/calibration.json is flattened and
// injected as CALIB_DATA so parameter values always match the data file at build time.
// Usage: node build.js   (plain Node, no dependencies)
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'build', 'iceland-inc-engine.js');
const DATA = path.join(__dirname, '..', 'data', 'calibration.json');

function flatten(o, pre, out) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && !('value' in v)) flatten(v, pre + k + '.', out);
    else if (v && typeof v === 'object' && 'value' in v) out[pre + k] = { value: v.value, unit: v.unit || '', year: v.year || '', source: v.source || '' };
  }
  return out;
}

let calib = {};
if (fs.existsSync(DATA)) calib = flatten(JSON.parse(fs.readFileSync(DATA, 'utf8')), '', {});
else console.warn('build: data/calibration.json not found; every data parameter falls back to a flagged placeholder');

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
let body = "'use strict';\n/* Iceland Inc. engine v1 - built " + new Date().toISOString().slice(0, 10) +
  ' from engine/src (' + files.join(', ') + '). Educational stock-flow-consistent model; not a forecast. */\n';
body += 'var CALIB_DATA = ' + JSON.stringify(calib) + ';\n';
for (const f of files) body += '\n// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(SRC, f), 'utf8');
body += '\nreturn { createModel: createModel, version: "1.0.0", paramSpec: function () { return paramSpec(); } };\n';

const out = 'var IcelandInc = (function () {\n' + body + '})();\n';
// guard: the bundle must not use module systems or Node-only APIs
const bad = out.match(/\brequire\s*\(|\bmodule\.exports\b|(^|[;{}]\s*)exports\.\w+\s*=|\bprocess\.(env|argv|exit)|\b__dirname\b|^\s*(import|export)\s/m);
if (bad) throw new Error('build: forbidden token in bundle: ' + bad[0]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
const nData = Object.values(calib).filter((x) => typeof x.value === 'number').length;
console.log(`build: wrote ${path.relative(process.cwd(), OUT)} (${(out.length / 1024).toFixed(1)} KB, ${files.length} modules, ${nData} data values)`);
