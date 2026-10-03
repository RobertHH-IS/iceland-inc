/**
 * LedgerView: a live Godley table. Flows are rows, players (or, as an option, the groups as the
 * flow map shows them) columns, grouped by account. Each cell shows the current value (minus for the side that pays or loses, plus for
 * the side that receives or gains) and its change from baseline. A cell whose legs all stay
 * within its column (firms buying from firms) shows ±their total; a cell that also has legs to
 * other columns shows its net value, with the within-column total as a note, so the cells of a
 * row always add up to its Σ. Each row sums to zero; the
 * right-hand column is the row's effect on total net worth; the bottom row is each column's
 * change in net worth.
 *
 * On a model that opens on a dated month 0 the cells are in ISK bn a year, and the small number is
 * the effect against the no-change path at this month once a lever has moved, and the change since
 * today before that (in % of the amount; the net-worth columns in ISK bn).
 */
import { memo } from 'react';
import type { ScenarioEvent } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { labels } from '../labels.ts';
import { displayOf, effect, fmtChangeOf, leverMoved } from '../model/effects.ts';
import { adaptiveDigits, fmtNum, fmtSigned, MINUS } from '../model/format.ts';
import type { ModelInfo } from '../model/info.ts';
import { buildLedger, cellShows, type LedgerCell, type LedgerColumns } from '../model/ledger.ts';
import { deviation, type Tone } from '../model/styling.ts';
import type { OnSelect } from './common.tsx';

interface LedgerProps {
  info: ModelInfo;
  client: EngineClient;
  legs: Float64Array;
  /** Every player, the top-level groups, or the nodes of the map ({ expanded }). */
  columns: LedgerColumns;
  onSelect: OnSelect;
  /** The month shown and the lever events so far (on a dated model, what the small numbers compare with). */
  t?: number;
  events?: readonly ScenarioEvent[];
}

/** How the ledger writes a cell: its value, and its small change against the comparison. */
interface CellFormat {
  /** Signed ("+12.3"), or a size after a prefix ("±12.3"). */
  value(x: number, prefix: string): string;
  /** The size alone: "12.3". */
  magnitude(x: number): string;
  change(value: number, ref: number): { text: string; tone: Tone } | null;
  /** The same for the net-worth columns. */
  nwChange(value: number, ref: number): { text: string; tone: Tone } | null;
}

const MODEL_UNITS: CellFormat = {
  value: (x, prefix) => (prefix ? `${prefix}${fmtNum(Math.abs(x))}` : fmtSigned(x)),
  magnitude: (x) => fmtNum(Math.abs(x)),
  change: (value, ref) => {
    const dev = deviation(value, ref), d = value - ref;
    return dev.tone !== 'flat' && Math.abs(d) > 5e-5 ? { text: fmtSigned(d), tone: dev.tone } : null;
  },
  nwChange: (value, ref) => MODEL_UNITS.change(value, ref),
};

/** ISK bn, grouped: "−2,740", "14.8". */
function iskNumber(x: number, signed: boolean): string {
  const digits = Math.min(2, adaptiveDigits(x));
  if (Math.abs(x) < 0.5 * 10 ** -digits) return '0';
  const n = new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(x));
  return x < 0 ? `${MINUS}${n}` : signed ? `+${n}` : n;
}

function iskFormat(perUnit: number): CellFormat {
  return {
    value: (x, prefix) => (prefix ? `${prefix}${iskNumber(Math.abs(x) * perUnit, false)}` : iskNumber(x * perUnit, true)),
    magnitude: (x) => iskNumber(Math.abs(x) * perUnit, false),
    change: (value, ref) => {
      // a change in the size of the amount, so the payer's and the payee's cells read alike
      const e = effect('amount', Math.abs(value), Math.abs(ref));
      const text = fmtChangeOf(e);
      return text && e ? { text, tone: e.value > 0 ? 'up' : 'down' } : null;
    },
    nwChange: (value, ref) => {
      const d = (value - ref) * perUnit;
      const text = iskNumber(d, true);
      return text === '0' ? null : { text, tone: d > 0 ? 'up' : 'down' };
    },
  };
}

