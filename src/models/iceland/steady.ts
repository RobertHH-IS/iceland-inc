/**
 * Iceland Inc.: the closed-form steady state, ported from engine v1 (legacy/v1-engine/src/40_steady.js).
 *
 * Zero inflation and zero real growth, so every stock and flow is constant.
 *   1. Data fix spending, wages, trade and balance sheets; residual stocks close each balance sheet
 *      (domestic firms' deposits give M3, bank bonds close the bank, banks hold the government
 *      bonds nobody else does, pension funds' domestic shares make their assets 179.7% of GDP,
 *      reserves close the central bank, bank equity = 22% of risk-weighted assets).
 *   2. Each sector's zero net lending is solved for ONE balancing parameter: the government for the
 *      income-tax rate tau0, firms for their retention ratios, households for their autonomous
 *      spending c0, the rest of the world (current account = 0) for the import share muD, pension
 *      funds for the payout and retirement rates; banks and the central bank pay out their profit.
 *   3. Behavioural normalisers are set to baseline quantities (desired mortgage ratios, the
 *      debt-service cap slack, deposit targets, portfolio shares, baseline profits).
 *   4. GDP = C + G + I + X − IM = 100 is NOT imposed: it comes out of the income side, and a
 *      module test checks it.
 *
 * `steadyState(p)` returns the solved and derived parameters, every stock position and the
 * baseline value of every variable with a past (and of the simultaneous block), which the
 * kernel then polishes with Newton (SteadyStateSpec.solve).
 */
import type { Id, ParamDef, Provenance } from '../../core/types.ts';
import { INPUT_PARAMS, INPUT_VALUES } from './params.ts';
import { annuity, derived, DOMESTIC, EXPORTERS, FIRMS, FIRM_NAME, solved, sum, type Exporter, type Firm } from './util.ts';

export interface IcelandSteadyState {
  params: Record<Id, number>;
  stocks: [Id, Id, number][];
  vars: Record<Id, number>;
  /** Data targets the Newton polish must keep (read by the steady-state targets). */
  targets: Record<Id, number>;
  /** C + G + I + X − IM − 100, not imposed (v1's gdpCheck). */
  gdpCheck: number;
  warnings: string[];
}

