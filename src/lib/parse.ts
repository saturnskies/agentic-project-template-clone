/** Parses a pasted decklist in the formats deck sites export (see the v1 spec, "Paste a list"). */

export interface ParsedLine {
  qty: number;
  name: string;
  set?: string;
  number?: string;
  isCommander: boolean;
  line: number;
}

export interface ParseError {
  line: number;
  text: string;
  reason: string;
}

const HEADER = /^(commander|commanders|companion|deck|main ?deck|mainboard|main|sideboard|maybeboard|maybe|considering|tokens|creatures?|instants?|sorcery|sorceries|artifacts?|enchantments?|planeswalkers?|lands?|battles?|other)\b\s*:?\s*(\(\d+\))?\s*:?$/i;
const SKIPPED_SECTIONS = /^(sideboard|maybeboard|maybe|considering|tokens)/i;
const QTY = /^(\d+)\s*[xX]?\s+(.+)$/;
const PRINTING = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9★†-]+))?$/;
const MARKER = /\s+\*[A-Z]+\*/g;

export function parseDeckList(text: string): { entries: ParsedLine[]; errors: ParseError[] } {
  const entries: ParsedLine[] = [];
  const errors: ParseError[] = [];
  let section: 'commander' | 'deck' | 'skip' = 'deck';

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;

    const header = trimmed.match(HEADER);
    if (header) {
      const word = header[1];
      section = /^commanders?$/i.test(word) ? 'commander' : SKIPPED_SECTIONS.test(word) ? 'skip' : 'deck';
      return;
    }
    if (section === 'skip') return;

    let rest = trimmed;
    let isCommander = section === 'commander';
    if (/\*CMDR\*/i.test(rest)) isCommander = true;
    rest = rest.replace(MARKER, '').trim();

    let qty = 1;
    const q = rest.match(QTY);
    if (q) {
      qty = Number(q[1]);
      rest = q[2];
    }
    if (qty < 1 || qty > 999) {
      errors.push({ line, text: trimmed, reason: 'Quantity must be between 1 and 999' });
      return;
    }

    let set: string | undefined;
    let number: string | undefined;
    const p = rest.match(PRINTING);
    if (p) {
      set = p[1].toLowerCase();
      number = p[2];
      rest = rest.slice(0, p.index).trim();
    }

    const entry: ParsedLine = { qty, name: rest, isCommander, line };
    if (set) entry.set = set;
    if (number) entry.number = number;
    entries.push(entry);
  });

  return { entries, errors };
}
