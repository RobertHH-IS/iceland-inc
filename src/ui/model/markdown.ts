/**
 * A tiny markdown reader for concept bodies: paragraphs, "- " and "1. " lists, "#" headings,
 * **bold**, *italic*, `code` and [links](url). It returns plain data that the view renders with
 * React elements, so no HTML string is ever injected.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'h'; level: number; children: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; items: Inline[][] };

/** Only http(s) and mailto links are kept; anything else renders as text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:|mailto:)/i.test(h) ? h : null;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ type: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/.exec(rest))) {
      flush();
      out.push({ type: 'strong', children: parseInline(m[1]) });
      i += m[0].length;
    } else if ((m = /^\*([^*\s][^*]*?)\*/.exec(rest)) || (m = /^_([^_\s][^_]*?)_(?![A-Za-z0-9])/.exec(rest))) {
      flush();
      out.push({ type: 'em', children: parseInline(m[1]) });
      i += m[0].length;
    } else if ((m = /^`([^`]+)`/.exec(rest))) {
      flush();
      out.push({ type: 'code', text: m[1] });
      i += m[0].length;
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      const href = safeHref(m[2]);
      if (href) out.push({ type: 'link', href, children: parseInline(m[1]) });
      else out.push({ type: 'text', text: m[1] });
      i += m[0].length;
    } else {
      buf += src[i];
      i++;
    }
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of src.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(lines[0]);
    if (h && lines.length === 1) {
      blocks.push({ type: 'h', level: h[1].length, children: parseInline(h[2]) });
      continue;
    }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      blocks.push({ type: 'ul', items: lines.map((l) => parseInline(l.replace(/^\s*[-*]\s+/, ''))) });
      continue;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({ type: 'ol', items: lines.map((l) => parseInline(l.replace(/^\s*\d+[.)]\s+/, ''))) });
      continue;
    }
    blocks.push({ type: 'p', children: parseInline(lines.join(' ')) });
  }
  return blocks;
}

/** Plain text of inline nodes (for tests and aria labels). */
export function inlineText(xs: Inline[]): string {
  return xs.map((x) => (x.type === 'text' || x.type === 'code' ? x.text : inlineText(x.children))).join('');
}