export function steadyState(p: Record<Id, number>): IcelandSteadyState {
  const warn: string[] = [];
  const o: Record<Id, number> = {}; // solved and derived parameters
  const v: Record<Id, number> = {}; // variables
  const i = p.i0,
    id = Math.max(0, i - p.mD), // the deposit rate's floor (banks.ts)
    ib = i + p.sB,
    il = i + p.sL,
    imn = i + p.sMN,
    rmi = p.rMI0,
    ibb = i + p.sBB,
    rbi = p.rBI0,
    iF = p.iF0;

  /* ------------------------------------ public services, wages, employment */
  const gs = [p.gHealth, p.gEdu, p.gOther];
  o.wsOther = (p.compG - p.wsHealth * p.gHealth - p.wsEdu * p.gEdu) / p.gOther;
  const wsA = [p.wsHealth, p.wsEdu, o.wsOther];
  // Public compensation (compG, national accounts D.1) includes the employer pension contribution
  // and the payroll tax, like private compensation, so both are divided by the same labour-cost
  // factor. The government pays the payroll tax on its own staff to itself: it is left out of the
  // cash budget on both sides (Gspend counts (1 + cEr) × NG; revenue counts css on private wages).
  const LCr = 1 + p.cEr + p.css;
  const NGk = gs.map((g, k) => (wsA[k] * g) / LCr);
  const NG = sum(NGk);
  const vaG = sum(gs.map((g, k) => wsA[k] * g));
  const gPur = sum(gs.map((g, k) => (1 - wsA[k]) * g));
  const gServ = sum(gs);
  const Wpriv = (p.compTotal - p.compG) / LCr;
  const Ntot = Wpriv + NG;
  // Firms by sector (decision 0003): each sector's wage bill is its compensation of employees ÷ the
  // labour-cost factor; retail and services employ the rest of the private wage bill.
  const N = { FC: p.compFC / LCr, XF: p.compXF / LCr, XA: p.compXA / LCr, XT: p.compXT / LCr, XO: p.compXO / LCr } as Record<Firm, number>;
  N.FR = Wpriv - N.FC - sum(EXPORTERS.map((j) => N[j]));
  if (!(N.FR > 0)) warn.push(`retail and services' wage bill is not positive: ${N.FR.toFixed(2)}`);
  o.cEe = p.conTarget / Ntot - p.cEr;
  const G3 = ['Y', 'W', 'O'] as const;
  const pop = [p.popY, p.popW, p.popO],
    er = [p.erY, p.erW, p.erO],
    u0 = [p.u0Y, p.u0W, p.u0O],
    wsh = [p.wshY, p.wshW, p.wshO],
    cyc = [p.cycY, p.cycW, p.cycO];
  const emp = pop.map((x, h) => x * er[h]);
  const LF = emp.map((e, h) => e / (1 - u0[h]));
  const U = LF.map((l, h) => l - emp[h]);
  const Ng = wsh.map((w) => w * Ntot);
  const wb = Ng.map((n, h) => n / emp[h]);
  const den = sum(cyc.map((c, h) => c * Ng[h]));
  o.rr = p.ueTarget / sum(wb.map((w, h) => w * U[h]));
  const UE = wb.map((w, h) => o.rr * w * U[h]);
  G3.forEach((g, h) => {
    o[`emp0${g}`] = emp[h];
    o[`U0${g}`] = U[h];
    o[`Ng0${g}`] = Ng[h];
    o[`wb${g}`] = wb[h];
    o[`cycSh${g}`] = (cyc[h] * Ng[h]) / den;
  });
  o.uBase = sum(U) / sum(LF);
  o.Ntot0 = Ntot;
  for (const j of FIRMS) o[`N${j}0`] = N[j];

  /* ------------------------------------------------ trade and investment */
  // Each exporter sells one export line; its imported inputs are a data or assumed share, other
  // exporters take what is left of the TiVA import content of all exports, and each sector's
  // domestic inputs (bought from retail and services) close the gap to its value added.
  const x: Record<Exporter, number> = { XF: p.xFish, XA: p.xAlu, XT: p.xTour, XO: p.xOther };
  const XN = sum(EXPORTERS.map((j) => x[j]));
  const imX = p.muX * XN;
  o.mXO = (imX - p.mXF * x.XF - p.mXA * x.XA - p.mXT * x.XT) / x.XO;
  if (!(o.mXO > 0 && o.mXO < 1)) warn.push(`other exporters' import share is outside (0, 1): ${o.mXO.toFixed(3)}`);
  const m: Record<Exporter, number> = { XF: p.mXF, XA: p.mXA, XT: p.mXT, XO: o.mXO };
  const gva: Record<Firm, number> = { FC: p.gvaFC, FR: 0, XF: p.gvaXF, XA: p.gvaXA, XT: p.gvaXT, XO: p.gvaXO };
  for (const j of EXPORTERS) {
    o[`d${j}`] = (x[j] - m[j] * x[j] - gva[j]) / x[j];
    if (!(o[`d${j}`] > 0)) warn.push(`${FIRM_NAME[j]}' domestic-input share is not positive: ${o[`d${j}`].toFixed(3)}`);
  }
  const xd = sum(EXPORTERS.map((j) => o[`d${j}`] * x[j]));
  const vaFX = sum(EXPORTERS.map((j) => gva[j]));
  const inv = p.iFD0 + p.iFX0 + p.gInv;
  const i0: Record<Firm, number> = {
    FC: p.iFD0 * p.invShareFC,
    FR: p.iFD0 * (1 - p.invShareFC),
    XF: p.iFX0 * p.invShareXF,
    XA: p.iFX0 * p.invShareXA,
    XT: p.iFX0 * p.invShareXT,
    XO: p.iFX0 * (1 - p.invShareXF - p.invShareXA - p.invShareXT),
  };
  for (const j of FIRMS) o[`i${j}0`] = i0[j];
  const OA = [p.trOA * p.oaShareY, p.trOA * (1 - p.oaShareY - p.oaShareO), p.trOA * p.oaShareO];
  const FAM = [p.trFam * p.famShareY, p.trFam * (1 - p.famShareY), 0];

  /* -------------------------------------------------------- balance sheets */
  const th = p.theta;
  const M = [p.mortShY * p.mortTot, (1 - p.mortShY) * p.mortTot];
  const MNt = (1 - th) * p.mortTot,
    MIt = th * p.mortTot;
  const MNB = MNt - p.pfMortN,
    MIB = MIt - p.pfMortI;
  o.pfShN = p.pfMortN / MNt;
  o.pfShI = p.pfMortI / MIt;
  const Ltot = p.loanTotal;
  const loan: Record<Firm, number> = { FC: p.loanShareFC * Ltot, FR: 0, XF: p.loanShareXF * Ltot, XA: p.loanShareXA * Ltot, XT: p.loanShareXT * Ltot, XO: p.loanShareXO * Ltot };
  loan.FR = Ltot - sum(FIRMS.filter((j) => j !== 'FR').map((j) => loan[j]));
  const RWA = p.rwM * (MNB + MIB) + p.rwL * Ltot;
  const EB = p.kapT * RWA;
  const BI = p.govIdxShare * p.govDebt;
  const Bnom = p.govDebt - BI;
  const bondPF = p.pfGovShare * p.govDebt - BI;
  const BB = Bnom - bondPF - p.bondCB - p.bondO - p.bondW;
  const R = p.fxr + p.bondCB - p.tga - p.eqCB;
  const APF = p.pfAssets;
  const FAv = (p.pfForeignShare / 100) * APF;
  const DPF = p.pfDepShare * APF;
  const dsh = p.depShY + p.depShW + p.depShO;
  const Dh = [(p.hhDep * p.depShY) / dsh, (p.hhDep * p.depShW) / dsh, (p.hhDep * p.depShO) / dsh];
  const DFD = p.m3 - sum(Dh) - DPF - p.depFX;
  const dep: Record<Firm, number> = { FC: p.depShareFC * DFD, FR: (1 - p.depShareFC) * DFD, XF: 0, XA: 0, XT: 0, XO: 0 };
  for (const j of EXPORTERS) dep[j] = (p.depFX * x[j]) / XN;
  const Dtot = p.m3 + p.depW;
  const NWPF = p.pfNWshare * APF;
  const Et = APF - NWPF;
  const EW = p.eShareW * Et;
  const EO = Et - EW;
  const sF = p.pfEqFDshare;
  const bbondPF = MNB + MIB + Ltot + BB + R - EB - Dtot; // bank bonds close the bank balance sheet
  const EQPF = APF - FAv - DPF - bondPF - BI - bbondPF - p.pfMortN - p.pfMortI;
  for (const [what, x] of [
    ['bank government bonds', BB],
    ['pension-fund nominal government bonds', bondPF],
    ['bank bonds held by pension funds', bbondPF],
    ['pension-fund domestic equity', EQPF],
    ['domestic-firm deposits', DFD],
    ['retail and service firms’ loans', loan.FR],
    ['bank reserves', R],
  ] as const)
    if (!(x > 0)) warn.push(`residual ${what} is not positive: ${x.toFixed(2)}`);

  /* ------------------------------------------------- interest-driven flows */
  const profB = imn * MNB + rmi * MIB + il * Ltot + ib * BB + i * R - id * Dtot - ibb * bbondPF;
  const profCB = ib * p.bondCB + p.iFXR * p.fxr - i * R;
  const incPF0 = id * DPF + ib * bondPF + rbi * BI + imn * p.pfMortN + rmi * p.pfMortI + ibb * bbondPF + iF * FAv;

  /* ------------------------------ firms: profits from the income side, Y = 100 */
  // Five sectors' value added is data; retail and services' is what is left of GDP after the
  // public sector, the other five and VAT (which shops collect).
  const VAT = p.vatTarget;
  gva.FR = p.Y0 - vaG - p.gvaFC - vaFX;
  const Pi = {} as Record<Firm, number>;
  for (const j of FIRMS) Pi[j] = gva[j] - (j === 'FR' ? VAT : 0) - LCr * N[j] - il * loan[j] + id * dep[j];
  o.tauF = p.citTarget / sum(FIRMS.map((j) => Pi[j]));
  const PiAT = {} as Record<Firm, number>;
  const DIV = {} as Record<Firm, number>;
  for (const j of FIRMS) {
    PiAT[j] = (1 - o.tauF) * Pi[j];
    DIV[j] = PiAT[j] - i0[j];
    o[`pi${j}0`] = PiAT[j];
    if (j !== 'XA') o[`rho${j}0`] = i0[j] / PiAT[j];
    if (!(DIV[j] > 0)) warn.push(`baseline dividends of ${FIRM_NAME[j]} not positive: ${DIV[j].toFixed(3)}`);
  }
  // Who owns what: domestic firms pay households and pension funds; fisheries are domestically
  // owned; the smelters wholly abroad; tourism and other exporters partly. Other exporters' foreign
  // share makes baseline dividends abroad match the data (fdiTarget).
  o.divXOW = (p.fdiTarget - DIV.XA - p.divXTW * DIV.XT) / DIV.XO;
  if (!(o.divXOW >= 0 && o.divXOW <= 0.9)) warn.push(`other exporters' foreign dividend share outside [0, 0.9]: ${o.divXOW.toFixed(3)}`);
  const dFD = { HY: p.divFDY, HW: p.divFDW, HO: p.divFDO, PF: 1 - p.divFDY - p.divFDW - p.divFDO, W: 0 };
  const dX = (w: number) => ({ HY: 0, W: w, HW: (1 - w) * p.divFXdomW, HO: (1 - w) * p.divFXdomO, PF: (1 - w) * (1 - p.divFXdomW - p.divFXdomO) });
  const dShare: Record<Firm, Record<'HY' | 'HW' | 'HO' | 'PF' | 'W', number>> = {
    FC: dFD,
    FR: dFD,
    XF: dX(0),
    XA: { HY: 0, HW: 0, HO: 0, PF: 0, W: 1 },
    XT: dX(p.divXTW),
    XO: dX(o.divXOW),
  };
  const divTo = (h: 'HY' | 'HW' | 'HO' | 'PF' | 'W') => sum(FIRMS.map((j) => dShare[j][h] * DIV[j]));
  const dB = { G: p.divBshG, PF: p.divBshPF, HW: p.divBshW, HO: 1 - p.divBshG - p.divBshPF - p.divBshW };

  /* ------------------- pension funds: returns credited = income, rights constant */
  const incPF = incPF0 + divTo('PF') + dB.PF * profB;
  const CON = p.conTarget;
  const PAY = CON + incPF;
  o.payout = PAY / EO;
  o.ageing = (CON + (incPF * EW) / Et) / EW;

  /* ------------------------------------ government: balanced budget -> tau0 */
  // Only the taxable share of family benefits is taxable income; the rest reaches households untaxed.
  const gross = G3.map((_, h) => (1 - o.cEe) * Ng[h] + UE[h] + OA[h] + p.famTaxableShare * FAM[h] + (h === 2 ? PAY : 0));
  const taxBase = sum(gross);
  const Gspend = (1 + p.cEr) * NG + gPur + p.gInv + p.trOA + p.trFam + sum(UE) + ib * Bnom + rbi * BI;
  const Grev0 = VAT + o.tauF * sum(FIRMS.map((j) => Pi[j])) + p.css * Wpriv + profCB + dB.G * profB;
  o.tau0 = (Gspend - Grev0) / taxBase;

  /* ---------------------- households: cash budgets balance -> spending -> c0 */
  const mint = [imn * (1 - th) * M[0] + rmi * th * M[0], imn * (1 - th) * M[1] + rmi * th * M[1], 0];
  const divHv = [divTo('HY'), divTo('HW') + dB.HW * profB, divTo('HO') + dB.HO * profB];
  const HC = [-p.purY, -p.purW, p.purY + p.purW];
  const LW = [Dh[0], Dh[1], Dh[2] + p.bondO];
  const aL = [p.aLY, p.aLW, p.aLO];
  const ydl: number[] = [],
    ydk: number[] = [],
    C: number[] = [];
  G3.forEach((g, h) => {
    ydl[h] = gross[h] * (1 - o.tau0) + (1 - p.famTaxableShare) * FAM[h] - mint[h];
    ydk[h] = id * Dh[h] + (h === 2 ? ib * p.bondO : 0) + divHv[h];
    C[h] = ydl[h] + ydk[h] + HC[h];
    o[`c0${g}`] = C[h] - aL[h] * (ydl[h] + HC[h]) - p.aK * ydk[h];
    if (!(o[`c0${g}`] > 0)) warn.push(`c0${g} is not positive: ${o[`c0${g}`].toFixed(4)}`);
    o[`LW0${g}`] = LW[h];
  });
  const Ctot = sum(C);
  o.vat0 = VAT / (Ctot - VAT);

  /* ------------------------- rest of world: current account = 0 -> imports -> muD */
  const divW = divTo('W');
  const IM = XN + p.iFXR * p.fxr + iF * FAv - id * p.depW - ib * p.bondW - divW;
  o.muD = (IM - p.muC * Ctot - p.muI * inv - imX - p.muG * gPur) / (Ctot + inv + xd);
  if (!(o.muD > 0)) warn.push(`muD is not positive: ${o.muD.toFixed(4)}`);
  const gdpCheck = Ctot + vaG + gPur + inv + XN - IM - p.Y0;

  /* ------------------- construction: what builders buy from retail and service firms */
  // Builders sell all investment goods and home repairs (net of VAT); after imported equipment and
  // inputs, their purchases from retail and services close the gap to their value added (data).
  const salesFC = inv + p.maintShare * (Ctot - VAT);
  const imFC = o.muD * (inv + p.maintShare * Ctot);
  o.dFC = (salesFC - p.muI * inv - imFC - p.gvaFC) / salesFC;
  if (!(o.dFC > 0)) warn.push(`construction's domestic-input share is not positive: ${o.dFC.toFixed(3)}`);

  /* --------------------- mortgages: desired stock = actual, debt-service cap slack */
  const rmR = th * rmi + (1 - th) * imn;
  const annT = th * annuity(Math.max(rmi, p.floorI), p.termI) + (1 - th) * annuity(Math.max(imn, p.floorN), p.termN);
  // Mortgage rules read income with the tax-free family benefits, which are not in gross (taxable) income.
  const taxFree = FAM.map((f) => (1 - p.famTaxableShare) * f);
  o.mRY = M[0] / (gross[0] + taxFree[0]);
  o.mRW = M[1] / (gross[1] + taxFree[1]);
  // the debt-service cap is set on income after income tax (Rules 1300/2025: disposable income)
  const afterTax = G3.map((_, h) => gross[h] * (1 - o.tau0) + taxFree[h]);
  o.nuY = M[0] / p.Tm / ((p.capUse0 * afterTax[0] * p.dstiY) / annT);
  o.nuW = M[1] / p.Tm / ((p.capUse0 * afterTax[1] * p.dstiW) / annT);
  o.rmR0 = rmR;
  o.lendShY = M[0] / p.mortTot;
  o.lendShW = M[1] / p.mortTot;
  const H = [p.house0 * p.hshY, p.house0 * p.hshW, p.house0 * (1 - p.hshY - p.hshW)];
  G3.forEach((g, h) => (o[`H0${g}`] = H[h]));
  o.homeAgeingRateY = p.purY / H[0];
  o.homeAgeingRateW = (p.purY + p.purW) / H[1];

  /* ------------------------------------------------ baseline normalisers */
  const y = Ctot + gServ + inv + XN - IM;
  o.potentialOutput = y;
  o.vaFR0 = y - vaG - p.gvaFC - vaFX;
  o.rl0 = il;
  for (const j of FIRMS) {
    o[`l${j}0`] = loan[j] / p.Y0;
    o[`dep${j}0`] = dep[j] / p.Y0;
  }
  o.krona0 = p.depW + p.bondW;
  o.bW0 = p.bondW / p.Y0;
  o.debtR0 = p.govDebt / p.Y0;
  o.pfForeignTarget = FAv / APF;
  o.bbSh0 = bbondPF / APF;
  o.dPF0 = DPF / APF;
  o.nwPF0 = NWPF / APF;
  o.boSh0 = p.bondO / (Dh[2] + p.bondO);
  const ydH = sum(ydl) + sum(ydk);
  o.ydH0 = ydH;

  /* ------------------------------------------------------- stock positions */
  const stocks: [Id, Id, number][] = [];
  const put = (ins: Id, pl: Id, x: number) => stocks.push([ins, pl, x]);
  // deposits (the bank's liability is filled in by the kernel)
  put('deposits', 'HY', Dh[0]);
  put('deposits', 'HW', Dh[1]);
  put('deposits', 'HO', Dh[2]);
  for (const j of FIRMS) put('deposits', j, dep[j]);
  put('deposits', 'PF', DPF);
  put('deposits', 'W', p.depW);
  put('reserves', 'B', R);
  put('treasuryAccount', 'G', p.tga);
  // mortgages: two borrowers and two lenders, so every position is listed
  put('mortgagesN', 'HY', (1 - th) * M[0]);
  put('mortgagesN', 'HW', (1 - th) * M[1]);
  put('mortgagesN', 'B', MNB);
  put('mortgagesN', 'PF', p.pfMortN);
  put('mortgagesI', 'HY', th * M[0]);
  put('mortgagesI', 'HW', th * M[1]);
  put('mortgagesI', 'B', MIB);
  put('mortgagesI', 'PF', p.pfMortI);
  for (const j of FIRMS) put('businessLoans', j, loan[j]);
  put('govBonds', 'B', BB);
  put('govBonds', 'CB', p.bondCB);
  put('govBonds', 'PF', bondPF);
  put('govBonds', 'HO', p.bondO);
  put('govBonds', 'W', p.bondW);
  put('indexedBonds', 'PF', BI);
  put('bankBonds', 'PF', bbondPF);
  // shares at book value: six issuers, five holders. Domestic equity goes sF to domestic firms and
  // the rest, with foreign equity, to exporters; within each group each sector's book equity is in
  // proportion to its net assets (deposits + capital − bank loans), so no sector starts insolvent.
  const eqDom = EQPF + p.eqHY + p.eqHW + p.eqHO;
  const netAssets = (j: Firm) => dep[j] + i0[j] / p.depreciationRate - loan[j];
  const naD = sum(DOMESTIC.map(netAssets)),
    naX = sum(EXPORTERS.map(netAssets));
  for (const j of DOMESTIC) put('shares', j, (sF * eqDom * netAssets(j)) / naD);
  for (const j of EXPORTERS) put('shares', j, (((1 - sF) * eqDom + p.eqW) * netAssets(j)) / naX);
  put('shares', 'PF', EQPF);
  put('shares', 'HY', p.eqHY);
  put('shares', 'HW', p.eqHW);
  put('shares', 'HO', p.eqHO);
  put('shares', 'W', p.eqW);
  put('fxReserves', 'CB', p.fxr);
  put('foreignAssets', 'PF', FAv);
  put('pensionRights', 'HW', EW);
  put('pensionRights', 'HO', EO);
  put('homes', 'HY', H[0]);
  put('homes', 'HW', H[1]);
  put('homes', 'HO', H[2]);
  for (const j of FIRMS) put('capital', j, i0[j] / p.depreciationRate);

  /* ------------------------------------------------ baseline variables */
  // prices, rates and expectations
  Object.assign(v, {
    ruleRate: i,
    keyRate: i,
    depositRate: id,
    loanRate: il,
    mortgageRateN: imn,
    mortgageRateI: rmi,
    bankBondRate: ibb,
    bondRate: ib,
    loanPremium: 0,
    foreignRate: iF,
    wage: 1,
    wageGrowth: 0,
    importPrice: 1,
    unitCost: 1,
    domesticPrice: 1,
    cpi: 1,
    housingCost: 1,
    housePrice: 1,
    realHousePrice: 1,
    logRealHousePrice: 0,
    exchangeRate: 1,
    logExchangeRate: 0,
    realExchangeRate: 1,
    worldPrice: 1,
    kronaSentiment: 0,
    inflation: 0,
    inflation12: 0,
    adaptiveInflation: 0,
    expectedInflation: 0,
    taxRuleAdjustment: 0,
    taxRate: o.tau0,
    vatRate: o.vat0,
    vatInPrices: o.vat0,
    realMortgageRate: rmR,
    stressTestPayment: annT,
    output: y,
    nominalGDP: p.Y0,
    capitalRatio: p.kapT,
    bankEquity: EB,
    riskWeightedAssets: RWA,
  });
  // labour
  Object.assign(v, { employmentTotal: Ntot, publicEmployment: NG, unemployment: o.uBase });
  for (const j of FIRMS) {
    v[`employment${j}`] = N[j];
    v[`valueAdded${j}`] = gva[j];
  }
  G3.forEach((g, h) => {
    v[`employment${g}`] = Ng[h];
    v[`unemployed${g}`] = U[h];
    v[`unemployment${g}`] = u0[h];
    v[`unemploymentBenefits${g}`] = UE[h];
    if (h < 2) v[`familyBenefits${g}`] = FAM[h];
    v[`grossIncome${g}`] = gross[h];
    v[`incomeTax${g}`] = o.tau0 * gross[h];
    v[`netLabourIncome${g}`] = ydl[h];
    v[`propertyIncome${g}`] = ydk[h];
    v[`disposableIncome${g}`] = ydl[h] + ydk[h];
    v[`consumption${g}`] = C[h];
  });
  // demand, trade, firms
  const imC = p.muC * Ctot,
    imD = o.muD * (Ctot + inv + xd),
    imI = p.muI * inv,
    imG = p.muG * gPur;
  Object.assign(v, {
    consumption: Ctot,
    realConsumption: Ctot,
    vat: VAT,
    importsConsumer: imC,
    importsInputs: imD,
    importsEquipment: imI,
    importsPublic: imG,
    importsExporters: imX,
    importVolume: IM,
    exportVolume: XN,
    exportValue: XN,
    investmentReal: inv,
    dividendsAbroad: divW,
    bankProfit: profB,
    bankProfitSmoothed: profB,
    bankDividends: profB,
    cbProfit: profCB,
    pfIncome: incPF,
    pfIncomeSmoothed: incPF,
    pensionPayouts: PAY,
    pensionContributions: CON,
    realDisposableIncome: ydH,
    netMortgageLending: 0,
    netCreditTotal: 0,
    debtRatio: o.debtR0,
    deficit: 0,
  });
  for (const j of FIRMS) {
    v[`investment${j}`] = i0[j];
    v[`profits${j}`] = Pi[j];
    v[`profits${j}Smoothed`] = PiAT[j];
    v[`dividends${j}`] = DIV[j];
    if (j !== 'XA') v[`retention${j}`] = o[`rho${j}0`];
  }
  for (const g of ['Y', 'W'] as const) {
    const h = g === 'Y' ? 0 : 1;
    v[`mortgageTarget${g}`] = M[h];
    v[`mortgageRepayment${g}`] = M[h] / p.Tm;
    v[`mortgageDemand${g}`] = M[h] / p.Tm;
    v[`mortgageLending${g}`] = M[h] / p.Tm;
    v[`netMortgageLending${g}`] = 0;
    v[`dstiCap${g}`] = (o[`nu${g}`] * afterTax[h] * (g === 'Y' ? p.dstiY : p.dstiW)) / annT;
  }

  const targets = {
    govDebt: p.govDebt,
    depHY: Dh[0],
    depHW: Dh[1],
    depHO: Dh[2],
    depW: p.depW,
    loanFC: loan.FC,
    loanFR: loan.FR,
    loanXF: loan.XF,
    loanXT: loan.XT,
    loanXO: loan.XO,
    rightsHW: EW,
    rightsHO: EO,
    mortY: M[0],
    mortW: M[1],
  };
  return { params: o, stocks, vars: v, targets, gdpCheck, warnings: warn };
}

