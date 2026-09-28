/* ---------------------------------------------------------------- 40_steady.js
 * Computed steady state: zero inflation, zero real growth, every stock and flow constant.
 * 1. Targets (data) fix spending, wages, trade, balance sheets; residual stocks close each balance sheet.
 * 2. Each sector's zero-net-lending condition is solved for ONE balancing parameter:
 *    G -> income-tax rate tau0; FD/FX -> retention rhoFD0/rhoFX0; households -> wealth coefficients aW*;
 *    W (current account = 0) -> import share muD; PF -> payout and ageing rates; banks/CB pay out profit.
 * 3. The GDP identity C + G + I + X - IM = 100 is NOT imposed: it is reported as a check (gdpCheck).
 * Returns {p (with solved values), b (baseline normalisers), bs (balance sheet), st (state)}.
 */
function steadyState(p) {
  var b = {}, i = p.i0, id = i - p.mD, ib = i + p.sB, il = i + p.sL, imn = i + p.sMN, rmi = p.rMI0, ibb = i + p.sBB, rbi = p.rBI0, iF = p.iF0;
  var h, k, warn = [];
  // --- public services, wages and employment (wage units: baseline gross wage bill, % of GDP)
  var gs = [p.gHealth, p.gEdu, p.gOther];
  p.wsOther = (p.compG - p.wsHealth * p.gHealth - p.wsEdu * p.gEdu) / p.gOther;
  var wsA = [p.wsHealth, p.wsEdu, p.wsOther], NG = 0, vaG = 0, gPur = 0, gServ = 0;
  for (k = 0; k < 3; k++) { NG += wsA[k] * gs[k] / (1 + p.cEr); vaG += wsA[k] * gs[k]; gPur += (1 - wsA[k]) * gs[k]; gServ += gs[k]; }
  var LCr = 1 + p.cEr + p.css, Wpriv = (p.compTotal - p.compG) / LCr, Ntot = Wpriv + NG;
  var NFX = p.fxEmpShare * Ntot, NFD = Wpriv - NFX;
  p.cEe = p.conTarget / Ntot - p.cEr;
  var pop = [p.popY, p.popW, p.popO], er = [p.erY, p.erW, p.erO], u0 = [p.u0Y, p.u0W, p.u0O], wsh = [p.wshY, p.wshW, p.wshO];
  b.emp = []; b.LF = []; b.Ng = []; b.wb = []; b.cyc = []; b.u0 = u0;
  var U = [], cyc = [p.cycY, p.cycW, p.cycO], den = 0;
  for (h = 0; h < 3; h++) {
    b.emp[h] = pop[h] * er[h]; b.LF[h] = b.emp[h] / (1 - u0[h]); U[h] = b.LF[h] - b.emp[h];
    b.Ng[h] = wsh[h] * Ntot; b.wb[h] = b.Ng[h] / b.emp[h]; den += cyc[h] * b.Ng[h];
  }
  for (h = 0; h < 3; h++) b.cyc[h] = cyc[h] * b.Ng[h] / den;
  p.rr = p.ueTarget / (b.wb[0] * U[0] + b.wb[1] * U[1] + b.wb[2] * U[2]);
  var UE = [0, 1, 2].map(function (h) { return p.rr * b.wb[h] * U[h]; });
  b.u = sum(U) / sum(b.LF);
  // --- trade and investment
  var xc = p.xFish + p.xAlu, XN = xc + p.xTour + p.xOther, imX = p.muX * XN;
  p.muXD = (XN - imX - p.vaFXtarget) / XN;
  var xd = p.muXD * XN, vaFX = XN - imX - xd;
  var inv = p.iFD0 + p.iFX0 + p.gInv;
  var OA = [p.trOA * p.oaShareY, p.trOA * (1 - p.oaShareY - p.oaShareO), p.trOA * p.oaShareO];
  var FAM = [p.trFam * p.famShareY, p.trFam * (1 - p.famShareY), 0];
  // --- balance sheets
  var th = p.theta, M = [p.mortShY * p.mortTot, (1 - p.mortShY) * p.mortTot];
  var MNt = (1 - th) * p.mortTot, MIt = th * p.mortTot, MNB = MNt - p.pfMortN, MIB = MIt - p.pfMortI;
  b.pfShN = p.pfMortN / MNt; b.pfShI = p.pfMortI / MIt;
  var Ltot = p.loanFD + p.loanFX, RWA = p.rwM * (MNB + MIB) + p.rwL * Ltot, EB = p.kapT * RWA;
  var BI = p.govIdxShare * p.govDebt, Bnom = p.govDebt - BI;
  p.bondPF = p.pfGovShare * p.govDebt - BI;
  var BB = Bnom - p.bondPF - p.bondCB - p.bondO - p.bondW;
  var R = p.fxr + p.bondCB - p.tga - p.eqCB;
  var APF = p.pfAssets, FAv = p.pfForeignShare / 100 * APF, DPF = p.pfDepShare * APF;
  var dsh = p.depShY + p.depShW + p.depShO, Dh = [p.hhDep * p.depShY / dsh, p.hhDep * p.depShW / dsh, p.hhDep * p.depShO / dsh];
  var DFD = p.m3 - sum(Dh) - DPF - p.depFX, Dtot = p.m3 + p.depW;
  var NWPF = p.pfNWshare * APF, Et = APF - NWPF, EW = p.eShareW * Et, EO = Et - EW;
  var sF = p.pfEqFDshare;
  p.bbondPF = MNB + MIB + Ltot + BB + R - EB - Dtot;             // bank non-deposit funding closes the bank balance sheet
  var EQPF = APF - FAv - DPF - p.bondPF - BI - p.bbondPF - p.pfMortN - p.pfMortI;
  [['bank government bonds', BB], ['pension-fund nominal government bonds', p.bondPF], ['bank bonds held by pension funds', p.bbondPF],
    ['pension-fund domestic equity', EQPF], ['domestic-firm deposits', DFD], ['bank reserves', R]].forEach(function (x) {
    if (!(x[1] > 0)) warn.push('residual ' + x[0] + ' is not positive: ' + x[1].toFixed(2));
  });
  // --- interest-driven flows (baseline rates, prices = 1)
  var profB = imn * MNB + rmi * MIB + il * Ltot + ib * BB + i * R - id * Dtot - ibb * p.bbondPF;
  var profCB = ib * p.bondCB + p.iFXR * p.fxr - i * R;
  var incPF0 = id * DPF + ib * p.bondPF + rbi * BI + imn * p.pfMortN + rmi * p.pfMortI + ibb * p.bbondPF + iF * FAv;
  // --- firms (FD profit from the income side with Y = 100: this is what makes gdpCheck a real check)
  var VAT = p.vatTarget, PiFX = XN - imX - xd - LCr * NFX - il * p.loanFX + id * p.depFX;
  var PiFD = p.Y0 - vaG - vaFX - VAT - LCr * NFD - il * p.loanFD + id * DFD;
  p.tauF = p.citTarget / (PiFD + PiFX);
  var DIVFD = (1 - p.tauF) * PiFD - p.iFD0, DIVFX = (1 - p.tauF) * PiFX - p.iFX0;
  p.rhoFD0 = p.iFD0 / ((1 - p.tauF) * PiFD); p.rhoFX0 = p.iFX0 / ((1 - p.tauF) * PiFX);
  // payout shares of distributed profit (dividends and owners' income)
  p.divFXW = Math.min(0.9, p.fdiTarget / DIVFX);
  b.dFD = new Float64Array(NS); b.dFX = new Float64Array(NS); b.dB = new Float64Array(NS);
  b.dFD[HY] = p.divFDY; b.dFD[HW] = p.divFDW; b.dFD[HO] = p.divFDO; b.dFD[PF] = 1 - p.divFDY - p.divFDW - p.divFDO;
  b.dFX[W] = p.divFXW; b.dFX[HW] = (1 - p.divFXW) * p.divFXdomW; b.dFX[HO] = (1 - p.divFXW) * 0.15; b.dFX[PF] = (1 - p.divFXW) * (0.85 - p.divFXdomW);
  b.dB[G] = p.divBshG; b.dB[PF] = p.divBshPF; b.dB[HW] = p.divBshW; b.dB[HO] = 1 - p.divBshG - p.divBshPF - p.divBshW;
  if (!(DIVFD > 0 && DIVFX > 0)) warn.push('baseline dividends not positive: FD ' + DIVFD.toFixed(2) + ', FX ' + DIVFX.toFixed(2));
  // --- pension funds: returns credited = income, rights stocks constant
  var incPF = incPF0 + b.dFD[PF] * DIVFD + b.dFX[PF] * DIVFX + b.dB[PF] * profB;
  var CON = p.conTarget, PAY = CON + incPF;
  p.payout = PAY / EO; p.ageing = (CON + incPF * EW / Et) / EW;
  // --- government: balanced budget -> tau0
  var gross = [], taxBase = 0;
  for (h = 0; h < 3; h++) { gross[h] = (1 - p.cEe) * b.Ng[h] + UE[h] + OA[h] + FAM[h] + (h === 2 ? PAY : 0); taxBase += gross[h]; }
  var Gspend = (1 + p.cEr) * NG + gPur + p.gInv + p.trOA + p.trFam + sum(UE) + ib * Bnom + rbi * BI;
  var Grev0 = VAT + p.tauF * (PiFD + PiFX) + p.css * Wpriv + profCB + b.dB[G] * profB;
  p.tau0 = (Gspend - Grev0) / taxBase;
  // --- households: cash budgets balance -> consumption -> wealth coefficients
  var mint = [imn * (1 - th) * M[0] + rmi * th * M[0], imn * (1 - th) * M[1] + rmi * th * M[1], 0];
  var divH = [0, 1, 2].map(function (h) { return b.dFD[h] * DIVFD + b.dFX[h] * DIVFX + b.dB[h] * profB; });
  var HC = [-p.purY, -p.purW, p.purY + p.purW], LW = [Dh[0], Dh[1], Dh[2] + p.bondO];
  var ydl = [], ydk = [], C = [], aL = [p.aLY, p.aLW, p.aLO], c0k = ['c0Y', 'c0W', 'c0O'];
  b.LW0 = LW.slice();
  for (h = 0; h < 3; h++) {
    ydl[h] = gross[h] * (1 - p.tau0) - mint[h];
    ydk[h] = id * Dh[h] + (h === 2 ? ib * p.bondO : 0) + divH[h];
    C[h] = ydl[h] + ydk[h] + HC[h];
    p[c0k[h]] = C[h] - aL[h] * (ydl[h] + HC[h]) - p.aK * ydk[h];
    if (!(p[c0k[h]] > 0)) warn.push(c0k[h] + ' is not positive: ' + p[c0k[h]].toFixed(4));
  }
  var Ctot = sum(C);
  p.vat0 = VAT / (Ctot - VAT);
  // --- rest of world: current account = 0 -> imports -> muD
  var IM = XN + p.iFXR * p.fxr + iF * FAv - id * p.depW - ib * p.bondW - b.dFX[W] * DIVFX;
  p.muD = (IM - p.muC * Ctot - p.muI * inv - imX - p.muG * gPur) / (Ctot + inv + xd);
  if (!(p.muD > 0)) warn.push('muD is not positive: ' + p.muD.toFixed(4));
  var gdpCheck = Ctot + vaG + gPur + inv + XN - IM - p.Y0;
  // --- mortgages: desired stock = actual, DSTI cap slack at capUse0
  var rmR = th * rmi + (1 - th) * imn, annT = th * ann(Math.max(rmi, p.floorI), p.termI) + (1 - th) * ann(Math.max(imn, p.floorN), p.termN);
  b.dsti = [p.dstiY, p.dstiW];
  p.mRY = M[0] / gross[0]; p.mRW = M[1] / gross[1];
  p.nuY = (M[0] / p.Tm) / (p.capUse0 * gross[0] * p.dstiY / annT); p.nuW = (M[1] / p.Tm) / (p.capUse0 * gross[1] * p.dstiW / annT);
  b.mR = [p.mRY, p.mRW]; b.nu = [p.nuY, p.nuW]; b.rmR = rmR; b.lendSh = [M[0] / p.mortTot, M[1] / p.mortTot];
  b.pur = [p.purY, p.purW]; b.H = [p.house0 * p.hshY, p.house0 * p.hshW, p.house0 * (1 - p.hshY - p.hshW)];
  // --- baseline normalisers used by behavioural equations
  b.y = Ctot + gServ + inv + XN - IM; b.Yn = p.Y0; b.NFD = NFD; b.NFX = NFX; b.Ntot = Ntot; b.vaFX = vaFX; b.vaFD = b.y - vaFX - vaG;
  b.piFD = (1 - p.tauF) * PiFD; b.piFX = (1 - p.tauF) * PiFX; b.rl = il;
  b.lFD = p.loanFD / p.Y0; b.lFX = p.loanFX / p.Y0; b.depFD = DFD / p.Y0; b.depFX = p.depFX / p.Y0;
  b.HW = p.depW + p.bondW; b.bW = p.bondW / p.Y0; b.debtR = p.govDebt / p.Y0; b.tga = p.tga;
  b.phi = FAv / APF; b.bbSh = p.bbondPF / APF; b.dPF = DPF / APF; b.nwPF = NWPF / APF; b.boSh = p.bondO / (Dh[2] + p.bondO);
  b.ydH = sum(ydl) + sum(ydk);
  b.gdpCheck = gdpCheck; b.warnings = warn;
  b.flows = { divFD: DIVFD, divFX: DIVFX, divForeign: b.dFX[W] * DIVFX, xd: xd, C: Ctot, Cg: C, IM: IM, VAT: VAT, PiFD: PiFD, PiFX: PiFX, profB: profB, profCB: profCB, incPF: incPF, PAY: PAY, CON: CON,
    incomeTax: p.tau0 * taxBase, corpTax: p.tauF * (PiFD + PiFX), payTax: p.css * Wpriv, govInterest: ib * Bnom + rbi * BI, investment: inv, exports: XN,
    gServ: gServ, ydl: ydl, ydk: ydk, gross: gross, UE: UE };
  // --- balance sheet
  var bs = new Float64Array(NS * NI);
  function put(k, holder, issuer, v) { bs[holder * NI + k] += v; bs[issuer * NI + k] -= v; }
  for (h = 0; h < 2; h++) { put(MN, B, h, (1 - th) * M[h] * (1 - b.pfShN)); put(MN, PF, h, (1 - th) * M[h] * b.pfShN);
    put(MI, B, h, th * M[h] * (1 - b.pfShI)); put(MI, PF, h, th * M[h] * b.pfShI); }
  put(LOAN, B, FD, p.loanFD); put(LOAN, B, FX, p.loanFX);
  put(BOND, B, G, BB); put(BOND, CB, G, p.bondCB); put(BOND, PF, G, p.bondPF); put(BOND, HO, G, p.bondO); put(BOND, W, G, p.bondW);
  put(BONDI, PF, G, BI); put(BBOND, PF, B, p.bbondPF);
  [[PF, EQPF], [HY, p.eqHY], [HW, p.eqHW], [HO, p.eqHO]].forEach(function (z) { put(EQ, z[0], FD, sF * z[1]); put(EQ, z[0], FX, (1 - sF) * z[1]); });
  put(EQ, W, FX, p.eqW);
  put(FXR, CB, W, p.fxr); put(FA, PF, W, FAv); put(RES, B, CB, R); put(TGA, G, CB, p.tga);
  put(DEP, HY, B, Dh[0]); put(DEP, HW, B, Dh[1]); put(DEP, HO, B, Dh[2]); put(DEP, FD, B, DFD); put(DEP, FX, B, p.depFX);
  put(DEP, PF, B, DPF); put(DEP, W, B, p.depW); put(PEN, HW, PF, EW); put(PEN, HO, PF, EO);
  // --- initial state (all lagged states at their steady-state values)
  var st = { t: 0, w: 1, uc: 1, pd: 1, pm: 1, e: 1, P: 1, qh: 1, phc: 1, rer: 1, iS: p.i0, pia: 0, pie: 0, pi12: 0, sent: 0, tauR: 0,
    y: b.y, Yn: p.Y0, C: C.slice(), NFD: NFD, NFX: NFX, irFD: p.iFD0, irFX: p.iFX0, piFD: b.piFD, piFX: b.piFX,
    pBs: profB, pfInc: incPF, inc: [gross[0], gross[1]], ydH: b.ydH, nlM: 0, rmR: rmR, u: b.u, ug: u0.slice() };
  return { p: p, b: b, bs: bs, st: st };
}
