# Furigana Pro — Plugin Plan

---

## 1. Original Plugin Analysis

### What it does

`obsidian-markdown-furigana` renders the compact `{kanji|reading}` syntax into HTML `<ruby>/<rt>` elements for both Reading View and Live Preview / Source Mode.

**Syntax:**

| Input | Result |
|---|---|
| `{漢字\|かんじ}` | Whole-word ruby annotation |
| `{漢\|かん\|字\|じ}` | Per-character annotation (N readings = N base chars) |
| `{北京\|Běi\|jīng}` | Works for Pinyin, Bopomofo, Korean, etc. |

**Architecture — two rendering paths:**

1. **Reading View** — `MarkdownPostProcessor` walks the DOM of rendered `p, h1–h6, ol, ul, table` nodes, splits Text nodes at match boundaries, and inserts `<ruby>` elements.
2. **Live Preview / Source Mode** — A CodeMirror 6 `ViewPlugin` iterates document lines, finds regex matches, and adds `Decoration.widget` entries (`RubyWidget`). Widgets are suppressed when the cursor overlaps the match, letting the user edit raw syntax.

**Regex:**

```
/{((?:[\u2E80-\uA4CF\uFF00-\uFFEF])+)((?:\\?\|[^ -\/{-~:-@\[-`]*)+)}/gm
```

The base text is constrained to CJK Unified Ideographs + CJK radicals + Halfwidth/Fullwidth Forms. The reading segments are any non-ASCII-punctuation characters after `|`.

---

## 2. Open Pull Request Analysis

### PR #25 — "Add option to disable rendering furigana in Source Mode"

**Author:** amadeusdotpng | **Age:** ~19 months | **Size:** +74 / -4

**What it adds:**
- A `FuriganaSettings` interface and `loadSettings/saveSettings` cycle
- A `PluginSettingTab` with a single toggle: "Show Furigana in Source Mode"
- The CM6 `viewPlugin` is dynamically pushed/popped from an `extension[]` array, which is the correct Obsidian API pattern for toggling editor extensions without reloading
- A `layout-change` workspace event ensures Live Preview always renders furigana regardless of the setting (only Source Mode is affected)

**Quality assessment:** The approach is architecturally correct. One fragility: `this.app.workspace.getActiveViewOfType(MarkdownView)?.getState()` can be `undefined` if no markdown file is open — the `.source` access would throw. Needs a null guard.

> [!success] Verdict: Include — it is the right pattern and solves a real UX problem (Issue #23). Fix the null guard before merging.

---

### PR #30 — "Modified regular expression to include all non-Latin characters"

**Author:** ReaderGuy42 | **Age:** ~8 months | **Size:** +2 / -2

**What it changes:**

Old regex base group: `[\u2E80-\uA4CF\uFF00-\uFFEF]` — CJK only
New regex base group: `[\u0000-\uFFFF]` — the entire BMP, including all ASCII

Also adds full-width delimiter support: `｛` (U+FF5B), `｜` (U+FF5C), `｝` (U+FF5D) as alternatives to `{`, `|`, `}`.

**Assessment:**
- The full-width delimiter support (`｛漢字｜かんじ｝`) is genuinely useful for Japanese users whose IME defaults to full-width brackets. **This part is worth including.**
- The `[\u0000-\uFFFF]` change is a semantic regression: it would match `{hello|world}` as furigana, breaking any text that happens to use `{word|word}` for other purposes (e.g. template literals, some Markdown extensions). The original restriction to CJK ranges was intentional and should be kept.

> [!warning] Verdict: Partial — include only the full-width delimiter support, reject the regex broadening.

---

## 3. Known Issues to Fix

From 13 open issues:

- **Regex too narrow** — doesn't handle Kana-only base text (e.g. `{ひらがな|hiragana}`) since kana U+3040–U+309F and katakana U+30A0–U+30FF are outside the original range. → Expand the base-character range to include kana.
- **Source Mode null-guard crash** (PR #25 related)
- **No styling control** — `<ruby>` renders at browser defaults; no way to adjust size, colour, or font
- **No visibility toggle** — once rendered, users can't hide furigana without disabling the plugin
- **No auto-reading** — users must manually type every reading
- **No editor autocomplete / command** for inserting furigana syntax
- **No way to use full-width IME brackets** (PR #30 — fixed by partial merge)

---

## 4. New Plugin — "Furigana Pro"

### 4.1 Scope

| Category | Included |
|---|---|
| All original rendering functionality | ✅ |
| PR #25 Source Mode toggle | ✅ (fixed) |
| PR #30 Full-width delimiters | ✅ |
| Expanded regex (kana base text) | ✅ |
| Custom styling system | ✅ |
| Furigana visibility toggle | ✅ |
| Auto kanji→hiragana via kuromoji | ✅ |
| Editor command + ribbon button | ✅ |
| Editor autocomplete hint | ✅ |

---

### 4.2 Syntax

Keep the original format. No breaking changes.

```
{漢字|かんじ}           whole-word annotation
{漢|かん|字|じ}         per-character annotation
｛漢字｜かんじ｝         full-width bracket variant (new)
{ひらがな|hiragana}     kana base text (newly supported)
{漢字|}                 empty reading → auto-fill trigger (new)
```

---

### 4.3 Project Structure

```
obsidian-furigana-pro/
├── src/
│   ├── main.ts              Plugin entry point, loads/unloads everything
│   ├── settings.ts          Settings types, defaults, SettingTab UI
│   ├── regex.ts             Single source-of-truth for REGEXP constant
│   ├── converter.ts         Core {kanji|reading} → <ruby> DOM logic
│   ├── postprocessor.ts     Reading View MarkdownPostProcessor
│   ├── editor-plugin.ts     CM6 ViewPlugin for Live Preview / Source Mode
│   ├── auto-reading.ts      Kuromoji wrapper — kanji → hiragana
│   └── commands.ts          Obsidian commands + ribbon button
├── styles.css               CSS variables + base ruby styles
├── manifest.json
├── versions.json
└── package.json
```

---

### 4.4 Settings

All settings live in a `FuriganaProSettings` interface and are exposed via a `PluginSettingTab`.

```typescript
interface FuriganaProSettings {
  // Rendering
  showInSourceMode: boolean;       // default: true
  showInLivePreview: boolean;      // default: true

