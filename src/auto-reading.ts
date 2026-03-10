/**
 * auto-reading.ts
 *
 * Wraps kuromoji (Japanese morphological analyser) to provide automatic
 * kanji → hiragana reading generation.
 *
 * Works only on desktop (Electron) where the dict files can be read from disk.
 * All public functions fail gracefully on mobile / when the dict is missing.
 */

import { Notice, Platform } from 'obsidian';
import { toHiragana } from 'wanakana';

// ── Minimal kuromoji type declarations ─────────────────────────────────────
// (avoids a dependency on @types/kuromoji which may not be published)

interface KuromojiToken {
  surface_form: string;
  reading?: string;
}

interface KuromojiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

interface KuromojiBuilder {
  build(cb: (err: Error | null, tokenizer: KuromojiTokenizer) => void): void;
}

interface KuromojiModule {
  builder(options: { dicPath: string }): KuromojiBuilder;
}

// kuromoji is a CJS module; cast via unknown to satisfy our local type declarations
import kuromojiLib from 'kuromoji';
const kuromoji = kuromojiLib as unknown as KuromojiModule;

// ── State ──────────────────────────────────────────────────────────────────

let tokenizer: KuromojiTokenizer | null = null;
let loadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the kuromoji tokenizer from `dictPath`.
 * Safe to call multiple times — subsequent calls are no-ops once loaded.
 * Returns true on success.
 */
export async function loadTokenizer(dictPath: string): Promise<boolean> {
  if (loadState === 'ready') return true;
  if (loadState === 'loading') return false;
  if (loadState === 'failed') return false;

  if (!Platform.isDesktop) {
    new Notice(
      'Furigana Pro: Auto-reading requires the desktop app.\n' +
      'The feature is not available on mobile.',
    );
    return false;
  }

  loadState = 'loading';
  try {
    await new Promise<void>((resolve, reject) => {
      kuromoji.builder({ dicPath: dictPath }).build((err, t) => {
        if (err) reject(err);
        else { tokenizer = t; resolve(); }
      });
    });
    loadState = 'ready';
    new Notice('Furigana Pro: Dictionary loaded ✓');
    return true;
  } catch (err) {
    // Reset to 'idle' so the user can retry after fixing the dict path
    loadState = 'idle';
    console.error('Furigana Pro: tokenizer load failed', err);
    new Notice(
      'Furigana Pro: Could not load the Japanese dictionary.\n' +
      'Make sure the dict/ folder is inside the plugin directory.\n' +
      'See Settings → Furigana Pro for instructions.',
      8000,
    );
    return false;
  }
}

/** True once the tokenizer has been successfully loaded. */
export function isTokenizerReady(): boolean {
  return loadState === 'ready' && tokenizer !== null;
}

/** Reset state — used when the dict path changes or the plugin reloads. */
export function resetTokenizer(): void {
  tokenizer = null;
  loadState = 'idle';
}

// ── Text transformation ────────────────────────────────────────────────────

/**
 * Convert a katakana string to hiragana using wanakana.
 * Romaji characters are passed through unchanged.
 */
function kataToHira(kata: string): string {
  return toHiragana(kata, { passRomaji: true });
}

/**
 * Returns true if a string contains at least one CJK character
 * (the kinds of characters that actually need a reading).
 */
function containsKanji(text: string): boolean {
  return /[\u2E80-\u2FFF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(text);
}

/**
 * Analyse `text` with kuromoji and wrap tokens that have kanji
 * in `{surface|hiragana}` syntax.
 *
 * Tokens without a kanji (pure kana, punctuation, Latin, etc.) are
 * returned unchanged.
 *
 * Returns the original text unchanged if the tokenizer is not loaded.
 */
export function addFuriganaToText(text: string): string {
  if (!tokenizer) return text;

  const tokens = tokenizer.tokenize(text);
  return tokens
    .map(token => {
      const surface = token.surface_form;
      const reading = token.reading;

      // No reading info, or the token is already kana/latin
      if (!reading || !containsKanji(surface)) return surface;

      const hira = kataToHira(reading);
      // Reading equals surface when the token is already hiragana
      if (hira === surface) return surface;

      return `{${surface}|${hira}}`;
    })
    .join('');
}

/**
 * Return the flat hiragana reading for `text` without any {…|…} wrapping.
 * Useful when you already know the kanji and just want to fill in the reading.
 *
 * Example: "漢字" → "かんじ"
 *
 * Returns an empty string if the tokenizer is not loaded.
 */
export function getReadingString(text: string): string {
  if (!tokenizer) return '';
  return tokenizer
    .tokenize(text)
    .map(t => (t.reading ? kataToHira(t.reading) : t.surface_form))
    .join('');
}

/**
 * Strip all furigana syntax from `text`, leaving only the base text.
 * Works whether or not the tokenizer is loaded.
 *
 * Example: "{漢字|かんじ}です" → "漢字です"
 */
export function removeFuriganaFromText(text: string): string {
  return text.replace(
    /(?:\{|\uFF5B)((?:[\u2E80-\u2FFF\u3000-\u312F\u3190-\u319F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF])+)(?:(?:\\?(?:\||\uFF5C))[^}\uFF5D]*)+(?:\}|\uFF5D)/gmu,
    '$1',
  );
}
