import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { FURIGANA_REGEXP } from './regex';
import { parseMatch } from './converter';

// ── Ruby widget ────────────────────────────────────────────────────────────

class RubyWidget extends WidgetType {
  constructor(
    private readonly kanji: string[],
    private readonly furi: string[],
  ) {
    super();
  }

  /** Allows CM6 to skip re-creating the DOM when the widget content is unchanged. */
  eq(other: RubyWidget): boolean {
    return (
      this.kanji.join('\0') === other.kanji.join('\0') &&
      this.furi.join('\0') === other.furi.join('\0')
    );
  }

  toDOM(_view: EditorView): HTMLElement {
    const ruby = document.createElement('ruby');
    ruby.className = 'furi';
    this.kanji.forEach((k, i) => {
      // Mirror buildRubyElement: .furi-char wraps rt (first) then base text
      // so flex-direction:column renders rt on top, kanji on bottom.
      const pair = document.createElement('span');
      pair.className = 'furi-char';
      const rt = document.createElement('rt');
      rt.textContent = this.furi[i];
      pair.appendChild(rt);
      pair.appendText(k);
      ruby.appendChild(pair);
    });
    return ruby;
  }

  /** Allow mouse events to pass through (so clicking near furigana works). */
  ignoreEvent(): boolean {
    return false;
  }
}

// ── View plugin ────────────────────────────────────────────────────────────

class FuriganaViewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy(): void {
    // nothing to clean up
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const selections = [...view.state.selection.ranges];

    // Only iterate visible ranges for efficiency on large documents
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        const matches = Array.from(line.text.matchAll(FURIGANA_REGEXP));

        for (const match of matches) {
          if (match.index === undefined) continue;

          const parsed = parseMatch(match);
          if (!parsed) continue;

          const { kanji, furi } = parsed;
          const matchFrom = line.from + match.index;
          const matchTo   = matchFrom + match[0].length;

          // Don't replace with a widget while the cursor or selection
          // overlaps the raw syntax — let the user edit it freely.
          const hasOverlap = selections.some(
            r => r.to >= matchFrom && r.from <= matchTo,
          );
          if (hasOverlap) continue;

          builder.add(
            matchFrom,
            matchTo,
            Decoration.widget({
              widget: new RubyWidget(kanji, furi),
              // side: 1 means the widget sits just after `matchTo`
              // relative to a zero-length cursor at that position.
              side: 1,
            }),
          );
        }

        pos = line.to + 1;
      }
    }

    return builder.finish();
  }
}

// Export a single shared plugin instance.
// main.ts manages whether this is active based on user settings.
export const viewPlugin = ViewPlugin.fromClass(FuriganaViewPlugin, {
  decorations: v => v.decorations,
});
