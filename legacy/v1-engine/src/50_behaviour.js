/* ---------------------------------------------------------------- 50_behaviour.js
 * One step (default one month). Order: policy rate -> rates -> wages -> exchange rate, prices, house prices,
 * CPI -> accruals and revaluations -> credit decisions -> investment, exports, fiscal settings ->
 * simultaneous income-expenditure block (Gauss-Seidel on real GDP, nominal GDP and consumption) ->
 * cash postings -> financing (firm loans, bonds, portfolio rules) -> accounting checks -> state updates.
 * Equation tags [En CATEGORY] refer to docs/SPEC.md. Every endogenous variable has one equation.
 * `lev` holds lever settings in model units (fractions, % of GDP, multipliers); see 70_api.js.
 */
function step(s, lev) {
  var p = s.p, b = s.b, dt = p.dt, bs = s.bs, L = s.L, h, k;
  s.open.set(bs); L.begin(bs);
  function g(sec, ins) { return bs[sec * NI + ins]; }
  // ---- opening stocks
  var MNg = [-g(HY, MN), -g(HW, MN)], MIg = [-g(HY, MI), -g(HW, MI)];
  var MNB = g(B, MN), MNPF = g(PF, MN), MIB = g(B, MI), MIPF = g(PF, MI), MNt = MNB + MNPF, MIt = MIB + MIPF;
  var LFD = -g(FD, LOAN), LFX = -g(FX, LOAN), R = g(B, RES), Dtot = -g(B, DEP);
  var Dh = [g(HY, DEP), g(HW, DEP), g(HO, DEP)], DFD = g(FD, DEP), DFX = g(FX, DEP), DPF = g(PF, DEP), DW = g(W, DEP);
  var BB = g(B, BOND), BCB = g(CB, BOND), BPF = g(PF, BOND), BO = g(HO, BOND), BW = g(W, BOND), Btot = -g(G, BOND);
  var BI = g(PF, BONDI), BBP = g(PF, BBOND), FXRs = g(CB, FXR), FAs = g(PF, FA);
  var EW = g(HW, PEN), EO = g(HO, PEN), Et = EW + EO;
  var EB = nwOf(bs, B), RWA = p.rwM * (MNB + MIB) + p.rwL * (LFD + LFX), kap = EB / RWA;
  var APF = pfAssetsOf(bs), NWPF = nwOf(bs, PF), gapL = s.y / b.y - 1;

  // [E1-E3 POLICY] key rate: smoothed rule on expected and actual inflation and the output gap; modes
  s.iS += kf(p.lamPol, dt) * (p.i0 + p.aPi * (s.pie - p.piT) + p.aPiA * (s.pi12 - p.piT) + p.aY * gapL - s.iS);
  var i = Math.max(0, lev.rateMode === 1 ? lev.rateFixed : s.iS + lev.rateAddon), iF = p.iF0 + lev.dIF;   // floor at 0%
  // [E4 BEHAVIOUR] loan premium as bank capital nears its minimum; [E5] rate structure
  var prem = p.sCap * Math.max(0, p.kapT - kap) / (p.kapT - p.kapMin);
  var id = i - p.mD, ib = i + p.sB, il = i + p.sL + prem, imn = i + p.sMN + prem, rmi = p.rMI0 + p.psiIdx * (i - p.i0) + prem;
  var ibb = i + p.sBB, rbi = p.rBI0;
  // [E6 BEHAVIOUR] wage Phillips curve + error correction toward the equilibrium wage share + settlement jump
  s.w *= Math.exp((s.pie + p.phiU * (b.u - s.u) - p.phiW * Math.log(s.w / s.pd)) * dt + lev.wageJump);
  // [E7-E9 BEHAVIOUR] krona: PPP anchor, carry (rate differential), portfolio balance, sentiment
  s.sent = s.sent * Math.exp(-p.lamSent * dt) + lev.sentJump;
  var lnET = Math.log(s.pd / lev.pf) + s.sent - p.betaI * ((i - p.i0) - (iF - p.iF0)) + p.betaH * Math.log(Math.max(0.05, (DW + BW) / (s.pd * b.HW)));
  var ePrev = s.e;
  s.e = Math.exp(Math.log(s.e) + kf(p.lamFX, dt) * (lnET - Math.log(s.e)));
  s.pm += kf(p.lamPm, dt) * (s.e * lev.pf - s.pm);
  // [E10 BEHAVIOUR] domestic prices: markup on smoothed unit cost (labour + imported inputs), pushed by utilisation
  s.uc += kf(p.lamUC, dt) * (p.aLab * s.w + (1 - p.aLab) * s.pm - s.uc);
  s.pd += kf(p.lamP, dt) * (s.uc * (1 + p.eta * gapL) - s.pd);
  // [E11 BEHAVIOUR] real house prices: income, credit flow, real mortgage rate (lagged)
  var Pprev = s.P;
  var lnQT = p.betaHY * Math.log(s.ydH / b.ydH) + p.betaHC * s.nlM / p.Y0 - p.betaHR * (s.rmR - b.rmR);
  s.qh = Math.exp(Math.log(s.qh) + kf(p.lamH, dt) * (lnQT - Math.log(s.qh)));
  var ph = s.qh * Pprev;
  s.phc += kf(p.lamHC, dt) * (ph - s.phc);
  // [E12 IDENTITY] CPI = VAT factor x (domestic + imported) + housing
  var v = p.vat0 + lev.dVat;
  s.P = (1 + v) / (1 + p.vat0) * (p.omD * s.pd + p.omM * s.pm) + p.omH * s.phc;
  s.rer += kf(p.lamRer, dt) * (s.e * lev.pf / s.pd - s.rer);
  var gP = s.P / Pprev - 1;

  // [E13 CONTRACT] CPI indexation: accrued interest capitalised into principal (non-cash)
  var RX = ROW_IX;
  for (h = 0; h < 2; h++) {
    var ix = MIg[h] * gP;
    L.accrue(RX.idx_mort, h, B, MI, ix * MIB / MIt); L.accrue(RX.idx_mort, h, PF, MI, ix * MIPF / MIt);
  }
  L.accrue(RX.idx_bond, G, PF, BONDI, BI * gP);
  // [E14 IDENTITY] revaluation of foreign-currency assets when the krona moves
  var dE = s.e / ePrev - 1;
  L.revalue(RX.rev_fxr, FXR, CB, W, FXRs * dE);
  L.revalue(RX.rev_fa, FA, PF, W, FAs * dE);
  var idxB = (MIg[0] + MIg[1]) * gP * MIB / MIt, idxPF = (MIg[0] + MIg[1]) * gP * MIPF / MIt + BI * gP;

  // [E15-E20] mortgages by borrower group: desired debt, amortisation, DSTI and LTV caps, disbursement
  var th = p.theta, rmR = th * rmi + (1 - th) * (imn - s.pie);
  var annT = th * ann(Math.max(rmi, p.floorI), p.termI) + (1 - th) * ann(Math.max(imn, p.floorN), p.termN);
  var disb = [0, 0], rep = [0, 0], nl = [0, 0], cred = [];
  for (h = 0; h < 2; h++) {
    var M = MNg[h] + MIg[h], inc = s.inc[h];
    var Mstar = b.mR[h] * inc * (1 - p.betaM * (rmR - b.rmR)) * Math.pow(s.qh, p.betaMH);
    rep[h] = M / p.Tm;
    var des = rep[h] + p.lamM * (Mstar - M) + lev.lend * b.lendSh[h];
    var capD = b.nu[h] * inc * (b.dsti[h] + lev.dDsti) / annT;
    var capL = lev.ltv > 0 ? rep[h] + Math.max(0, (lev.ltv + (h === 0 ? 0.05 : 0)) * ph * b.H[h] - M) : Infinity;
    disb[h] = Math.max(0, Math.min(des, capD, capL)); nl[h] = disb[h] - rep[h];
    cred[h] = { desired: des, dstiCap: capD, ltvCap: capL === Infinity ? null : capL, lending: disb[h],
      binding: disb[h] < des - 1e-12 ? (capD <= capL ? 'DSTI' : 'LTV') : 'none' };
  }
  s.cred = cred;
  // [E21 BEHAVIOUR] investment (planning lag): profits, real loan rate, utilisation
  var kI = kf(p.lamInv, dt), rl = il - s.pie;
  s.irFD += kI * (p.iFD0 * (1 + p.betaPi * (s.piFD / b.piFD - 1) - p.betaRI * (rl - b.rl) + p.betaU * gapL) - s.irFD);
  s.irFX += kI * (p.iFX0 * (1 + p.betaPi * (s.piFX / b.piFX - 1) - p.betaRI * (rl - b.rl)) - s.irFX);
  // [E22 BEHAVIOUR] exports by type
  var q = s.rer, fd = lev.fdem;
  var xk = [p.xFish * fd * Math.pow(q, p.eFish), p.xAlu * fd * Math.pow(q, p.eAlu), p.xTour * fd * lev.tour * Math.pow(q, p.eTour), p.xOther * fd * Math.pow(q, p.eOther)];
  var xc = xk[0] + xk[1], x = xc + xk[2] + xk[3], XN = s.e * lev.pf * xc + s.pd * (xk[2] + xk[3]);
  var imX = p.muX * x, xd = p.muXD * x, vaFX = x - imX - xd;
  // [E23 POLICY] government spending channels (real levels) and transfers
  var gs = [p.gHealth + lev.gH, p.gEdu + lev.gE, p.gOther + lev.gO], wsA = [p.wsHealth, p.wsEdu, p.wsOther];
  var NGs = [], NG = 0, vaG = 0, gPur = 0, gServ = 0;
  for (k = 0; k < 3; k++) { NGs[k] = wsA[k] * gs[k] / (1 + p.cEr); NG += NGs[k]; vaG += wsA[k] * gs[k]; gPur += (1 - wsA[k]) * gs[k]; gServ += gs[k]; }
  var gI = p.gInv + lev.gI, inv = s.irFD + s.irFX + gI, rr = p.rr + lev.dRR;
  var trOA = p.trOA + lev.dOA, trFam = p.trFam + lev.dFam;
  var OA = [trOA * p.oaShareY * s.P, trOA * (1 - p.oaShareY - p.oaShareO) * s.P, trOA * p.oaShareO * s.P];
  var FAM = [trFam * p.famShareY * s.P, trFam * (1 - p.famShareY) * s.P, 0];
  // [E24 POLICY] income tax: baseline + lever + slow debt-tied rule (switch)
  s.tauR += kf(p.lamTau, dt) * ((lev.fiscalRule ? p.phiTau * ((Btot + BI) / s.Yn - b.debtR) : 0) - s.tauR);
  var tau = p.tau0 + lev.dTau + s.tauR;
  var kN = kf(p.lamN, dt), NFX = s.NFX + kN * (b.NFX * Math.pow(vaFX / b.vaFX, p.okun) * Math.pow(s.w / s.pd, -p.sigW) - s.NFX);
  // [E25-E27] banks, central bank, pension funds (opening stocks x this month's rates)
  var profB = (imn * MNB + rmi * MIB + il * (LFD + LFX) + ib * BB + i * R - id * Dtot - ibb * BBP) * dt + idxB;
  var divB = (s.pBs - p.lamEq * (p.kapT * RWA - EB)) * dt;
  var profCB = (ib * BCB + p.iFXR * FXRs - i * R) * dt;
  var PAY = p.payout * EO, RE = s.pfInc + p.lamPFnw * (NWPF - b.nwPF * APF);
  var incPFcash = id * DPF + ib * BPF + rbi * BI + imn * MNPF + rmi * MIPF + ibb * BBP + iF * FAs;

  // [E28-E40] simultaneous income-expenditure block, Gauss-Seidel on (y, Yn, C)
  var kC = kf(p.lamC, dt), rgap = (i - s.pie) - p.i0, LCr = 1 + p.cEr + p.css;
  var mint = [imn * MNg[0] + rmi * MIg[0], imn * MNg[1] + rmi * MIg[1], 0];
  var LW = [Dh[0], Dh[1], Dh[2] + BO], PUR = [ph * b.pur[0], ph * b.pur[1], 0], HC = [-PUR[0], -PUR[1], PUR[0] + PUR[1]];
  var NLh = [nl[0], nl[1], 0], aL = [p.aLY, p.aLW, p.aLO], aW = [p.aWY, p.aWW, p.aWO], aH = [p.aHY, p.aHW, p.aHO], c0 = [p.c0Y, p.c0W, p.c0O];
  var rq = Math.pow(s.rer, -p.epsM), imI = p.muI * inv * rq, imG = p.muG * gPur * rq, divBa = divB / dt;
  var rw = Math.pow(s.w / s.pd, -p.sigW);   // real product wage effect on staffing
  function block(y, Yn, Cn) {
    var F = { Ng: [], ug: [], UE: [], gross: [], tax: [], ydl: [], ydk: [], yd: [], Cs: [], divH: [] };
    // [E28 BEHAVIOUR] sector employment follows output (Okun) and the real product wage
    var NFD = s.NFD + kN * (b.NFD * Math.pow((y - vaFX - vaG) / b.vaFD, p.okun) * rw - s.NFD);
    var Ntot = NFD + NFX + NG, dN = Ntot - b.Ntot, U = 0, LFt = 0;
    for (h = 0; h < 3; h++) {                                  // [E29 BEHAVIOUR] employment by age, migration buffer
      F.Ng[h] = b.Ng[h] + b.cyc[h] * dN;
      var emp = F.Ng[h] / b.wb[h], LF = b.LF[h] + lev.mig * (emp - b.emp[h]), Uh = LF - emp;
      F.ug[h] = Uh / LF; U += Uh; LFt += LF; F.UE[h] = rr * s.w * b.wb[h] * Uh;
    }
    F.u = U / LFt; F.NFD = NFD; F.Ntot = Ntot; F.CON = (p.cEr + p.cEe) * s.w * Ntot;
    var VAT = v / (1 + v) * Cn, c = Cn / s.P;                  // [E30-E34] firms' profits, taxes, dividends
    var IMFD = s.pm * (p.muC * c * rq + p.muD * (c + inv + xd) * rq + imI + imG), IMFX = s.pm * imX;
    var PiFD = Cn - VAT + s.pd * (gPur + inv + xd) - IMFD - LCr * s.w * NFD - il * LFD + id * DFD;
    var PiFX = XN - IMFX - s.pd * xd - LCr * s.w * NFX - il * LFX + id * DFX;
    var rhoFD = p.rhoFD0 + p.rhoL * (LFD / Yn - b.lFD), rhoFX = p.rhoFX0 + p.rhoL * (LFX / Yn - b.lFX);
    F.DFD = (1 - rhoFD) * (1 - p.tauF) * PiFD; F.DFX = (1 - rhoFX) * (1 - p.tauF) * PiFX;
    F.VAT = VAT; F.IMFD = IMFD; F.IMFX = IMFX; F.PiFD = PiFD; F.PiFX = PiFX;
    for (h = 0; h < 3; h++) F.divH[h] = b.dFD[h] * F.DFD + b.dFX[h] * F.DFX + b.dB[h] * divBa;
    var Cnew = 0;
    for (h = 0; h < 3; h++) {                                  // [E35-E38 BEHAVIOUR] household income and spending
      F.gross[h] = (1 - p.cEe) * s.w * F.Ng[h] + F.UE[h] + OA[h] + FAM[h] + (h === 2 ? PAY : 0);
      F.tax[h] = tau * F.gross[h];
      F.ydl[h] = F.gross[h] - F.tax[h] - mint[h];
      F.ydk[h] = id * Dh[h] + (h === 2 ? ib * BO : 0) + F.divH[h];
      F.yd[h] = F.ydl[h] + F.ydk[h];
      var cstar = (aL[h] * (F.ydl[h] + HC[h]) + p.aK * (F.ydk[h] - s.pie * LW[h])) * (1 - p.betaC * rgap)
        + c0[h] * s.P + aW[h] * (LW[h] - s.P * b.LW0[h]) + p.aNL * NLh[h] + aH[h] * b.H[h] * (s.qh - 1) * s.P;
      F.Cs[h] = s.C[h] + kC * (cstar - s.C[h]); Cnew += F.Cs[h];
    }
    var cN = Cnew / s.P;                                       // [E39-E40] imports and GDP
    F.im = [p.muC * cN * rq, p.muD * (cN + inv + xd) * rq, imI, imX, imG];
    var im = sum(F.im);
    F.C = Cnew; F.y = cN + gServ + inv + x - im;
    F.Yn = Cnew + (1 + p.cEr) * s.w * NG + s.pd * (gPur + inv) + XN - s.pm * im;
    return F;
  }
  var y = s.y, Yn = s.Yn, Cn = s.C[0] + s.C[1] + s.C[2], F, res, it = 0;
  do { F = block(y, Yn, Cn); res = Math.abs(F.y / y - 1) + Math.abs(F.Yn / Yn - 1) + Math.abs(F.C / Cn - 1); y = F.y; Yn = F.Yn; Cn = F.C; }
  while (res > p.tol && ++it < p.maxIter);
  if (res > p.tol) throw new Error('Gauss-Seidel did not converge at t=' + s.t);
  s.iter = it + 1;

  // ---- current and capital transactions (cash) ------------------------------------------------
  var a = function (z) { return z * dt; };
  for (h = 0; h < 3; h++) L.pay(RX.cons, h, FD, a(F.Cs[h]));
  L.pay(RX.vat, FD, G, a(F.VAT));
  var chan = [RX.g_health, RX.g_edu, RX.g_other];
  for (k = 0; k < 3; k++) {
    var wbk = s.w * NGs[k];
    for (h = 0; h < 3; h++) L.pay(chan[k], G, h, a((1 - p.cEe) * wbk * F.Ng[h] / F.Ntot));
    L.pay(chan[k], G, PF, a((p.cEr + p.cEe) * wbk));
    L.pay(chan[k], G, FD, a(s.pd * (1 - wsA[k]) * gs[k]));
  }
  L.pay(RX.g_inv, G, FD, a(s.pd * gI));
  L.pay(RX.inv, FD, FD, a(s.pd * s.irFD)); L.pay(RX.inv, FX, FD, a(s.pd * s.irFX));
  L.pay(RX.exports, W, FX, a(XN));
  L.pay(RX.inputs, FX, FD, a(s.pd * xd));
  L.pay(RX.imports, FD, W, a(F.IMFD)); L.pay(RX.imports, FX, W, a(F.IMFX));
  var emps = [[FD, F.NFD], [FX, NFX]];
  for (k = 0; k < 2; k++) {
    var j = emps[k][0], wj = s.w * emps[k][1];
    for (h = 0; h < 3; h++) L.pay(RX.wages, j, h, a((1 - p.cEe) * wj * F.Ng[h] / F.Ntot));
    L.pay(RX.pencon, j, PF, a((p.cEr + p.cEe) * wj));
    L.pay(RX.paytax, j, G, a(p.css * wj));
    L.pay(RX.corptax, j, G, a(p.tauF * (j === FD ? F.PiFD : F.PiFX)));
  }
  for (h = 0; h < 3; h++) {
    L.pay(RX.inctax, h, G, a(F.tax[h]));
    L.pay(RX.ben_oa, G, h, a(OA[h])); L.pay(RX.ben_fam, G, h, a(FAM[h])); L.pay(RX.ben_ue, G, h, a(F.UE[h]));
  }
  L.pay(RX.penpay, PF, HO, a(PAY));
  var depo = [[HY, Dh[0]], [HW, Dh[1]], [HO, Dh[2]], [FD, DFD], [FX, DFX], [PF, DPF], [W, DW]];
  for (k = 0; k < depo.length; k++) L.pay(RX.int_dep, B, depo[k][0], a(id * depo[k][1]));
  L.pay(RX.int_res, CB, B, a(i * R));
  for (h = 0; h < 2; h++) {
    L.pay(RX.int_mort, h, B, a(imn * MNg[h] * MNB / MNt + rmi * MIg[h] * MIB / MIt));
    L.pay(RX.int_mort, h, PF, a(imn * MNg[h] * MNPF / MNt + rmi * MIg[h] * MIPF / MIt));
  }
  L.pay(RX.int_loan, FD, B, a(il * LFD)); L.pay(RX.int_loan, FX, B, a(il * LFX));
  var bh = [[B, BB], [CB, BCB], [PF, BPF], [HO, BO], [W, BW]];
  for (k = 0; k < bh.length; k++) L.pay(RX.int_bond, G, bh[k][0], a(ib * bh[k][1]));
  L.pay(RX.int_bondI, G, PF, a(rbi * BI));
  L.pay(RX.int_bbond, B, PF, a(ibb * BBP));
  L.pay(RX.int_fxr, W, CB, a(p.iFXR * FXRs));
  L.pay(RX.int_fa, W, PF, a(iF * FAs));
  for (k = 0; k < NS; k++) {
    if (b.dFD[k]) L.pay(RX.div, FD, k, a(b.dFD[k] * F.DFD));
    if (b.dFX[k]) L.pay(RX.div, FX, k, a(b.dFX[k] * F.DFX));
    if (b.dB[k]) L.pay(RX.div, B, k, b.dB[k] * divB);
  }
  L.pay(RX.cbrem, CB, G, profCB);
  L.pay(RX.homes, HY, HO, a(PUR[0])); L.pay(RX.homes, HW, HO, a(PUR[1]));
  // pension rights (accrued) and retirement reclassification
  L.accrue(RX.penadj, PF, HW, PEN, a(F.CON)); L.accrue(RX.penadj, HO, PF, PEN, a(PAY));
  L.accrue(RX.penret, PF, HW, PEN, a(RE) * EW / Et); L.accrue(RX.penret, PF, HO, PEN, a(RE) * EO / Et);
  L.revalue(RX.ageing, PEN, HO, HW, a(p.ageing * EW));

  // ---- financial transactions ------------------------------------------------------------------
  for (h = 0; h < 2; h++) {
    var dNi = (1 - th) * disb[h], dIi = th * disb[h];
    L.issue(RX.mort_new, h, B, MN, a(dNi * (1 - b.pfShN))); L.issue(RX.mort_new, h, PF, MN, a(dNi * b.pfShN));
    L.issue(RX.mort_new, h, B, MI, a(dIi * (1 - b.pfShI))); L.issue(RX.mort_new, h, PF, MI, a(dIi * b.pfShI));
    var rN = MNg[h] / p.Tm, rI = MIg[h] / p.Tm;
    L.issue(RX.mort_rep, h, B, MN, -a(rN * MNB / MNt)); L.issue(RX.mort_rep, h, PF, MN, -a(rN * MNPF / MNt));
    L.issue(RX.mort_rep, h, B, MI, -a(rI * MIB / MIt)); L.issue(RX.mort_rep, h, PF, MI, -a(rI * MIPF / MIt));
  }
  // [E43 BEHAVIOUR] pension-fund portfolio rules (on assets after this month's flows)
  var Anow = pfAssetsOf(bs), phi = b.phi + lev.pfForeign;
  L.issue(RX.fa_buy, W, PF, FA, kf(p.lamFA, dt) * (phi * Anow - g(PF, FA)));
  L.issue(RX.bbond, B, PF, BBOND, kf(p.lamReb, dt) * (b.bbSh * Anow - g(PF, BBOND)));
  // [E41 IDENTITY] firms borrow to keep target deposits (budget constraint)
  var dLFD = b.depFD * F.Yn - g(FD, DEP), dLFX = b.depFX * F.Yn - g(FX, DEP);
  L.issue(RX.loans, FD, B, LOAN, dLFD); L.issue(RX.loans, FX, B, LOAN, dLFX);
  // [E42 IDENTITY + POLICY] government borrows its cash deficit; the lever decides who buys the new bonds
  var need = b.tga - g(G, TGA), sp = lev.split;
  L.issue(RX.bond_iss, G, B, BOND, sp[0] * need); L.issue(RX.bond_iss, G, CB, BOND, sp[1] * need);
  L.issue(RX.bond_iss, G, PF, BOND, sp[2] * need); L.issue(RX.bond_iss, G, HO, BOND, sp[3] * need);
  // [E44 BEHAVIOUR] non-resident carry demand; pension-fund liquidity and old households' bond share
  // [E45 IDENTITY] deposits, reserves and the Treasury account absorb every payment (settlement buffers)
  L.trade(RX.bond_trade, B, W, BOND, kf(p.lamBW, dt) * (b.bW * F.Yn * (1 + p.psiB * ((i - p.i0) - (iF - p.iF0))) - BW));
  L.trade(RX.bond_trade, B, PF, BOND, kf(p.lamReb, dt) * (g(PF, DEP) - b.dPF * pfAssetsOf(bs)));
  L.trade(RX.bond_trade, B, HO, BOND, kf(p.lamReb, dt) * (b.boSh * (g(HO, DEP) + g(HO, BOND)) - g(HO, BOND)));

  // ---- checks (asserted every step) ------------------------------------------------------------
  var chk = L.check(s.open);
  for (var key in chk) {
    s.maxRes[key] = Math.max(s.maxRes[key], chk[key]);
    if (!(chk[key] <= 1e-9)) throw new Error('accounting check ' + key + ' failed at t=' + s.t + ': ' + chk[key]);
  }
  s.lastRes = chk;

  // ---- state updates: [E47 BEHAVIOUR] expectations, [E48 BEHAVIOUR] smoothed profits and fund income ---------
  var piInst = Math.log(s.P / Pprev) / dt;
  s.pia += kf(p.lamPia, dt) * (piInst - s.pia);
  s.pie = p.chi * p.piT + (1 - p.chi) * s.pia;
  s.hP.push(s.P); var P12 = s.hP.shift(); s.pi12 = s.P / P12 - 1;
  s.piFD += kf(p.lamPi, dt) * ((1 - p.tauF) * F.PiFD / s.P - s.piFD);
  s.piFX += kf(p.lamPi, dt) * ((1 - p.tauF) * F.PiFX / s.P - s.piFX);
  s.pBs += kf(p.lamDivB, dt) * (profB / dt - s.pBs);
  var incPF = incPFcash + b.dFD[PF] * F.DFD + b.dFX[PF] * F.DFX + b.dB[PF] * divBa + idxPF / dt;
  s.pfInc += kf(p.lamPFinc, dt) * (incPF - s.pfInc);
  s.C = F.Cs; s.NFD = F.NFD; s.NFX = NFX; s.y = F.y; s.Yn = F.Yn; s.u = F.u; s.ug = F.ug;
  s.inc = [F.gross[0], F.gross[1]]; s.ydH = sum(F.yd) / s.P; s.nlM = nl[0] + nl[1]; s.rmR = rmR;
  s.t += dt;
  // ---- values the API reports
  s.F = F; s.X = { i: i, il: il, imn: imn, rmi: rmi, id: id, x: x, xk: xk, XN: XN, inv: inv, gI: gI, gServ: gServ, tau: tau, v: v,
    disb: disb, rep: rep, nl: nl, dLF: dLFD + dLFX, ph: ph, profB: profB / dt, PAY: PAY, RE: RE, incPF: incPF, kap: kap, need: need / dt };
  return L;
}
