/* Iceland Inc. engine v1 -- shared helpers.
 * Source modules are plain fragments (no import/export). build.js concatenates them, in file-name
 * order, inside `var IcelandInc = (function(){ ... })();` and injects CALIB_DATA from data/calibration.json.
 */
function kf(lam, dt) { return 1 - Math.exp(-lam * dt); }                 // partial-adjustment share per step
function ann(r, T) { return Math.abs(r) < 1e-12 ? 1 / T : r / (1 - Math.pow(1 + r, -T)); } // annuity factor
function sum(a) { var t = 0; for (var j = 0; j < a.length; j++) t += a[j]; return t; }
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function round(x, d) { var m = Math.pow(10, d); return Math.round(x * m) / m; }
