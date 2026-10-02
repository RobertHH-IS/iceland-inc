/** Actual financing problems, distinct from the direction of a flow's comparison change. */
import type { Id } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';

export interface FinancialHealth {
  severity: 'warning' | 'critical';
  label: string;
  borrowers: Id[];
}

const TOL = 1e-7;

export function financialHealth(client: EngineClient, members: readonly Id[]): FinancialHealth | null {
  if (!client.info.instrumentById.has('businessArrears')) return null;
  const borrowers = members.filter((id) => client.info.varById.has(`interestDue${id}`));
  const value = (id: string) => client.info.varById.has(id) ? client.value(id) : 0;
  const tol = TOL;
  if (members.includes('B') && value('capitalRatio') < (client.info.paramById.get('kapMin')?.value ?? 0) - tol)
    return { severity: 'critical', label: 'Bank capital below minimum', borrowers };
  const missed = borrowers.some((id) => value(`interestUnpaid${id}`) + value(`principalOverdue${id}`) + value(`arrearsMissed${id}`) > tol
    || client.balanceSheet(id).liabilities.some((a) => a.instrument === 'businessArrears' && a.value > tol));
  if (missed) return { severity: 'critical', label: 'Unpaid business obligations', borrowers };
  const constrained = (members.includes('B') && value('creditCapitalShortfall') > tol) || borrowers.some((id) => value(`creditRequested${id}`) - value(`creditApproved${id}`) > tol
    || value(`investmentDesired${id}`) - value(`investment${id}`) > tol
    || value(`employmentDesired${id}`) - value(`employment${id}`) > tol);
  return constrained ? { severity: 'warning', label: 'Business funding constrained', borrowers } : null;
}

/** One amount in the inspector's financing section: a variable, and whether its change from the
 *  comparison run is the point (what the firm did in response). */
export interface FinancialRow {
  id: Id;
  label: string;
  change?: boolean;
}

export interface TroubledBorrower {
  id: Id;
  health: FinancialHealth;
  /** Overdue claims on its balance sheet, % of opening GDP. */
  arrears: number;
  rows: FinancialRow[];
}

export interface FinancialSection {
  health: FinancialHealth;
  /** The bank's amounts, while its capital is short. */
  bank: FinancialRow[];
  /** The members with unpaid obligations or refused funding, in the model's order. */
  troubled: TroubledBorrower[];
}

/** The most rows one borrower can show: its coverage, seven obligations and three responses. */
export const MAX_BORROWER_ROWS = 11;

/**
 * What the inspector shows about financing: only what is in force now, like the limits. Nothing
 * while every member pays and borrows as usual; otherwise the bank's capital while it is short and,
 * for each member in trouble, its cash coverage, the obligations unpaid and the credit refused (the
 * amounts above zero), and what it spent less on than in the comparison run.
 */
export function financialSection(client: EngineClient, members: readonly Id[]): FinancialSection | null {
  const health = financialHealth(client, members);
  if (!health) return null;
  const has = (id: Id) => client.info.varById.has(id);
  const positive = (id: Id) => has(id) && client.value(id) > TOL;
  const moved = (id: Id) => has(id) && Math.abs(client.value(id) - client.baseline(id)) > TOL;
  const bank: FinancialRow[] =
    members.includes('B') && financialHealth(client, ['B'])
      ? [
          { id: 'capitalRatio', label: 'Capital ratio' },
          ...[
            { id: 'creditCapitalShortfall', label: 'Capital gap for business credit' },
            { id: 'businessLoanLosses', label: 'Loan losses recognised' },
          ].filter((r) => positive(r.id)),
        ].filter((r) => has(r.id))
      : [];
  const troubled: TroubledBorrower[] = [];
  for (const id of health.borrowers) {
    const own = financialHealth(client, [id]);
    if (!own) continue;
    const rows: FinancialRow[] = [
      ...[{ id: `cashServiceCoverage${id}`, label: 'Operating cash / debt service' }].filter((r) => has(r.id)),
      ...[
        { id: `interestUnpaid${id}`, label: 'Unpaid interest' },
        { id: `principalOverdue${id}`, label: 'Principal newly overdue' },
        { id: `refinancingDenied${id}`, label: 'Principal refinancing refused' },
        { id: `creditDenied${id}`, label: 'Gross credit refused' },
        { id: `arrearsMissed${id}`, label: 'Arrears instalment unpaid' },
        { id: `loanWriteoff${id}`, label: 'Claims written off' },
        { id: `ownerSupport${id}`, label: 'Owner cash support' },
      ].filter((r) => positive(r.id)),
      ...[
        { id: `investment${id}`, label: 'Funded investment', change: true },
        { id: `employment${id}`, label: 'Funded jobs', change: true },
        { id: `dividends${id}`, label: 'Owner payout', change: true },
      ].filter((r) => moved(r.id)),
    ];
    const arrears = client.balanceSheet(id).liabilities.find((a) => a.instrument === 'businessArrears')?.value ?? 0;
    troubled.push({ id, health: own, arrears, rows });
  }
  return { health, bank, troubled };
}