  // Visibility toggle
  furiganaVisible: boolean;        // default: true (toggled by command)

  // Styling — furigana (rt)
  furiganaFontSize: string;        // default: '0.6em'
  furiganaColor: string;           // default: '' (inherit)
  furiganaFontFamily: string;      // default: '' (inherit)
  furiganaOpacity: string;         // default: '1'

  // Styling — base text
  baseColor: string;               // default: '' (inherit)
  baseFontFamily: string;          // default: '' (inherit)

  // Auto-reading
  autoReadingEnabled: boolean;     // default: true
  autoReadingOnInsert: boolean;    // default: true  (fill on command)
  autoReadingOnEmpty: boolean;     // default: false (fill {} with empty rt)
}
```

The Settings tab is organised into three sections:

1. **Rendering** — Source Mode toggle, Live Preview toggle
2. **Appearance** — font size slider (0.3em–1.2em), colour pickers, font family input, opacity slider. A live preview `<ruby>` element updates in real time.
3. **Auto Reading** — enable/disable kuromoji, trigger mode

---

### 4.5 CSS Variables System

`styles.css` injects CSS variables on the `.furi` ruby element. Settings are applied by writing to `document.body.style.setProperty(...)`.

```css
/* styles.css */
ruby.furi {
  color: var(--furigana-base-color, inherit);
  font-family: var(--furigana-base-font, inherit);
}

