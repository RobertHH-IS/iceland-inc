import type { Id } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { financialSection, type FinancialRow } from '../model/financial-health.ts';
import { fmtCompact, fmtNum, fmtSigned } from '../model/format.ts';
import type { OnSelect } from './common.tsx';

/**
 * Financing in the inspector, only while something is wrong (like the limits in force): nothing
 * while every member pays and borrows as usual. One member in trouble shows its amounts in force,
 * each a link to its rule; several show one row each, a link to the member, so a group never
 * becomes a long list.
 */
export function FinancialDetail({ client, members, onSelect }: { client: EngineClient; members: readonly Id[]; onSelect: OnSelect }) {
  const section = financialSection(client, members);
  if (!section) return null;
  const { health, bank, troubled } = section;
  const versus = client.comparison === 'no-change' ? 'vs no change' : 'vs baseline';
  const row = ({ id, label, change }: FinancialRow) => {
    const unit = client.info.varById.get(id)?.unit ?? '';
    const now = client.value(id);
    return (
      <li key={id}>
        <button type="button" className="financial-driver" onClick={() => onSelect({ kind: 'var', id })}>
          <span>{label}</span>
          <span className="mono">
            {fmtCompact(now, unit)}
            {change && <small className="muted"> · {fmtSigned(now - client.baseline(id))} {versus}</small>}
          </span>
        </button>
      </li>
    );
  };
  const name = (id: Id) => client.info.playerById.get(id)?.label ?? id;
  return (
    <section className={`financial-detail financial-${health.severity}`} aria-label="Borrower financing">
      <h4 className="sub">{health.label}</h4>
      <p className="muted small">Sector averages · flows in % of opening GDP a year</p>
      {bank.length > 0 && <ul className="financial-rows">{bank.map(row)}</ul>}
      {troubled.length === 1 ? (
        <>
          {members.length > 1 && <h5>{name(troubled[0].id)}</h5>}
          <ul className="financial-rows">{troubled[0].rows.map(row)}</ul>
        </>
      ) : (
        troubled.length > 1 && (
          <ul className="financial-rows">
            {troubled.map((b) => {
              const coverage = `cashServiceCoverage${b.id}`;
              return (
                <li key={b.id}>
                  <button type="button" className="financial-driver" onClick={() => onSelect({ kind: 'player', id: b.id })}>
                    <span>{name(b.id)}</span>
                    <span className="mono">
                      {client.info.varById.has(coverage) && `coverage ${fmtCompact(client.value(coverage), client.info.varById.get(coverage)!.unit)}`}
                      {b.arrears > 1e-7 && ` · arrears ${fmtNum(b.arrears)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </section>
  );
}
