/**
 * commands.ts
 *
 * Registers all plugin commands and the ribbon button.
 * The plugin instance is passed in to avoid a circular import at runtime;
 * `import type` is used so TypeScript resolves the type at compile time only.
 */

import { Editor, MarkdownFileInfo, MarkdownView, Notice } from 'obsidian';
import type FuriganaProPlugin from './main';
import {
  addFuriganaToText,
  removeFuriganaFromText,
  getReadingString,
  isTokenizerReady,
  loadTokenizer,
} from './auto-reading';
import { applyVisibility } from './settings';

// ── Cursor utilities ────────────────────────────────────────────────────────

/** Characters treated as part of a Japanese "word" for cursor-based detection. */
const JP_CHAR = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

/**
 * Expand left and right from `ch` to capture a contiguous run of Japanese
 * characters (kana + kanji + Hangul).
 *
 * If the character at `ch` is not Japanese, tries `ch - 1` so the command works
 * when the cursor is just past the end of a word.
 *
 * Returns null if no Japanese character is found.
 */
function findJapaneseWordAtPos(
  line: string,
  ch: number,
): { text: string; from: number; to: number } | null {
  let pos = ch;
  if (pos >= line.length || !JP_CHAR.test(line[pos])) {
    pos = ch - 1;
  }
  if (pos < 0 || !JP_CHAR.test(line[pos])) return null;

  let from = pos;
  while (from > 0 && JP_CHAR.test(line[from - 1])) from--;

  let to = pos + 1;
  while (to < line.length && JP_CHAR.test(line[to])) to++;

  return { text: line.slice(from, to), from, to };
}

interface FuriganaBlock {
  kanji: string;
  reading: string;   // empty string → no reading yet
  from: number;      // index of opening { in line
  to: number;        // index just after closing }
}

/**
 * Scan `line` for complete {kanji|...} blocks and return the one that
 * contains `ch`, or null if the cursor is not inside any block.
 */
function findFuriganaBlockAtCursor(
  line: string,
  ch: number,
): FuriganaBlock | null {
  const BLOCK = /(?:\{|\uFF5B)([\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]+)((?:(?:\||\uFF5C)[^}\uFF5D]*)*)(?:\}|\uFF5D)/g;
  let m: RegExpExecArray | null;
  while ((m = BLOCK.exec(line)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (ch >= from && ch <= to) {
      // Strip the leading "|" from the reading capture group
      const reading = m[2].replace(/^[|｜]/, '').trim();
      return { kanji: m[1], reading, from, to };
    }
  }
  return null;
}

/**
 * Check whether the cursor sits immediately after an *unclosed* "{kanji|"
 * fragment, e.g. the user typed "{漢字|" and hasn't added the closing "}" yet.
 *
 * Returns the kanji text if found, null otherwise.
 */
