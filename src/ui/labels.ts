/**
 * Words the interface shows for ids of the model language: rule categories, schools of
 * thought, flow kinds, accounts and the kinds of thing the inspector can show. Views print
 * these, never the raw ids, so the ids stay English keys and a translation only has to supply
 * another table of the same shape (docs/i18n/inventory.md §2 item 4).
 */
import type { Account, Category, FlowKind, School } from '../core/types.ts';

export interface LabelTable {
  /** Rule categories, for the chip next to every rule. */
  category: Record<Category, string>;
  /** Schools of economic thought, on a concept card. */
  school: Record<School, string>;
  /** Kinds of flow: the chip on a pipe, and the note after a non-cash flow's name. */
  flowKind: Record<FlowKind, string>;
  /** A kind of flow inside a sentence, saying when no cash moves: a pipe's label on the map. */
  flowKindPhrase: Record<FlowKind, string>;
  /** The account a flow belongs to, as a short name ("Capital account"). */
  account: Record<Account, string>;
  /** An account as a section of the ledger, with what it holds. */
  accountSection: Record<Account, string>;
}

export const EN: LabelTable = {
  category: {
    IDENTITY: 'Identity',
    CONTRACT: 'Contract',
    BEHAVIOUR: 'Behaviour',
    POLICY: 'Policy',
  },
  school: {
    accounting: 'Accounting',
    'post-keynesian': 'Post-Keynesian',
    keynesian: 'Keynesian',
    'new-keynesian': 'New Keynesian',
    monetarist: 'Monetarist',
    institutional: 'Institutional',
    empirical: 'Empirical',
  },
  flowKind: {
    cash: 'Cash',
    accrual: 'Accrual',
    revaluation: 'Revaluation',
    writeoff: 'Write-off',
  },
  flowKindPhrase: {
    cash: 'cash payments',
    accrual: 'accrual (no cash moves)',
    revaluation: 'revaluation (no cash moves)',
    writeoff: 'write-off (no cash moves)',
  },
  account: {
    current: 'Current account',
    capital: 'Capital account',
    financial: 'Financial account',
    other: 'Other changes',
  },
  accountSection: {
    current: 'Current account: income and spending',
    capital: 'Capital account: investment',
    financial: 'Financial account: lending, repaying and trading claims',
    other: 'Other changes: accruals, revaluations and write-offs',
  },
};

/** The table the views read. A translation will choose between tables here. */
export const labels: LabelTable = EN;
