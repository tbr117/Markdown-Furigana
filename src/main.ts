/**
 * main.ts — Furigana Pro plugin entry point
 *
 * Lifecycle:
 *   onload  → register post-processor, CM6 extension, settings tab, commands
 *   onunload → remove CSS variables and body classes
 *
 * The CM6 extension array (`this.extension`) is mutated in place and
 * `workspace.updateOptions()` is called whenever the user changes the
 * "show in source/live-preview" settings or switches editor modes.
 * This is the pattern recommended by Obsidian for toggling extensions
 * without reloading the plugin.
 */

import { FileSystemAdapter, MarkdownView, Platform, Plugin } from 'obsidian';
import * as path from 'path';

import {
  FuriganaProSettings,
  DEFAULT_SETTINGS,
  FuriganaSettingsTab,
  applyStyles,
  applyVisibility,
  removeStyles,
} from './settings';
import { createPostProcessor } from './postprocessor';
import { viewPlugin } from './editor-plugin';
import { registerCommands } from './commands';
import { loadTokenizer, resetTokenizer } from './auto-reading';

export default class FuriganaProPlugin extends Plugin {
  settings!: FuriganaProSettings;

  /**
   * Mutable array managed by updateEditorExtension().
   * Registered once; Obsidian re-reads it on every updateOptions() call.
   */
  private readonly extension: typeof viewPlugin[] = [];

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async onload(): Promise<void> {
    await this.loadSettings();

    // Apply stored styles and visibility immediately so there's no flash
    applyStyles(this.settings);
    applyVisibility(this.settings.furiganaVisible);

    // Reading View (post-processor on rendered HTML)
    this.registerMarkdownPostProcessor(createPostProcessor());

    // Live Preview / Source Mode (CodeMirror 6 decoration)
    this.registerEditorExtension(this.extension);
    this.updateEditorExtension();

    // Re-evaluate the extension whenever the user switches editor modes
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.updateEditorExtension();
      }),
    );

    // Settings UI
    this.addSettingTab(new FuriganaSettingsTab(this.app, this));

    // Commands + ribbon icon
    registerCommands(this);

    // Pre-warm the tokenizer in the background so the first "add furigana"
    // command is fast.  Failures are silent here — the command will retry
    // and show a proper notice.
    if (this.settings.autoReadingEnabled && Platform.isDesktop) {
      const dictPath = this.getDictPath();
      if (dictPath) {
        loadTokenizer(dictPath).catch(() => {/* handled inside loadTokenizer */});
      }
    }
  }

  onunload(): void {
    removeStyles();
    resetTokenizer();
  }

  // ── Settings persistence ─────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ── Editor extension management ──────────────────────────────────────────

  /**
   * Push or pop the view plugin based on the current editor mode and settings.
   *
   * Must be called:
   *   • when settings change (showInSourceMode / showInLivePreview)
   *   • when the active view changes (layout-change event)
   */
  updateEditorExtension(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    // getState() can return undefined if no markdown file is open
    const isSourceMode = view?.getState()?.source === true;

    const shouldShow = isSourceMode
      ? this.settings.showInSourceMode
      : this.settings.showInLivePreview;

    this.extension.length = 0;
    if (shouldShow) {
      this.extension.push(viewPlugin);
    }

    this.app.workspace.updateOptions();
  }


  // ── Utilities ────────────────────────────────────────────────────────────

  /**
   * Absolute path to the plugin's `dict/` directory.
   * Returns null on mobile (no file-system access for kuromoji).
   */
  getDictPath(): string | null {
    if (!Platform.isDesktop) return null;
    const adapter = this.app.vault.adapter as FileSystemAdapter;
    return path.join(adapter.getBasePath(), this.manifest.dir ?? '', 'dict');
  }
}
