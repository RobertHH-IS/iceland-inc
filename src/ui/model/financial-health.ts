/** Actual financing problems, distinct from the direction of a flow's comparison change. */
import type { Id } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';

export interface FinancialHealth {
  severity: 'warning' | 'critical';
  label: string;
  borrowers: Id[];
}

export function financialHealth(client: EngineClient, members: readonly Id[]): FinancialHealth | null {
  if (!client.info.instrumentById.has('businessArrears')) return null;
  const borrowers = members.filter((id) => client.info.varById.has(`interestDue${id}`));
  const value = (id: string) => client.info.varById.has(id) ? client.value(id) : 0;
  const tol = 1e-7;
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
