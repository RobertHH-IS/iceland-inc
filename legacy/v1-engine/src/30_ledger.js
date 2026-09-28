/* ---------------------------------------------------------------- 30_ledger.js
 * Double-entry ledger. Every balance-sheet change is a leg (sector, instrument, amount, kind) with
 * kind 0 cash | 1 accrual | 2 revaluation (other change) | 3 write-off. Transactions also post to Godley rows.
 * Payments settle in deposits (households, firms, pension funds, rest of world), the Treasury account
 * (government) or reserves (banks <-> central bank). Banks and the central bank pay by creating their own
 * liabilities, which is how bank lending and bank/central-bank bond purchases create money.
 */
function Ledger() {
  this.bs = null;
  this.rows = new Float64Array(ROWS.length * NS);
  this.acc = new Float64Array(NS * NI * 4);
  this.oc = new Float64Array(NS);      // other changes in net worth (revaluations, write-offs)
  this.rec = [];                       // pair records: row, from, to, kind, amount (amount >= 0)
}
Ledger.prototype.begin = function (bs) { this.bs = bs; this.rows.fill(0); this.acc.fill(0); this.oc.fill(0); this.rec.length = 0; };
Ledger.prototype.leg = function (s, k, a, kind) { this.bs[s * NI + k] += a; this.acc[(s * NI + k) * 4 + kind] += a; };
Ledger.prototype.post = function (r, s, a) { this.rows[r * NS + s] += a; };
Ledger.prototype.note = function (r, from, to, kind, a) {
  if (a < 0) { var t = from; from = to; to = t; a = -a; }
  if (a > 0 && from !== to) this.rec.push(r, from, to, kind, a);
};
Ledger.prototype.settle = function (from, to, a) {        // move means of payment from -> to
  var loc;
  if (IS_DEP[from]) { this.leg(from, DEP, -a, 0); this.leg(B, DEP, a, 0); loc = B; }
  else if (from === G) { this.leg(G, TGA, -a, 0); this.leg(CB, TGA, a, 0); loc = CB; }
  else loc = from;
  var need = (IS_DEP[to] || to === B) ? B : CB;
  if (loc !== need) { var sg = loc === B ? -1 : 1; this.leg(B, RES, sg * a, 0); this.leg(CB, RES, -sg * a, 0); }
  if (IS_DEP[to]) { this.leg(to, DEP, a, 0); this.leg(B, DEP, -a, 0); }
  else if (to === G) { this.leg(G, TGA, a, 0); this.leg(CB, TGA, -a, 0); }
};
// current or capital transaction paid in cash (enters saving)
Ledger.prototype.pay = function (r, from, to, a) {
  if (!a) return;
  this.post(r, from, -a); this.post(r, to, a);
  if (from !== to) this.settle(from, to, a);
  this.note(r, from, to, 0, a);
};
// accrued income capitalised into a claim: no cash moves (indexation, pension rights)
Ledger.prototype.accrue = function (r, payer, payee, k, a) {
  if (!a) return;
  this.post(r, payer, -a); this.post(r, payee, a);
  this.leg(payer, k, -a, 1); this.leg(payee, k, a, 1);
  this.note(r, payer, payee, 1, a);
};
// new claim issued for cash (a < 0: redemption / repayment). Row: holder pays (-), issuer receives (+).
Ledger.prototype.issue = function (r, issuer, holder, k, a) {
  if (!a) return;
  this.leg(issuer, k, -a, 0); this.leg(holder, k, a, 0); this.settle(holder, issuer, a);
  this.post(r, holder, -a); this.post(r, issuer, a);
  this.note(r, holder, issuer, 0, a);
};
// existing claim changes hands for cash
Ledger.prototype.trade = function (r, seller, buyer, k, a) {
  if (!a) return;
  this.leg(seller, k, -a, 0); this.leg(buyer, k, a, 0); this.settle(buyer, seller, a);
  this.post(r, buyer, -a); this.post(r, seller, a);
  this.note(r, buyer, seller, 0, a);
};
// holding gain / reclassification (kind 2) or write-off (kind 3): changes net worth outside saving
Ledger.prototype.revalue = function (r, k, gainer, loser, a, kind) {
  if (!a) return;
  kind = kind || 2;
  this.leg(gainer, k, a, kind); this.leg(loser, k, -a, kind);
  this.oc[gainer] += a; this.oc[loser] -= a;
  this.post(r, gainer, a); this.post(r, loser, -a);
  this.note(r, loser, gainer, 2, a);
};
Ledger.prototype.writeOff = function (r, k, debtor, lender, a) { this.revalue(r, k, debtor, lender, a, 3); };

// Accounting checks (asserted every step): rows sum to 0; for each sector d(net worth) = saving + other
// changes; each instrument sums to 0 across holders (stocks and flows); d(stock) = cash+accrual+reval+write-off.
Ledger.prototype.check = function (open) {
  var r = { row: 0, col: 0, instr: 0, fof: 0, recon: 0 }, bs = this.bs, NR = ROWS.length, s, k, q, t;
  for (q = 0; q < NR; q++) { t = 0; for (s = 0; s < NS; s++) t += this.rows[q * NS + s]; r.row = Math.max(r.row, Math.abs(t)); }
  for (s = 0; s < NS; s++) {
    var sav = 0, dnw = 0;
    for (q = 0; q < NR; q++) if (ROWS[q].saving) sav += this.rows[q * NS + s];
    for (k = 0; k < NI; k++) {
      var j = s * NI + k, d = bs[j] - open[j]; dnw += d;
      r.recon = Math.max(r.recon, Math.abs(d - (this.acc[j * 4] + this.acc[j * 4 + 1] + this.acc[j * 4 + 2] + this.acc[j * 4 + 3])));
    }
    r.col = Math.max(r.col, Math.abs(dnw - sav - this.oc[s]));
  }
  for (k = 0; k < NI; k++) {
    var st = 0, fl = 0;
    for (s = 0; s < NS; s++) { st += bs[s * NI + k]; fl += bs[s * NI + k] - open[s * NI + k]; }
    r.instr = Math.max(r.instr, Math.abs(st)); r.fof = Math.max(r.fof, Math.abs(fl));
  }
  return r;
};
function nwOf(bs, s) { var t = 0; for (var k = 0; k < NI; k++) t += bs[s * NI + k]; return t; }
function pfAssetsOf(bs) { var t = 0; for (var k = 0; k < NI; k++) if (k !== PEN) t += bs[PF * NI + k]; return t; }