ruby.furi rt {
  font-size: var(--furigana-font-size, 0.6em);
  color: var(--furigana-color, inherit);
  font-family: var(--furigana-font, inherit);
  opacity: var(--furigana-opacity, 1);
  transition: opacity 0.2s ease;
}

/* Visibility toggle — body class approach */
body.furigana-hidden ruby.furi rt {
  opacity: 0;
  pointer-events: none;
  user-select: none;
}
```

When settings change, `main.ts` calls a single `applyStyles()` function that sets all variables at once. This approach is zero-cost at render time; no DOM mutations needed after initial render.

---

### 4.6 Regex — Fixed

```typescript
// src/regex.ts
// Base text: CJK Unified/Radicals + Kana (hira+kata) + Bopomofo + Hangul + CJK Compat
// Delimiters: ASCII {|} OR full-width ｛｜｝
export const FURIGANA_REGEXP = /(?:\{|\uFF5B)((?:[\u2E80-\uA4CF\u3040-\u30FF\uAC00-\uD7AF\uFF00-\uFFEF])+)((?:(?:\\?(?:\||\uFF5C))[^\}\uFF5D]*)+)(?:\}|\uFF5D)/gmu;
```

Changes from original:
- Added `\u3040-\u30FF` (hiragana + katakana) to base text range
- Added `\uAC00-\uD7AF` (Hangul syllables) to base text range
- Added full-width `｛｜｝` delimiters
- Kept the deliberate exclusion of Latin/ASCII from the base text group
- Added `u` flag for proper Unicode handling

---

### 4.7 Auto Kanji → Hiragana

**Library:** `kuromoji` (Japanese morphological analyser, runs entirely offline in Node/Electron)

**Approach:**

```typescript
// src/auto-reading.ts
import kuromoji from 'kuromoji';

let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;

export async function loadTokenizer(dictPath: string): Promise<void> {
  // dictPath points to bundled dictionary inside the plugin folder
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dictPath }).build((err, t) => {
      if (err) reject(err);
      else { tokenizer = t; resolve(); }
    });
  });
}

export function getReadings(text: string): string {
  if (!tokenizer) return '';
  const tokens = tokenizer.tokenize(text);
  return tokens.map(t => t.reading ?? t.surface_form).join('');
}

