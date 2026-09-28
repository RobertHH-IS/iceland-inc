/**
 * Small shared pieces: icons, chips, deltas, bars, disclosure and markdown.
 */
import { memo, useId, useState, type ReactNode } from 'react';
import type { Category, Id, Provenance } from '../../core/types.ts';
import type { ModelInfo } from '../model/info.ts';
import type { Selection } from '../model/navigation.ts';
import { parseMarkdown, type Inline } from '../model/markdown.ts';
import type { Tone } from '../model/styling.ts';

export type OnSelect = (s: Selection) => void;

/* ----------------------------------------------------------------- icons */

const paths: Record<string, ReactNode> = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  pause: (
    <g fill="currentColor">
      <rect x="6" y="4.5" width="4.2" height="15" rx="1" />
      <rect x="13.8" y="4.5" width="4.2" height="15" rx="1" />
    </g>
  ),
  step: (
    <g fill="currentColor">
      <path d="M5 5v14l10-7z" />
      <rect x="16" y="5" width="3" height="14" rx="1" />
    </g>
  ),
  reset: <path d="M12 5a7 7 0 1 1-6.6 4.7M5 4v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  share: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 13v6h14v-6" />
    </g>
  ),
  back: <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  forward: <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  chevron: <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  info: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </g>
  ),
  minus: <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  plus: <path d="M6 12h12M12 6v12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  undo: <path d="M9 7L5 11l4 4M5 11h9a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/* ----------------------------------------------------------------- chips */

export const CATEGORY_HELP: Record<Category, string> = {
  IDENTITY: 'Accounting: true by construction (a sum or a balance).',
  CONTRACT: 'A contract or institutional rule: amortisation, indexation, a legal cap.',
  BEHAVIOUR: 'An assumption about how people or firms act. Open to debate.',
  POLICY: 'A decision rule or setting of an authority.',
};

export function CategoryChip({ category }: { category?: Category }) {
  if (!category) return null;
  return (
    <span className={`chip cat cat-${category.toLowerCase()}`} title={CATEGORY_HELP[category]}>
      {category}
    </span>
  );
}

export function ConceptChip({ info, id, onSelect, dim }: { info: ModelInfo; id: Id; onSelect: OnSelect; dim?: boolean }) {
  const c = info.conceptById.get(id);
  if (!c) return <span className="chip concept missing">{id}</span>;
  return (
    <button type="button" className={`chip concept${dim ? ' dim' : ''}`} onClick={() => onSelect({ kind: 'concept', id })} title={c.oneLiner} aria-label={`Open the idea: ${c.title}`}>
      {c.title}
    </button>
  );
}

export function ConceptChips({ info, ids, onSelect }: { info: ModelInfo; ids: Id[]; onSelect: OnSelect }) {
  const list = [...new Set(ids)];
  if (!list.length) return null;
  return (
    <div className="chips">
      {list.map((id) => (
        <ConceptChip key={id} info={info} id={id} onSelect={onSelect} />
      ))}
    </div>
  );
}

export const BASIS_LABEL: Record<Provenance['basis'], string> = {
  data: 'Data',
  calibrated: 'Calibrated',
  derived: 'Derived',
  assumed: 'Assumed',
  placeholder: 'Placeholder',
};

export function ProvenanceNote({ p }: { p: Provenance }) {
  const isUrl = p.source && /^https?:\/\//.test(p.source);
  return (
    <span className="prov">
      <span className={`chip basis basis-${p.basis}`}>{BASIS_LABEL[p.basis]}</span>
      {p.source &&
        (isUrl ? (
          <a href={p.source} target="_blank" rel="noopener noreferrer" className="prov-src">
            source
          </a>
        ) : (
          <span className="prov-src">{p.source}</span>
        ))}
      {p.vintage && <span className="prov-vintage">{p.vintage}</span>}
      {p.note && <span className="prov-note">{p.note}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------- numbers */

export function Delta({ text, tone }: { text: string; tone: Tone }) {
  return <span className={`mono delta tone-${tone}`}>{text}</span>;
}

/** A diverging bar for a change: −1..1 of the half-width. */
export const ChangeBar = memo(function ChangeBar({ rel }: { rel: number }) {
  const w = Math.abs(rel) * 50;
  return (
    <span className="cbar" aria-hidden="true">
      <span className="cbar-axis" />
      <span className={`cbar-fill ${rel >= 0 ? 'pos' : 'neg'}`} style={rel >= 0 ? { left: '50%', width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} />
    </span>
  );
});

/* ------------------------------------------------------------- disclosure */

export function Disclosure({ title, meta, defaultOpen = false, children, className = '' }: { title: ReactNode; meta?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`disc ${open ? 'open' : ''} ${className}`}>
      <button type="button" className="disc-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="disc-chev">
          <Icon name="chevron" size={14} />
        </span>
        <span className="disc-title">{title}</span>
        {meta && <span className="disc-meta">{meta}</span>}
      </button>
      {open && (
        <div className="disc-body" id={id}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- markdown */

function renderInline(xs: Inline[], key = ''): ReactNode[] {
  return xs.map((x, i) => {
    const k = `${key}${i}`;
    switch (x.type) {
      case 'text':
        return x.text;
      case 'code':
        return <code key={k}>{x.text}</code>;
      case 'strong':
        return <strong key={k}>{renderInline(x.children, k)}</strong>;
      case 'em':
        return <em key={k}>{renderInline(x.children, k)}</em>;
      case 'link':
        return (
          <a key={k} href={x.href} target="_blank" rel="noopener noreferrer">
            {renderInline(x.children, k)}
          </a>
        );
    }
  });
}

export const Markdown = memo(function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'p':
            return <p key={i}>{renderInline(b.children)}</p>;
          case 'h':
            return <h4 key={i}>{renderInline(b.children)}</h4>;
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
});

/** A link-styled button that opens a selection. */
export function NavLink({ selection, onSelect, children, title }: { selection: Selection; onSelect: OnSelect; children: ReactNode; title?: string }) {
  return (
    <button type="button" className="navlink" onClick={() => onSelect(selection)} title={title}>
      {children}
    </button>
  );
}
