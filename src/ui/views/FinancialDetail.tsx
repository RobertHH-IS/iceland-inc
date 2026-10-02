import type { Id } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { financialHealth } from '../model/financial-health.ts';
import { fmtCompact, fmtNum, fmtSigned } from '../model/format.ts';
import type { OnSelect } from './common.tsx';

/** A readable link from the flashing node to obligations, funding and actual responses. */
export function FinancialDetail({ client, members, onSelect }: { client: EngineClient; members: readonly Id[]; onSelect: OnSelect }) {
  if (!client.info.instrumentById.has('businessArrears')) return null;
  const borrowers = members.filter((id) => client.info.varById.has(`interestDue${id}`));
  if (!borrowers.length && !members.includes('B')) return null;
  const health = financialHealth(client, members);
  const row = (id: Id, label: string, change = false) => {
    const def = client.info.varById.get(id);
    if (!def) return null;
    const now = client.value(id), ref = client.baseline(id);
    return <li key={id}><button type="button" className="financial-driver" onClick={() => onSelect({ kind: 'var', id })}>
      <span>{label}</span><span className="mono">{fmtCompact(now, def.unit)}{change && <small className="muted"> · {fmtSigned(now - ref)} vs no change</small>}</span>
    </button></li>;
  };
  return <section className={`financial-detail${health ? ` financial-${health.severity}` : ''}`} aria-label="Borrower financing and implications">
    <h4 className="sub">{health?.label ?? 'Borrower financing'}</h4>
    <p className="small muted">Click an amount to inspect its equation and connected flows. Coverage uses operating cash earnings; hedge covers interest and maturity, speculative needs principal refinancing, and Ponzi cannot cover interest from earnings. These are sector averages.</p>
    {members.includes('B') && <ul className="financial-rows">
      {row('capitalRatio', 'Capital ratio')}{row('creditCapitalCapacity', 'Capacity for additional credit')}
      {row('creditCapitalShortfall', 'Capital gap for business credit')}
      {row('businessLoanLosses', 'Loan losses recognised')}{row('lenderConfidence', 'Lender confidence')}
    </ul>}
    {borrowers.map((id) => {
      const arrears = client.balanceSheet(id).liabilities.find((a) => a.instrument === 'businessArrears')?.value ?? 0;
      return <div className="financial-borrower" key={id}>
        <h5>{client.info.playerById.get(id)?.label ?? id} <span className="mono small">arrears {fmtNum(arrears)}% of opening GDP</span></h5>
        <ul className="financial-rows">
          {row(`cashServiceCoverage${id}`, 'Operating cash / debt service')}
          {row(`interestDue${id}`, 'Contracted interest')}{row(`loanInterest${id}`, 'Interest paid in cash')}{row(`interestUnpaid${id}`, 'Unpaid interest')}
          {row(`principalMaturity${id}`, 'Principal coming due')}{row(`principalPaid${id}`, 'Principal paid')}{row(`principalOverdue${id}`, 'Principal newly overdue')}
          {row(`creditRequested${id}`, 'Gross credit requested')}{row(`creditApproved${id}`, 'Gross credit approved')}
          {row(`creditDenied${id}`, 'Gross credit refused')}{row(`refinancingDenied${id}`, 'Principal refinancing refused')}
          {row(`arrearsScheduled${id}`, 'Arrears instalment due')}{row(`arrearsMissed${id}`, 'Arrears instalment unpaid')}
          {row(`ownerSupport${id}`, 'Owner cash support', true)}{row(`arrearsRecovery${id}`, 'Arrears recovered')}{row(`loanWriteoff${id}`, 'Claims written off')}
        </ul>
        <p className="small muted">Recorded responses against the no-change run at this month. Each can feed back into income, demand and lender capital; they are not additive estimates of cause.</p>
        <ul className="financial-rows">
          {row(`investment${id}`, 'Funded investment', true)}{row(`employment${id}`, 'Funded jobs', true)}{row(`dividends${id}`, 'Owner payout', true)}
        </ul>
      </div>;
    })}
    <p className="small muted">Amounts use opening-GDP units; flows are annual rates at the latest step. Actual posted monthly flows are in the ledger. Cash buffers, approved loans and bounded existing-owner transfers cover obligations first; remaining funding limits investment and payouts. Persistent unpaid claims reduce bank capital when written off.</p>
  </section>;
}
