'use strict';
// Node entry point: loads the BUILT browser bundle exactly as a browser would (inside new Function).
//   const IcelandInc = require('./index.js'); const m = IcelandInc.createModel(); m.step(12);
const fs = require('fs');
const path = require('path');

function load(file) {
  const src = fs.readFileSync(file || path.join(__dirname, 'build', 'iceland-inc-engine.js'), 'utf8');
  return new Function(src + '\nreturn IcelandInc;')();
}
module.exports = load();
module.exports.load = load;