const NO_EVENTS: readonly ScenarioEvent[] = [];

export const LedgerView = memo(function LedgerView({ info, client, legs, columns, onSelect, t = 0, events = NO_EVENTS }: LedgerProps) {
  const display = displayOf(client);
  const frame = client.getFrame();
  const moved = leverMoved(events, t);
  // On a dated model: against the no-change path once a lever has moved, else against today
  // (nothing at month 0, where every amount is today's).
  const dated = !!display.month0;
  const against = dated && !moved ? frame.legToday : frame.legBaselines;
  const table = buildLedger(info, legs, columns, 1e-9, against);
  const fmt = dated && display.money ? iskFormat(display.money.perUnit) : MODEL_UNITS;
  const small = dated ? (moved ? 'effect vs no change at this month' : t >= 1 ? `change ${display.since}` : null) : client.comparison === 'no-change' ? 'effect vs no change at this month' : 'change from baseline';
  const unit = dated && display.money ? `${display.money.label} a year` : '% of baseline GDP a year';
  const nodeKind = (id: string) => (info.playerById.has(id) ? 'player' : 'group');
  return (
    <div className="ledger">
      <div className="ledger-cap">
        <span>
          {unit}. <strong>−</strong> pays, <strong>+</strong> receives{small ? `; small numbers: ${small}` : ''}.
        </span>
        {!table.allBalanced && <span className="books bad">A row does not balance</span>}
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
                  <button type="button" className="colhead" onClick={() => onSelect({ kind: nodeKind(c.id), id: c.id })}>
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
                    {r.flow.kind !== 'cash' && <span className="muted small"> · {labels.flowKind[r.flow.kind]}</span>}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={i} className="num">
                      {c && <Cell c={c} fmt={fmt} />}
                    </td>
                  ))}
                  <td className={`num sum sum-col ${r.balanced ? 'ok' : 'bad'}`}>{r.oneSided ? <span className="muted small" title="A real asset has no counterparty">one-sided</span> : r.balanced ? '0 ✓' : fmtNum(r.sum, 12)}</td>
                  <td className="num nw-col">
                    <Pair value={r.nwEffect} baseline={r.nwEffectBaseline} fmt={fmt} nw />
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
                  <Pair value={n.value} baseline={n.baseline} fmt={fmt} nw />
                </td>
              ))}
              <td className="num sum-col" />
              <td className="num nw-col">
                <Pair value={table.netWorth.reduce((s, n) => s + n.value, 0)} baseline={table.netWorth.reduce((s, n) => s + n.baseline, 0)} fmt={fmt} nw />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});

function Cell({ c, fmt }: { c: LedgerCell; fmt: CellFormat }) {
  if (cellShows(c) === 'gross') return <Pair value={c.gross} baseline={c.grossBaseline} prefix="±" fmt={fmt} />;
  return (
    <>
      <Pair value={c.value} baseline={c.baseline} fmt={fmt} />
      {c.both && (
        <span className="muted small within" title="Paid and received within this column">
          ±{fmt.magnitude(c.gross)} within
        </span>
      )}
    </>
  );
}

/** `nw`: a net-worth column, whose change is written in the amount's own unit. */
function Pair({ value, baseline, prefix = '', fmt, nw = false }: { value: number; baseline: number; prefix?: string; fmt: CellFormat; nw?: boolean }) {
  const change = nw ? fmt.nwChange(value, baseline) : fmt.change(value, baseline);
  return (
    <span className="pair">
      <span className="mono">{fmt.value(value, prefix)}</span>
      {change && <span className={`mono small tone-${change.tone}`}>{change.text}</span>}
    </span>
  );
}