function findPartialFuriganaBeforeCursor(
  line: string,
  ch: number,
): { kanji: string; openBrace: number } | null {
  // $-anchor: the pattern must end exactly at the cursor
  const PARTIAL =
    /(?:\{|\uFF5B)([\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]+)(?:\||\uFF5C)$/.exec(
      line.slice(0, ch),
    );
  if (!PARTIAL) return null;
  return { kanji: PARTIAL[1], openBrace: PARTIAL.index };
}

// ── Shared helper ────────────────────────────────────────────────────────────

/** Ensure tokenizer is loaded; return false (with notices) on failure. */
async function ensureTokenizer(plugin: FuriganaProPlugin): Promise<boolean> {
  if (isTokenizerReady()) return true;

  const dictPath = plugin.getDictPath();
  if (!dictPath) {
    new Notice('Furigana Pro: Auto-reading is only available on desktop.');
    return false;
  }

  new Notice('Furigana Pro: Loading Japanese dictionary…');
  return loadTokenizer(dictPath);
}

/** Core logic shared by the ribbon button and the annotate-at-cursor command. */
async function doAnnotateAtCursor(
  editor: Editor,
  plugin: FuriganaProPlugin,
): Promise<void> {
  if (!plugin.settings.autoReadingEnabled) {
    new Notice('Furigana Pro: Auto-reading is disabled in settings.');
    return;
  }

  const ok = await ensureTokenizer(plugin);
  if (!ok) return;

  const cursor = editor.getCursor();
  const selection = editor.getSelection();

  // ── Case 1: text is selected → annotate the whole selection ──────────────
  if (selection) {
    const result = addFuriganaToText(selection);
    if (result === selection) {
      new Notice('Furigana Pro: No kanji found in selection.');
      return;
    }
    editor.replaceSelection(result);
    return;
  }

  const line = editor.getLine(cursor.line);

  // ── Case 2: cursor is right after an unclosed "{kanji|" → complete it ────
  //   e.g.  "{漢字|▌"  →  "{漢字|かんじ}"
  const partial = findPartialFuriganaBeforeCursor(line, cursor.ch);
  if (partial) {
    const reading = getReadingString(partial.kanji);
    if (!reading) {
      new Notice('Furigana Pro: Could not determine reading.');
      return;
    }
    editor.replaceRange(`${reading}}`, cursor, cursor);
    return;
  }

  // ── Case 3: cursor is inside a complete "{kanji|...}" block ──────────────
  const block = findFuriganaBlockAtCursor(line, cursor.ch);
  if (block) {
    if (block.reading) {
      new Notice(
        'Furigana Pro: Already annotated. Use "Remove furigana" first to re-annotate.',
      );
      return;
    }
    // Empty reading — fill it in
    const reading = getReadingString(block.kanji);
    if (!reading) {
      new Notice('Furigana Pro: Could not determine reading.');
      return;
    }
    editor.replaceRange(
      `{${block.kanji}|${reading}}`,
      { line: cursor.line, ch: block.from },
      { line: cursor.line, ch: block.to },
    );
    return;
  }

  // ── Case 4: cursor on / adjacent to a bare Japanese word ─────────────────
  //   e.g.  "漢▌字"  or  "漢字▌"  →  "{漢字|かんじ}"
  const word = findJapaneseWordAtPos(line, cursor.ch);
  if (!word) {
    new Notice('Furigana Pro: No Japanese text found at cursor position.');
    return;
  }

  const result = addFuriganaToText(word.text);
  if (result === word.text) {
    new Notice('Furigana Pro: No kanji found — text is already kana-only.');
    return;
  }
  editor.replaceRange(
    result,
    { line: cursor.line, ch: word.from },
    { line: cursor.line, ch: word.to },
  );
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerCommands(plugin: FuriganaProPlugin): void {

  // ── PRIMARY: annotate at cursor (the main hotkey command) ─────────────────
  // Handles four cases in order: selection → partial "{kanji|" → inside block → word at cursor
  plugin.addCommand({
    id: 'annotate-at-cursor',
    name: 'Annotate Japanese at cursor',
    editorCallback: async (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
      await doAnnotateAtCursor(editor, plugin);
    },
  });

  // ── Toggle visibility ──────────────────────────────────────────────────────
  // Bind this to a hotkey via Settings → Hotkeys → search "Furigana"
  plugin.addCommand({
    id: 'toggle-furigana-visibility',
    name: 'Toggle furigana visibility',
    callback: async () => {
      plugin.settings.furiganaVisible = !plugin.settings.furiganaVisible;
      applyVisibility(plugin.settings.furiganaVisible);
      await plugin.saveSettings();
      new Notice(
        plugin.settings.furiganaVisible ? 'Furigana: visible' : 'Furigana: hidden',
      );
    },
  });

  // ── Remove furigana from selection ────────────────────────────────────────
  plugin.addCommand({
    id: 'remove-furigana-from-selection',
    name: 'Remove furigana from selection',
    editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
      const selection = editor.getSelection();
      if (!selection) {
        new Notice('Furigana Pro: Select some text first.');
        return;
      }
      const stripped = removeFuriganaFromText(selection);
      if (stripped === selection) {
        new Notice('Furigana Pro: No furigana syntax found in selection.');
        return;
      }
      editor.replaceSelection(stripped);
    },
  });

  // ── Insert bare template at cursor ────────────────────────────────────────
  // Useful if you want to type the reading manually.
  plugin.addCommand({
    id: 'insert-furigana-template',
    name: 'Insert furigana template {|}',
    editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
      const cursor = editor.getCursor();
      editor.replaceRange('{|}', cursor);
      // Place cursor inside { } so the user can type the kanji
      editor.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
    },
  });

  // ── Ribbon icon ────────────────────────────────────────────────────────────
  // Same smart logic as annotate-at-cursor: works on selection or cursor word.
  plugin.addRibbonIcon(
    'languages',
    'Annotate Japanese at cursor (Furigana Pro)',
    async () => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice('Furigana Pro: Open a markdown file first.');
        return;
      }
      await doAnnotateAtCursor(view.editor, plugin);
    },
  );
}