export function buildFurigana(text: string): string {
  // Returns {surface|reading} or original text if no kanji found
  if (!tokenizer) return text;
  const tokens = tokenizer.tokenize(text);
  return tokens.map(t => {
    const surface = t.surface_form;
    const reading = t.reading;
    if (!reading || reading === surface) return surface;
    // Convert katakana reading to hiragana
    const hira = toHiragana(reading);
    return `{${surface}|${hira}}`;
  }).join('');
}
```

**Dictionary bundling:** The kuromoji dictionary (~7 MB compressed) is placed in `dict/` inside the plugin folder. On first load, if the dict is absent, the plugin shows a notice: "Downloading furigana dictionary (7 MB)…" and fetches it from a CDN, then caches it. Users on air-gapped machines can download it manually.

**Commands that use auto-reading:**

- **"Add furigana to selection"** — tokenises selected text, wraps each token in `{surface|reading}` syntax, replaces selection
- **"Remove furigana from selection"** — strips all `{...|...}` from selection, leaving only the base text

---

### 4.8 Commands

Registered via `this.addCommand(...)`:

| Command ID | Name | Default Hotkey |
|---|---|---|
| `toggle-furigana-visibility` | Toggle furigana visibility | — |
| `add-furigana-to-selection` | Add furigana to selection | — |
| `remove-furigana-from-selection` | Remove furigana from selection | — |
| `insert-furigana-template` | Insert `{|}` at cursor | — |

A ribbon icon (📖 or a ruby character) triggers "Add furigana to selection" on the active editor selection, or shows a notice if nothing is selected.

---

### 4.9 Editor Autocomplete Hint

When the user types `{` followed by at least one CJK character followed by `|`, the plugin optionally triggers an auto-complete suggestion that fills in the hiragana reading. This uses a CM6 `CompletionSource` and is gated behind the `autoReadingOnEmpty` setting.

---

### 4.10 Rendering — Fixed Null Guard

PR #25's null guard issue is fixed:

```typescript
// In layout-change handler
this.app.workspace.on('layout-change', () => {
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  const isSourceMode = view?.getState()?.source === true;

  this.extension.length = 0;
  if (this.settings.showInLivePreview && !isSourceMode) {
    this.extension.push(viewPlugin);
  } else if (this.settings.showInSourceMode && isSourceMode) {
    this.extension.push(viewPlugin);
  }
  this.app.workspace.updateOptions();
});
```

---

### 4.11 Dependencies

| Package | Purpose | Bundle impact |
|---|---|---|
| `obsidian` | Plugin API | peer dep, excluded from bundle |
| `@codemirror/state` | CM6 state | already in Obsidian |
| `@codemirror/view` | CM6 view + decorations | already in Obsidian |
| `@codemirror/autocomplete` | Editor completions | already in Obsidian |
| `kuromoji` | Japanese morphological analyser | ~500 KB JS + dict |
| `wanakana` | Katakana → hiragana conversion | ~60 KB |

`kuromoji` and `wanakana` are the only net-new dependencies. Both are MIT licensed.

---

### 4.12 Implementation Phases

#### Phase 1 — Foundation (no new deps)
1. Set up TypeScript + Rollup build from scratch (clean repo)
2. Port and fix `FURIGANA_REGEXP` (expanded ranges, full-width delimiters)
3. Port and fix `convertFurigana` + `postprocessor` (Reading View)
4. Port and fix `viewPlugin` + `RubyWidget` (Live Preview / Source Mode)
5. Implement settings system (PR #25 pattern, fixed null guard)
6. Implement CSS variables + `applyStyles()` on settings change
7. Add `styles.css` with all variables
8. Add visibility toggle command + body class approach

#### Phase 2 — Styling UI
9. Build `PluginSettingTab` with three sections
10. Add live ruby preview widget inside settings panel
11. Font size slider, colour inputs, opacity slider
12. Source Mode / Live Preview render toggles

#### Phase 3 — Auto Reading
13. Add `wanakana` for katakana→hiragana conversion
14. Add `kuromoji` + lazy tokenizer loading (bundled dict or download-on-demand)
15. Implement `buildFurigana(text)` and `getReadings(text)` in `auto-reading.ts`
16. Add "Add furigana to selection" command
17. Add "Remove furigana from selection" command
18. Add ribbon button

#### Phase 4 — Polish
19. Add CM6 autocomplete suggestion on `{kanji|`
20. Add "Insert `{|}` at cursor" template command
21. Write README with all syntax, settings, and screenshots
22. Test on Windows / Mac / Linux Obsidian builds
23. Submit to Obsidian community plugins

---

### 4.13 manifest.json

```json
{
  "id": "furigana-pro",
  "name": "Furigana Pro",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Rich furigana rendering with auto kanji→hiragana, custom styling, and visibility toggle.",
  "author": "",
  "authorUrl": "",
  "isDesktopOnly": false
}
```

---

## 5. Summary of Decisions

| Decision | Rationale |
|---|---|
| Keep `{kanji\|reading}` syntax | Zero breaking changes; widely known |
| Add `｛｜｝` full-width support | Real need for Japanese IME users (PR #30 partial) |
| Reject `[\u0000-\uFFFF]` regex | Too broad; `{hello\|world}` would incorrectly render |
| Expand to kana + Hangul ranges | Fixes legitimate issues; consistent with plugin purpose |
| CSS variables + body class toggle | Zero render-time cost; works across themes |
| Kuromoji offline dict | No API key, no internet required after first run |
| Wanakana for kana conversion | Small, focused, well-maintained |
| PR #25 pattern for mode toggle | Correct Obsidian API approach; just needs null guard |
