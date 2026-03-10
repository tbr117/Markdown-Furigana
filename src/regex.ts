/**
 * Core regular expression for furigana syntax.
 *
 * Matches: {base|reading}  or  ｛base｜reading｝  (full-width brackets)
 * Also:    {base|r1|r2|r3} for per-character annotation
 *
 * Capture groups:
 *   [1]  Base text  — CJK, kana (hiragana/katakana), Hangul,
 *                     Bopomofo, and Halfwidth/Fullwidth Forms.
 *   [2]  Reading(s) — one or more "|reading" segments.
 *
 * Unicode ranges in group 1:
 *   \u2E80-\u2FFF  CJK radicals supplement, Kangxi radicals, Ideographic desc.
 *   \u3000-\u303F  CJK symbols and punctuation (e.g. 〒)
 *   \u3040-\u309F  Hiragana
 *   \u30A0-\u30FF  Katakana
 *   \u3100-\u312F  Bopomofo
 *   \u3130-\u318F  Hangul compatibility jamo
 *   \u3190-\u319F  Kanbun
 *   \u31F0-\u31FF  Katakana phonetic extensions
 *   \u3400-\u4DBF  CJK unified ideographs extension A
 *   \u4E00-\u9FFF  CJK unified ideographs (main block)
 *   \uA000-\uA4CF  Yi syllables / radicals
 *   \uAC00-\uD7AF  Hangul syllables
 *   \uF900-\uFAFF  CJK compatibility ideographs
 *   \uFF00-\uFFEF  Halfwidth and fullwidth forms
 *
 * Delimiters: ASCII { } | or full-width ｛ ｝ ｜ (U+FF5B / FF5D / FF5C)
 */
export const FURIGANA_REGEXP =
  /(?:\{|\uFF5B)((?:[\u2E80-\u2FFF\u3000-\u312F\u3190-\u319F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF])+)((?:(?:\\?(?:\||\uFF5C))[^\}\uFF5D]*)+)(?:\}|\uFF5D)/gmu;
