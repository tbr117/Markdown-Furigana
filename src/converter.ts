import { FURIGANA_REGEXP } from './regex';

/**
 * Parse a regex match into parallel kanji[] / furi[] arrays.
 * Returns null when the per-character count doesn't match (invalid syntax).
 */
export function parseMatch(
  match: RegExpMatchArray,
): { kanji: string[]; furi: string[] } | null {
  const kanjiStr = match[1];
  const readings = match[2]
    .split(/[|｜]/)
    .slice(1)
    .map(s => s.replace(/^\\/, '').trim());

  // Whole-word mode (one reading for the entire base text)
  if (readings.length === 1) {
    return { kanji: [kanjiStr], furi: readings };
  }

  // Per-character mode: one reading per base character
  const kanji = [...kanjiStr];
  if (kanji.length !== readings.length) return null;

  return { kanji, furi: readings };
}

/**
 * Build a <ruby class="furi"> element.
 *
 * Layout strategy (works in all Obsidian/Electron themes):
 *   ruby.furi            → display:inline-flex row
 *   span.furi-char       → display:inline-flex column (rt on top, base text on bottom)
 *
 * Each kanji[i] gets its own .furi-char containing:
 *   <rt>furi[i]</rt>     ← first child → rendered at top
 *   "kanji[i]"           ← text node   → rendered at bottom
 */
export function buildRubyElement(kanji: string[], furi: string[]): HTMLElement {
  const ruby = document.createElement('ruby');
  ruby.className = 'furi';

  kanji.forEach((k, i) => {
    const pair = document.createElement('span');
    pair.className = 'furi-char';

    // rt must come FIRST in source order so flex-direction:column puts it on top
    const rt = document.createElement('rt');
    rt.textContent = furi[i];
    pair.appendChild(rt);
    pair.appendText(k);

    ruby.appendChild(pair);
  });

  return ruby;
}

/**
 * Walk a Text node, find all furigana matches, and splice <ruby> elements in.
 */
export function convertFurigana(element: Text): Node {
  const text = element.textContent ?? '';
  const matches = Array.from(text.matchAll(FURIGANA_REGEXP));
  if (matches.length === 0) return element;

  let lastNode: Text = element;

  for (const match of matches) {
    const parsed = parseMatch(match);
    if (!parsed) continue;

    const { kanji, furi } = parsed;
    const rubyNode = buildRubyElement(kanji, furi);

    const offset = lastNode.textContent?.indexOf(match[0]) ?? -1;
    if (offset === -1) continue;

    const nodeToReplace = lastNode.splitText(offset);
    lastNode = nodeToReplace.splitText(match[0].length);
    nodeToReplace.replaceWith(rubyNode);
  }

  return element;
}
