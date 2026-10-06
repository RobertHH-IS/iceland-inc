/**
 * Iceland Inc. · today: the application's default model (docs/design/today-opening.md §5). The
 * growing variant with financial stress, opened on Iceland as the published data have it on
 * 30 September 2026 (opening.ts), with today's lever settings and the fading start gaps that let
 * the rules carry on from there. `iceland` and `reference` stay the stationary controls.
 */
import type { Id, LeverDef, ModelDef, ModuleDef } from '../../../core/types.ts';
import { withStartGaps } from '../../../core/opening.ts';
import { createGrowingFinancialModel } from '../growing-financial.ts';
import { ALWAYS_ON_GAPS, AS_OF, CONDITIONAL_GAPS, CONDITIONAL_GAPS_ON, createIcelandOpening, ICELAND_OPENING_ID, MONEY_UNIT, type IcelandOpeningOptions } from './opening.ts';

export { ALWAYS_ON_GAPS, CONDITIONAL_GAPS, CONDITIONAL_GAPS_ON, createIcelandOpening, ICELAND_OPENING_ID, MONEY_UNIT, setNormal } from './opening.ts';
export { record } from './data.ts';

export const ICELAND_TODAY_ID = 'iceland-today';

export interface IcelandTodayOptions {
  /** The conditional gap families switched on (default: those decision 0018 records). */
  conditionalGaps?: readonly Id[];
  /** Who holds the Treasury's foreign-currency debt in the model (§9.3 step 7). */
  foreignDebtHolder?: IcelandOpeningOptions['foreignDebtHolder'];
  /** The committed solution to check; an empty one makes the opening solve. */
  solution?: Record<Id, number>;
}

/** The lever settings of 30 September 2026 (§4.1): the key rate's unchanged mark is the rate in
 *  force; every other lever already starts at today's setting (0, or the published cap). */
function todayLever(l: LeverDef): LeverDef {
  if (l.id === 'keyRate')
    return {
      ...l,
      default: 8,
      definition: l.definition.replace('The default, 3%, is the neutral rate, so the baseline is unchanged.', 'The start value, 8.00%, is the rate in force on 30 September 2026; the rule starts from it and moves from there.'),
    };
  if (l.id === 'incomeTax') return { ...l, definition: `${l.definition} On this profile the shift is from today’s effective income-tax rate: the rate at which revenue matches the latest four quarters, which the opening sets.` };
  return l;
}

const withTodayLevers = (mod: ModuleDef): ModuleDef => (mod.levers ? { ...mod, levers: mod.levers.map(todayLever) } : mod);

export function createIcelandTodayModel(options: IcelandTodayOptions = {}): ModelDef {
  const conditional = options.conditionalGaps ?? CONDITIONAL_GAPS_ON;
  const base = createGrowingFinancialModel({ id: ICELAND_TODAY_ID });
  const groups = { ...ALWAYS_ON_GAPS, ...Object.fromEntries(conditional.map((g) => [g, CONDITIONAL_GAPS[g]])) };
  const gapped = withStartGaps({ ...base, modules: base.modules.map(withTodayLevers) }, groups);
  const paramIds = new Set(gapped.modules.flatMap((m) => (m.params ?? []).map((p) => p.id)));
  return {
    ...gapped,
    id: ICELAND_TODAY_ID,
    label: 'Iceland Inc. · today',
    description: `Iceland as the published data have it on ${AS_OF}: a key rate of 8%, inflation of 5.9%, unemployment of 5.8% and today’s balance sheets, opened in the growing teaching economy with financial stress. From there it follows its own rules, so the path without your changes is the model’s, not a forecast. Households by age, six firm sectors, banks, pensions, government and the foreign economy with a complete money-flow ledger.`,
    calendar: { month0: { year: 2026, month: 9 } },
    moneyUnit: MONEY_UNIT,
    opening: createIcelandOpening({ paramIds, conditionalGaps: conditional, foreignDebtHolder: options.foreignDebtHolder, solution: options.solution }),
  };
}

export const icelandTodayModel: ModelDef = createIcelandTodayModel();
export const ICELAND_OPENING = icelandTodayModel.opening!;