/* ------------------------------------------------ solved and derived parameters */

/** The steady state at the default parameters: values for ParamDef and VarDef defaults. */
export const BASE = steadyState(INPUT_VALUES);

const G3N = { Y: 'young', W: 'working-age', O: 'older' } as const;
const meta: [Id, string, ParamDef['category'], string, Provenance][] = [
  ['tau0', 'fraction', 'POLICY', 'Income-tax rate (standing in for all taxes on households and other revenue) that balances the baseline budget.', solved('the government’s budget balances with debt at 56.7% of GDP.')],
  ['tauF', 'fraction', 'POLICY', 'Effective corporate tax rate on gross profits.', solved('baseline revenue matches the data (citTarget).')],
  ['divXOW', 'fraction', 'IDENTITY', 'Foreign owners’ share of other exporters’ dividends (data centres, pharma and other foreign-owned firms).', solved('dividends to foreign owners of all exporters match the data (fdiTarget), after the smelters’ (all abroad) and tourism’s (divXTW).')],
  ['mXO', 'fraction', 'BEHAVIOUR', 'Other exporters’ imported inputs per unit of exports.', derived('What is left of the TiVA import content of all exports (muX) after fisheries, aluminium and tourism.')],
  ['dFC', 'fraction', 'BEHAVIOUR', 'What builders buy from retail and service firms (materials, engineering, transport) per króna of their sales.', solved('construction’s value added matches the data (gvaFC).')],
  ['vaFR0', '% of GDP/yr', 'IDENTITY', 'Retail and service firms’ real value added at baseline (including VAT and housing services).', derived('Output − public value added − the other five sectors’ value added (data).')],
  ['vat0', 'fraction', 'POLICY', 'Effective VAT rate on consumer spending at baseline.', solved('baseline VAT revenue matches the data (vatTarget).')],
  ['cEe', 'fraction', 'CONTRACT', 'Employee pension contribution, deducted from the gross wage.', solved('baseline contributions match the data (conTarget).')],
  ['rr', 'fraction', 'POLICY', 'Unemployment-benefit replacement rate (share of the average wage per unemployed person).', solved('baseline benefits match the data (ueTarget).')],
  ['wsOther', 'fraction', 'POLICY', 'Share of other public services that is staff pay.', solved('public compensation of employees matches the data (compG).')],
  ['muD', 'fraction', 'BEHAVIOUR', 'Import share of domestic firms’ inputs.', solved('the current account balances at baseline.')],
  ['c0Y', '% of GDP/yr', 'BEHAVIOUR', 'Young: spending not tied to current income (at baseline prices).', solved('the young save nothing at baseline, so their deposits are constant.')],
  ['c0W', '% of GDP/yr', 'BEHAVIOUR', 'Working age: spending not tied to current income (at baseline prices).', solved('zero saving at baseline.')],
  ['c0O', '% of GDP/yr', 'BEHAVIOUR', 'Older: spending not tied to current income (at baseline prices).', solved('zero saving at baseline.')],
  ['payout', 'per year', 'CONTRACT', 'Pension payout rate on pensioners’ rights.', solved('pensioners’ rights stay constant (payouts = contributions + fund income).')],
  ['ageing', 'per year', 'IDENTITY', 'Share of working-age members’ rights that moves to pensioners each year as members retire.', solved('working-age rights stay constant.')],
  ['nuY', 'fraction', 'POLICY', 'Young: share of the group’s income after income tax that belongs to new borrowers, for the debt-service cap.', solved('baseline lending uses 60% of the cap (capUse0).')],
  ['nuW', 'fraction', 'POLICY', 'Working age: share of the group’s income after income tax that belongs to new borrowers.', solved('baseline lending uses 60% of the cap.')],
  ['mRY', 'ratio', 'BEHAVIOUR', 'Young: desired mortgage debt per króna of gross income.', solved('desired debt equals actual debt at baseline.')],
  ['mRW', 'ratio', 'BEHAVIOUR', 'Working age: desired mortgage debt per króna of gross income.', solved('desired debt equals actual debt at baseline.')],
  ['potentialOutput', '% of GDP/yr', 'IDENTITY', 'Real output at baseline: the benchmark for the output gap.', derived('Baseline real output C + G + I + X − IM (100 by construction).')],
  ['uBase', 'fraction', 'IDENTITY', 'Unemployment rate at baseline: the rate at which wages grow only with expected inflation.', derived('Unemployed ÷ labour force from the age groups’ data.')],
  ['Ntot0', '% of GDP/yr', 'IDENTITY', 'Baseline employment, measured as the gross wage bill at baseline wages.', derived('Private and public wages: compensation ÷ (1 + employer contribution + payroll tax), for public staff as for firms.')],
  ['rl0', 'fraction/yr', 'IDENTITY', 'Real business-loan rate at baseline.', derived('Neutral rate + loan spread.')],
  ['krona0', '% of GDP', 'IDENTITY', 'Non-residents’ króna holdings (deposits + government bonds) at baseline.', derived('depW + bondW.')],
  ['bW0', 'ratio', 'BEHAVIOUR', 'Non-residents’ government bonds ÷ GDP at baseline.', derived('bondW ÷ 100.')],
  ['debtR0', 'ratio', 'POLICY', 'Government debt ÷ GDP that the debt-tied tax rule aims for.', derived('govDebt ÷ 100.')],
  ['pfForeignTarget', 'fraction', 'BEHAVIOUR', 'Pension funds’ target foreign share of assets (before the lever).', derived('pfForeignShare ÷ 100 (data).')],
  ['bbSh0', 'fraction', 'BEHAVIOUR', 'Pension funds’ target share of bank bonds in their assets.', derived('Baseline bank bonds ÷ pension assets.')],
  ['dPF0', 'fraction', 'BEHAVIOUR', 'Pension funds’ target share of deposits in their assets.', derived('pfDepShare.')],
  ['nwPF0', 'fraction', 'BEHAVIOUR', 'Pension funds’ target surplus as a share of assets.', derived('pfNWshare.')],
  ['boSh0', 'fraction', 'BEHAVIOUR', 'Older households’ target share of government bonds in their liquid savings.', derived('bondO ÷ (their deposits + bondO).')],
  ['ydH0', '% of GDP/yr', 'IDENTITY', 'Households’ real disposable income at baseline (for house prices).', derived('Sum over the age groups.')],
  ['rmR0', 'fraction/yr', 'IDENTITY', 'Real mortgage rate at baseline (the mix of indexed and non-indexed).', derived('theta × indexed real rate + (1 − theta) × non-indexed rate.')],
  ['lendShY', 'fraction', 'BEHAVIOUR', 'Young households’ share of extra lending pushed by banks.', derived('Their share of mortgage debt.')],
  ['lendShW', 'fraction', 'BEHAVIOUR', 'Working-age households’ share of extra lending pushed by banks.', derived('Their share of mortgage debt.')],
  ['pfShN', 'fraction', 'BEHAVIOUR', 'Pension funds’ share of new non-indexed mortgages.', derived('Their share of the non-indexed stock (data).')],
  ['pfShI', 'fraction', 'BEHAVIOUR', 'Pension funds’ share of new indexed mortgages.', derived('Their share of the indexed stock (data).')],
  ['homeAgeingRateY', 'per year', 'IDENTITY', 'Share of young households’ homes that moves to the working-age group each year as people age.', derived('Keeps the young’s housing constant: purchases ÷ holdings.')],
  ['homeAgeingRateW', 'per year', 'IDENTITY', 'Share of working-age households’ homes that moves to older households each year.', derived('Keeps working-age housing constant.')],
];
for (const j of FIRMS) {
  const who = FIRM_NAME[j];
  meta.push(
    [`N${j}0`, '% of GDP/yr', 'IDENTITY', `Baseline employment of ${who}, as a gross wage bill at baseline wages.`, derived(j === 'FR' ? 'The private wage bill minus the other five sectors’.' : 'Their compensation of employees (data) ÷ (1 + employer pension contribution + payroll tax).')],
    [`i${j}0`, '% of GDP/yr', 'BEHAVIOUR', `Baseline investment of ${who}, at baseline prices.`, derived(j[0] === 'X' ? 'Exporters’ investment (iFX0) × their share of exporters’ gross fixed capital formation (data).' : 'Domestic firms’ investment (iFD0) × their share of domestic firms’ gross fixed capital formation (data).')],
    [`pi${j}0`, '% of GDP/yr', 'IDENTITY', `After-tax profit of ${who} at baseline.`, derived('Value added − labour costs − net interest (− VAT for retail and services), after corporate tax.')],
    [`l${j}0`, 'ratio', 'IDENTITY', `Bank debt of ${who} ÷ GDP at baseline.`, derived('Their share of bank loans to firms × loanTotal ÷ 100.')],
    [`dep${j}0`, 'ratio', 'BEHAVIOUR', `Deposits ${who} keep, as a share of a year’s GDP.`, derived(j[0] === 'X' ? 'Exporters’ deposits (depFX) split by export revenue ÷ 100.' : 'Domestic firms’ deposits (M3 minus everyone else’s) split by depShareFC ÷ 100.')],
  );
  if (j !== 'XA') meta.push([`rho${j}0`, 'fraction', 'BEHAVIOUR', `Normal retention ratio of ${who}: the share of after-tax profit kept to pay for investment.`, solved('retained profit = investment, so their bank debt is constant.')]);
  if (j[0] === 'X') meta.push([`d${j}`, 'fraction', 'BEHAVIOUR', `Domestic inputs ${who} buy from retail and service firms per unit of exports.`, solved('their value added matches the data (gva).')]);
}
for (const g of ['Y', 'W', 'O'] as const) {
  meta.push(
    [`emp0${g}`, 'thousand persons', 'IDENTITY', `Workers, ${G3N[g]}, at baseline.`, derived('Population × employment rate (data).')],
    [`U0${g}`, 'thousand persons', 'IDENTITY', `Unemployed, ${G3N[g]}, at baseline.`, derived('Labour force − workers, from the unemployment rate (data).')],
    [`Ng0${g}`, '% of GDP/yr', 'IDENTITY', `Employment of the ${G3N[g]} at baseline, as a gross wage bill at baseline wages.`, derived('Share of the wage bill (data) × total employment.')],
    [`wb${g}`, '% of GDP per thousand', 'IDENTITY', `Gross wage per worker, ${G3N[g]}, at the baseline wage rate.`, derived('Wage bill ÷ workers.')],
    [`cycSh${g}`, 'fraction', 'BEHAVIOUR', `Share of any change in jobs that falls on the ${G3N[g]}.`, derived('Cyclicality (cyc) × wage-bill share, normalised to sum to 1.')],
    [`LW0${g}`, '% of GDP', 'IDENTITY', `Liquid savings (deposits${g === 'O' ? ' and bonds' : ''}) of the ${G3N[g]} at baseline.`, derived('Household deposits (data) split by age.')],
    [`H0${g}`, '% of GDP', 'IDENTITY', `Homes owned by the ${G3N[g]} at baseline prices.`, derived('Housing stock × ownership share.')],
  );
}

/** Solved and derived parameters with their default values and provenance. */
export const DERIVED_PARAMS: Record<Id, ParamDef> = Object.fromEntries(
  meta.map(([id, unit, category, description, provenance]) => {
    const value = BASE.params[id];
    if (value === undefined) throw new Error(`steady state does not produce parameter '${id}'`);
    return [id, { id, value, unit, category, description, provenance }];
  }),
);
for (const id of Object.keys(BASE.params)) if (!DERIVED_PARAMS[id]) throw new Error(`steady-state parameter '${id}' has no metadata`);

/** Every parameter of the Iceland model: inputs plus solved and derived ones. */
export const ALL_PARAMS: Record<Id, ParamDef> = { ...INPUT_PARAMS, ...DERIVED_PARAMS };

/** Baseline value of a variable (for VarDef.initial). */
export const base = (id: Id): number | undefined => BASE.vars[id];
