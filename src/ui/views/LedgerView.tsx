/**
 * LedgerView: a live Godley table. Flows are rows, players (or groups) columns, grouped by
 * account. Each cell shows the current value (minus for the side that pays or loses, plus for
 * the side that receives or gains) and its change from baseline; each row sums to zero; the
 * right-hand column is the row's effect on total net worth; the bottom row is each column's
 * change in net worth.
 */
import { memo } from 'react';
import type { EngineClient } from '../engine-client.ts';
import { fmtNum, fmtSigned } from '../model/format.ts';
import type { Level } from '../model/geometry.ts';
import type { ModelInfo } from '../model/info.ts';
import { buildLedger, type LedgerCell } from '../model/ledger.ts';
import { deviation } from '../model/styling.ts';
import type { OnSelect } from './common.tsx';

interface LedgerProps {
  info: ModelInfo;
  client: EngineClient;
  legs: Float64Array;
  level: Level;
  onSelect: OnSelect;
}

export const LedgerView = memo(function LedgerView({ info, legs, level, onSelect }: LedgerProps) {
  const table = buildLedger(info, legs, level);
  const nodeKind = level === 'player' ? 'player' : 'group';
  return (
    <div className="ledger">
      <div className="ledger-cap">
        <span>
          Transactions in % of baseline GDP a year. <strong>−</strong> pays or loses, <strong>+</strong> receives or gains. Small numbers are the change from baseline.
        </span>
        <span className={`books ${table.allBalanced ? 'ok' : 'bad'}`}>{table.allBalanced ? 'Every row sums to 0 ✓' : 'A row does not balance ✗'}</span>
      </div>
      <div className="ledger-scroll" tabIndex={0} role="region" aria-label="Transactions-flow matrix">
        <table className="godley">
          <thead>
            <tr>
              <th scope="col" className="rowhead">
                Flow
              </th>
              {table.columns.map((c) => (
                <th key={c.id} scope="col">
                  <button type="button" className="colhead" onClick={() => onSelect({ kind: nodeKind, id: c.id })}>
                    <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
                    {c.label}
                  </button>
                </th>
              ))}
              <th scope="col" className="sum-col" title="Every row sums to zero: double entry">
                Σ
              </th>
              <th scope="col" className="nw-col" title="The row's effect on the total net worth of all players">
                Δ net worth
              </th>
            </tr>
          </thead>
          {table.sections.map((s) => (
            <tbody key={s.account}>
              <tr className="acct">
                <th colSpan={table.columns.length + 3} scope="colgroup">
                  {s.label}
                </th>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.flow.id}>
                  <th scope="row" className="rowhead">
                    <button type="button" className="navlink" onClick={() => onSelect({ kind: 'flow', id: r.flow.id })} title={r.flow.explain.what}>
                      {r.flow.label}
                    </button>
                    {r.flow.kind !== 'cash' && <span className="muted small"> · {r.flow.kind}</span>}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={i} className="num">
                      {c && <Cell c={c} />}
                    </td>
                  ))}
                  <td className={`num sum sum-col ${r.balanced ? 'ok' : 'bad'}`}>{r.oneSided ? <span className="muted small" title="A real asset has no counterparty">one-sided</span> : r.balanced ? '0 ✓' : fmtNum(r.sum, 12)}</td>
                  <td className="num nw-col">
                    <Pair value={r.nwEffect} baseline={r.nwEffectBaseline} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th scope="row" className="rowhead" title="Saving plus revaluations">
                Change in net worth
              </th>
              {table.netWorth.map((n, i) => (
                <td key={i} className="num">
                  <Pair value={n.value} baseline={n.baseline} />
                </td>
              ))}
              <td className="num sum-col" />
              <td className="num nw-col">
                <Pair value={table.netWorth.reduce((s, n) => s + n.value, 0)} baseline={table.netWorth.reduce((s, n) => s + n.baseline, 0)} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});

function Cell({ c }: { c: LedgerCell }) {
  if (c.both) return <Pair value={c.gross} baseline={c.grossBaseline} prefix="±" />;
  return <Pair value={c.value} baseline={c.baseline} />;
}

function Pair({ value, baseline, prefix = '' }: { value: number; baseline: number; prefix?: string }) {
  const dev = deviation(value, baseline);
  const d = value - baseline;
  return (
    <span className="pair">
      <span className="mono">
        {prefix}
        {prefix ? fmtNum(Math.abs(value)) : fmtSigned(value)}
      </span>
      {dev.tone !== 'flat' && Math.abs(d) > 5e-5 && <span className={`mono small tone-${dev.tone}`}>{fmtSigned(d)}</span>}
    </span>
  );
}
