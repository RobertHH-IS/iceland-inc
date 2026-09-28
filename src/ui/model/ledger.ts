/**
 * The live Godley table: flows as rows, players (or groups) as columns. Pure functions.
 *
 * Each cell is the leg's signed amount for that column, in % of baseline GDP a year: minus for
 * the side that pays (or loses value), plus for the side that receives (or gains). Every
 * two-sided row sums to zero; that is double entry, re-checked here on the live numbers.
 *
 * The last column is each row's effect on the total net worth of all players: zero for
 * payments, loans and trades (one side's loss is the other's gain); the value of the asset for
 * a purchase of a real asset (investment adds real wealth); ± the amount for a one-sided
 * revaluation or write-off of a real asset. The bottom row is each column's change in net
 * worth: saving plus revaluations.
 */
import type { Account, Id } from '../../core/types.ts';
import type { FlowInfo, LegInfo, ModelInfo } from './info.ts';
import { nodeLabel, nodeColor } from './info.ts';
import type { Level } from './geometry.ts';

export const ACCOUNT_ORDER: Account[] = ['current', 'capital', 'financial', 'other'];

export const ACCOUNT_LABEL: Record<Account, string> = {
  current: 'Current account: income and spending',
  capital: 'Capital account: investment',
  financial: 'Financial account: lending, repaying and trading claims',
  other: 'Other changes: accruals, revaluations and write-offs',
};

export interface LedgerCell {
  value: number;
  baseline: number;
  /** Paid and received by the same column (e.g. firms buying from firms): shown as ±gross. */
  both: boolean;
  gross: number;
  grossBaseline: number;
  /** This row's effect on the column's net worth. */
  nw: number;
  nwBaseline: number;
}

export interface LedgerRow {
  flow: FlowInfo;
  cells: (LedgerCell | null)[];
  sum: number;
  sumBaseline: number;
  /** A one-sided row (real-asset revaluation or write-off) has no counterparty and need not sum to zero. */
  oneSided: boolean;
  balanced: boolean;
  nwEffect: number;
  nwEffectBaseline: number;
}

export interface LedgerSection {
  account: Account;
  label: string;
  rows: LedgerRow[];
}

export interface LedgerColumn {
  id: Id;
  label: string;
  color: string;
}

export interface LedgerTable {
  columns: LedgerColumn[];
  sections: LedgerSection[];
  netWorth: { value: number; baseline: number }[];
  allBalanced: boolean;
  maxRowResidual: number;
}

/** Signed effects of a leg of amount v: [payer side, payee side] for cells, and for net worth. */
export function legEffects(l: Pick<LegInfo, 'posting' | 'oneSided'>, v: number): { cellFrom: number; cellTo: number; nwFrom: number; nwTo: number } {
  if (l.oneSided) {
    const s = l.posting === 'writeoff' ? -v : v;
    // One holder: the whole effect lands once (reported on the "from" side; "to" is the same player).
    return { cellFrom: s, cellTo: 0, nwFrom: s, nwTo: 0 };
  }
  switch (l.posting) {
    case 'transfer':
    case 'accrue':
    case 'revalue':
    case 'writeoff':
      return { cellFrom: -v, cellTo: v, nwFrom: -v, nwTo: v };
    case 'purchase':
      // The buyer swaps money for an asset (net worth unchanged); the seller books income.
      return { cellFrom: -v, cellTo: v, nwFrom: 0, nwTo: v };
    default:
      // issue, redeem, trade: claims change hands; composition changes, net worth does not.
      return { cellFrom: -v, cellTo: v, nwFrom: 0, nwTo: 0 };
  }
}

/** Build the table for the given leg values (by leg index, as engine.legs() returns them). */
export function buildLedger(info: ModelInfo, legValues: ArrayLike<number>, level: Level = 'player', tol = 1e-9): LedgerTable {
  const colIds = level === 'player' ? info.players.map((p) => p.id) : info.groups.map((g) => g.id);
  const colIndex = new Map<Id, number>(colIds.map((id, i) => [id, i]));
  const col = (player: Id) => colIndex.get(level === 'player' ? player : (info.groupOf.get(player) ?? player))!;
  const columns = colIds.map((id) => ({ id, label: nodeLabel(info, id), color: nodeColor(info, id) }));
  const byFlow = new Map<Id, LegInfo[]>();
  for (const l of info.legs) {
    const arr = byFlow.get(l.flow);
    if (arr) arr.push(l);
    else byFlow.set(l.flow, [l]);
  }
  const nwTotals = colIds.map(() => ({ value: 0, baseline: 0 }));
  const sections: LedgerSection[] = ACCOUNT_ORDER.map((account) => ({ account, label: ACCOUNT_LABEL[account], rows: [] as LedgerRow[] }));
  let maxRowResidual = 0;
  let allBalanced = true;
  for (const flow of info.flows) {
    const legs = byFlow.get(flow.id) ?? [];
    const cells: (LedgerCell | null)[] = colIds.map(() => null);
    const cell = (c: number) => (cells[c] ??= { value: 0, baseline: 0, both: false, gross: 0, grossBaseline: 0, nw: 0, nwBaseline: 0 });
    let oneSided = false,
      nwEffect = 0,
      nwEffectBaseline = 0;
    for (const l of legs) {
      const v = legValues[l.index] ?? 0,
        b = l.baseline;
      const now = legEffects(l, v),
        base = legEffects(l, b);
      oneSided ||= l.oneSided;
      const cf = col(l.from),
        ct = col(l.to);
      const A = cell(cf);
      A.value += now.cellFrom;
      A.baseline += base.cellFrom;
      A.nw += now.nwFrom;
      A.nwBaseline += base.nwFrom;
      if (!l.oneSided) {
        const B = cell(ct);
        B.value += now.cellTo;
        B.baseline += base.cellTo;
        B.nw += now.nwTo;
        B.nwBaseline += base.nwTo;
        if (cf === ct) {
          B.both = true;
          B.gross += Math.abs(v);
          B.grossBaseline += Math.abs(b);
        }
      }
      nwEffect += now.nwFrom + now.nwTo;
      nwEffectBaseline += base.nwFrom + base.nwTo;
    }
    let sum = 0,
      sumBaseline = 0;
    cells.forEach((c, i) => {
      if (!c) return;
      sum += c.value;
      sumBaseline += c.baseline;
      nwTotals[i].value += c.nw;
      nwTotals[i].baseline += c.nwBaseline;
    });
    const balanced = oneSided || Math.abs(sum) <= tol * Math.max(1, ...cells.map((c) => (c ? Math.abs(c.value) : 0)));
    if (!oneSided) maxRowResidual = Math.max(maxRowResidual, Math.abs(sum));
    allBalanced &&= balanced;
    sections.find((s) => s.account === flow.account)!.rows.push({ flow, cells, sum, sumBaseline, oneSided, balanced, nwEffect, nwEffectBaseline });
  }
  return { columns, sections: sections.filter((s) => s.rows.length), netWorth: nwTotals, allBalanced, maxRowResidual };
}
